var hash = require("../../utils/hash");
var sprintf = require("sprintf").sprintf;
var multilabelutils = require('./multilabelutils');
var _ = require("underscore")._;
var PrecisionRecall = require('../../utils/PrecisionRecall');
var partitions = require('../../utils/partitions');

/* ThresholdClassifier - classifier that converts multi-class classifier to multi-label classifier by finding
 * the best appropriate threshold. 
 * @param opts
 *            devsetsize (0.1) - size of the development set from the training set, needed to identify the appropriate threshold, by default 0.1
 *            evaluateMeasureToMaximize (mandatory) - function that helps evaluate the performance of a given threshold, usually F1 measure.
 *			  multiclassClassifier - multi-class classifier used for classification.
 * @author Vasily Konovalov
 */

var ThresholdClassifier = function(opts) {
	
	opts = opts || {};

	if (!('multiclassClassifierType' in opts)) {
		console.dir(opts);
		throw new Error("opts must contain multiclassClassifierType");
	}
	if (!opts.multiclassClassifierType) {
		console.dir(opts);
		throw new Error("opts.multiclassClassifierType is null");
	}

	if (!('evaluateMeasureToMaximize' in opts)) {
		console.dir(opts);
		throw new Error("opts must contain evaluateMeasureToMaximize");
	}
	if (!opts.evaluateMeasureToMaximize) {
		console.dir(opts);
		throw new Error("opts.evaluateMeasureToMaximize is null");
	}
	
	this.multiclassClassifier = new opts.multiclassClassifierType();
	this.devsetsize = typeof opts.devsetsize !== 'undefined' ? opts.devsetsize : 0.1;
	this.evaluateMeasureToMaximize = opts.evaluateMeasureToMaximize;
}

