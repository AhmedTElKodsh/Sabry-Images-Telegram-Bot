const assert = require('assert');
const fs = require('fs'), vm = require('vm');
const {evaluateSemanticRetrieval} = require('../tools/evaluate_semantic_retrieval');

function fixture() {
  const recordIds = Array.from({length:50}, (_,i) => 'r' + (i + 1));
  const queries = Array.from({length:15}, (_,i) => ({
    id:'q' + (i + 1), text:'query ' + (i + 1), language:i < 8 ? 'en' : 'ar',
    relevant_ids:['r' + (i + 1)], lexical_results:['r50'], semantic_results:['r' + (i + 1)]
  }));
  return {approval:{dataset_id:'dataset-1',model:'model-1',approved_at:'2026-10-19T00:00:00.000Z',
      expires_at:'2026-12-01T00:00:00.000Z',record_ids:recordIds,queries:queries.map(q=>q.text)},
    indexed_record_ids:recordIds.slice(), queries};
}

let input = fixture(), result = evaluateSemanticRetrieval(input, {now:'2026-10-19T09:00:00.000Z'});
assert.equal(result.status, 'PASS');
assert.equal(result.metrics.relevant_in_top_five, 1);
assert.ok(result.metrics.ndcg_at_10_gain >= 0.10);

input = fixture(); delete input.approval;
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('MISSING_APPROVAL'));
input = fixture(); input.approval.queries[0] = 'different';
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('QUERY_SET_MISMATCH'));
input = fixture(); input.indexed_record_ids.pop();
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('SILENT_OMISSIONS'));
input = fixture(); input.queries.forEach(q => {q.lexical_results = q.semantic_results.slice();});
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('NDCG_GAIN_BELOW_0_10'));
input = fixture(); input.queries.slice(0,2).forEach(q => {q.semantic_results = ['r50'];});
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('RELEVANT_TOP_FIVE_BELOW_0_90'));
input = fixture(); input.queries.slice(0,4).forEach(q => {q.semantic_results = ['r50'].concat(q.semantic_results);});
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('FALSE_POSITIVE_RATE_ABOVE_0_20'));
input = fixture(); input.queries.filter(q => q.language === 'ar').forEach(q => {q.semantic_results = ['r50'];});
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('LANGUAGE_GAP_ABOVE_0_10'));
input = fixture(); input.queries[0].provider_failed = true;
assert.ok(evaluateSemanticRetrieval(input).reasons.includes('PROVIDER_FAILURE_RATE_ABOVE_0_05'));

const sandbox = {console, Date, Set}; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'), sandbox);
const config = {datasetId:'dataset-1',model:'model-1',approvedAt:'2026-10-19T00:00:00.000Z',
  expiresAt:'2026-12-01T00:00:00.000Z',recordIds:fixture().approval.record_ids,
  queries:fixture().approval.queries,querySet:new Set(fixture().approval.queries)};
result = evaluateSemanticRetrieval(fixture(), {now:'2026-10-19T09:00:00.000Z'});
result.evaluation_id = 'EVAL-1'; result.integration_approved_by = 'product-owner';
result.integration_approved_at = '2026-10-19T10:00:00.000Z';
result.expires_at = '2026-11-01T00:00:00.000Z';
assert.equal(sandbox.semanticEvaluationGatePasses_({
  SEMANTIC_EVALUATION_RESULT_JSON:JSON.stringify(result),
  SEMANTIC_TEACHER_SEARCH_EVALUATION_ID:'EVAL-1'
}, config, 'query 1', new Date('2026-10-20T00:00:00.000Z')), true);
assert.equal(sandbox.semanticEvaluationGatePasses_({
  SEMANTIC_EVALUATION_RESULT_JSON:JSON.stringify(result)
}, config, 'query 1', new Date('2026-10-20T00:00:00.000Z')), false);
console.log('PASS: semantic metrics, quality thresholds, exact configuration and explicit activation gate');