ThresholdClassifier.prototype = {

	trainOnline: function(sample, labels) {
		throw new Error("ThresholdClassifier does not support online training");
	},

	/**
	 * Train the classifier with all the given documents and identify the best possible threshold
	 * simply by running over all relevant scores and determining the value of feedback function
	 * (F1 by default)
	 * 
	 * @param dataset
	 *            an array with objects of the format: 
	 *            {input: sample1, output: [class11, class12...]}
	 * @author Vasily Konovalov
	 * 
	 */
	trainBatch : function(dataset) {

		thresholds=[]
		best_performances=[]

		partitions.partitions_consistent(dataset, 3, (function(trainSet, testSet, index) { 	 
			this.multiclassClassifier.trainBatch(trainSet);
			result = this.receiveScores(testSet)
			performance = this.CalculatePerformance(result[0], testSet, result[1])
			best_performances.push(performance)
		}).bind(this))

		console.log(best_performances)
		//average_threshold = this.average(_.pluck(best_performances, 'Threshold'))
		average_threshold = this.median(_.pluck(best_performances, 'Threshold'))

		average_performances = []
		partitions.partitions_consistent(dataset, 3, (function(trainSet, testSet, index) {
			this.multiclassClassifier.trainBatch(trainSet);
			performance = this.EvaluateThreshold(testSet, average_threshold)
			average_performances.push(performance)
		}).bind(this))

		
		console.log(average_performances)

		process.exit(0)

		performance = this.EvaluateThreshold(dataset, this.average(thresholds))

		console.log(performance.calculateStats)
		
		process.exit(0)

		this.devsetsize = 1
		if (this.devsetsize == 1)
			{
				validset = dataset
			}
			else
			{
				clonedataset = partitions.partition(dataset, 1, Math.round(dataset.length*this.devsetsize))
				dataset = clonedataset['train']
				validset = clonedataset['test']
			}
		
		this.multiclassClassifier.trainBatch(dataset);

		list_of_scores = [];
		FN=0

		for (var i=0; i<validset.length; ++i) 
		{
 			var scoresVector = this.multiclassClassifier.classify(validset[i].input, false, true);
 			
 			for (score in scoresVector)
 			{
 				if (validset[i].output.indexOf(scoresVector[score][0])>-1)
 				{
 					scoresVector[score].push("+")
 					FN+=1
 				}
 				else {scoresVector[score].push("-")}

 				scoresVector[score].push(i)	
			}
 			
 			list_of_scores = list_of_scores.concat(scoresVector)
 		}	

		list_of_scores.sort((function(index){
		    return function(a, b){
	        return (a[index] === b[index] ? 0 : (a[index] < b[index] ? 1 : -1));
		    };
		})(1))


		// sortBy implements NUMERIC sort, by default .sort() ALPHABETIC sort
		// list_of_scores = _.sortBy(list_of_scores, function(num){ return num; });
		// list_of_scores = _.uniq(list_of_scores, true)

		threshold = this.EvaluateThreshold(list_of_scores, validset, FN)

		
	},

	receiveScores: function(dataset) {
		list_of_scores = [];
		FN=0
		for (var i=0; i<dataset.length; ++i) 
		{
 			var scoresVector = this.multiclassClassifier.classify(dataset[i].input, false, true);
 			console.log(scoresVector)

 			for (score in scoresVector)
 			{
 				if (dataset[i].output.indexOf(scoresVector[score][0])>-1)
 				{
 					scoresVector[score].push("+")
 					FN+=1
 				}
 				else {scoresVector[score].push("-")}

 				scoresVector[score].push(i)	
			}

 			list_of_scores = list_of_scores.concat(scoresVector)
  		}	

  		// list_of_scores = [['d',4],['b',2],['a',1],['c',3]]

		list_of_scores.sort((function(index){
		    return function(a, b){
	        return (a[index] === b[index] ? 0 : (a[index] < b[index] ? 1 : -1));
		    };
		})(1))

		console.log(list_of_scores)


		return [list_of_scores, FN]
	},
	
	EvaluateThreshold: function(testSet, threshold){
		console.log("_________________________________")

 		var currentStats = new PrecisionRecall();

		_.each(testSet, function(value, key, list){ 
			console.log(value)
			scoresVector = this.multiclassClassifier.classify(value['input'], false, true);
 			output =  multilabelutils.normalizeClasses(value['output']);
 	     	actualClasses = multilabelutils.mapScoresVectorToMultilabelResult(scoresVector, false, false, threshold);
			// console.log('expected')
			// console.log(output)
			// console.log('gievn')
			console.log(actualClasses)
			console.log(scoresVector)
	 	    currentStats.addCases(output, actualClasses, true);
	 	    console.log(currentStats)
 		}, this)	

		currentStats.calculateStats()

		output = {}
		output['Threshold'] = threshold
		output['F1'] = currentStats.F1
		output['Accuracy'] = currentStats.Accuracy
		output['TP'] = currentStats.TP
		output['FP'] = currentStats.FP
		output['FN'] = currentStats.FN
 		
 		return output

		},
	
	CalculatePerformance: function(list_of_scores, testSet, FN){
		current_set=[]

		TRUE = 0
		FP = 0
		TP = 0

		result = []
		
		for (var th=0; th<list_of_scores.length; ++th) {

			if (list_of_scores[th][2]=="+") {TP+=1; FN-=1}
			if (list_of_scores[th][2]=="-") {FP+=1;}

			// console.log(list_of_scores[th])
			// console.log("TP "+TP+" FP "+FP+" FN "+FN)

			index_in_testSet = list_of_scores[th][3]

			if (this.is_equal_set(current_set[index_in_testSet], testSet[index_in_testSet]['output'])) 
			{TRUE-=1}
			
			if (!current_set[index_in_testSet])
			{current_set[index_in_testSet] = [list_of_scores[th][0]]}
			else
			{current_set[index_in_testSet].push(list_of_scores[th][0])}

 			if (this.is_equal_set(current_set[index_in_testSet], testSet[index_in_testSet]['output'])) 
			{TRUE+=1 }
			
 			PRF = calculate_PRF(TP, FP, FN)
 			PRF['Accuracy'] = TRUE/testSet.length
 			PRF['Threshold'] = list_of_scores[th][1]
 
 			result[list_of_scores[th][1]] = PRF
 			}

			optial_F1=0
			for (i in result)
			{
				if (result[i]['F1'] > optial_F1)
				{
					index = i
					optial_F1 = result[i]['F1']
				}
			}
			 			
 			return result[index]
 		
	},
	// Calculating the median of an array basically involves sorting the array and picking the middle number. 
	// If it’s an even amount of numbers you take the two numbers in the middle and average them.
	median: function(values) {
 	    values.sort(function(a,b) {return a - b;} );
	    var half = Math.floor(values.length/2);
	    if(values.length % 2)
	        return values[half];
	    else
	        return (values[half-1] + values[half]) / 2.0;
	},

	variance: function(list)
	{
		sum = _.reduce(list, function(memo, num){ return memo + num; }, 0);
		exp = sum/list.length
		sum2 = _.reduce(list, function(memo, num){ return memo + num*num; }, 0);
		exp2 = sum2/list.length
		return exp2-exp*exp
	},

	average: function(list)
	{
		sum = _.reduce(list, function(memo, num){ return memo + num; }, 0);
		return sum/list.length
	},

	is_equal_set: function(set1, set2)
	{
	if ((!set1) && (set2)) {return false}
	if (set1.length != set2.length) {return false}
	if ((_.difference(set1, set2).length==0) && (_.difference(set2, set1).length==0))
		{return true}
	else
		{return false}
	},

	classify: function(sample, explain) {
		return this.multiclassClassifier.classify(sample, explain, /*withScores=*/false);
	},
	
	getAllClasses: function() {
		return this.multiclassClassifier.getAllClasses();
	},

	toJSON : function() {
		return this.multiclassClassifier.toJSON();
	},

	fromJSON : function(json) {
		this.multiclassClassifier.fromJSON(json);
	},
	
	setFeatureLookupTable: function(featureLookupTable) {
		if (this.multiclassClassifier.setFeatureLookupTable)
			this.multiclassClassifier.setFeatureLookupTable(featureLookupTable);
	},
}

function calculate_PRF(TP, FP, FN)
	{
	stats = {}
	stats['TP']=TP
	stats['FP']=FP
	stats['FN']=FN
	stats['Precision'] = (TP + FP == 0? 0: TP/(TP+FP))
	stats['Recall'] = (TP + FN == 0? 0: TP/(TP+FN))
	stats['F1'] = (stats['Precision'] + stats['Recall'] == 0? 0: 2*stats['Precision']*stats['Recall']/(stats['Precision'] + stats['Recall']))
	return stats
	}

module.exports = ThresholdClassifier;
