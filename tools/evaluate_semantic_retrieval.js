'use strict';

const fs = require('fs');

function normalized(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dcgAt10(results, relevant) {
  return (results || []).slice(0, 10).reduce((sum, id, index) =>
    sum + (relevant.has(String(id)) ? 1 / Math.log2(index + 2) : 0), 0);
}

function ndcgAt10(results, relevant) {
  const idealCount = Math.min(10, relevant.size);
  if (!idealCount) return 0;
  let ideal = 0;
  for (let index = 0; index < idealCount; index++) ideal += 1 / Math.log2(index + 2);
  return dcgAt10(results, relevant) / ideal;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function evaluateSemanticRetrieval(input, options = {}) {
  const reasons = [];
  const approval = input && input.approval;
  const now = new Date(options.now || Date.now());
  if (!approval || !approval.dataset_id || !approval.model || !approval.approved_at ||
      !approval.expires_at || !Array.isArray(approval.record_ids) || !Array.isArray(approval.queries)) {
    return {status:'FAIL', reasons:['MISSING_APPROVAL'], metrics:{}};
  }
  const approvedAt = new Date(approval.approved_at), approvalExpiresAt = new Date(approval.expires_at);
  if (isNaN(now.getTime()) || isNaN(approvedAt.getTime()) || isNaN(approvalExpiresAt.getTime()) ||
      approvalExpiresAt <= now || approvedAt >= approvalExpiresAt) {
    reasons.push('APPROVAL_EXPIRED_OR_INVALID');
  }
  const approvedRecords = approval.record_ids.map(String);
  const indexed = Array.isArray(input.indexed_record_ids) ? input.indexed_record_ids.map(String) : [];
  if (approvedRecords.length < 50 || approvedRecords.length > 100) reasons.push('IMAGE_COUNT_OUT_OF_RANGE');
  if (new Set(approvedRecords).size !== approvedRecords.length ||
      approvedRecords.some(id => !new Set(indexed).has(id))) reasons.push('SILENT_OMISSIONS');
  const queries = Array.isArray(input.queries) ? input.queries : [];
  if (queries.length < 15 || queries.length > 20) reasons.push('QUERY_COUNT_OUT_OF_RANGE');
  const approvedQueries = approval.queries.map(normalized);
  const actualQueries = queries.map(query => normalized(query.text));
  if (approvedQueries.length !== actualQueries.length ||
      approvedQueries.some((query, index) => query !== actualQueries[index]) ||
      new Set(approvedQueries).size !== approvedQueries.length) reasons.push('QUERY_SET_MISMATCH');

  const evaluated = queries.map(query => {
    const relevant = new Set((query.relevant_ids || []).map(String));
    const semantic = query.provider_failed ? [] : (query.semantic_results || []).map(String);
    const lexical = (query.lexical_results || []).map(String);
    return {
      language: normalized(query.language), providerFailed: query.provider_failed === true,
      lexicalNdcg: ndcgAt10(lexical, relevant), semanticNdcg: ndcgAt10(semantic, relevant),
      topFive: semantic.slice(0, 5).some(id => relevant.has(id)),
      falsePositive: semantic.length > 0 && !relevant.has(semantic[0])
    };
  });
  const rate = predicate => evaluated.length ? evaluated.filter(predicate).length / evaluated.length : 0;
  const relevantTopFive = rate(item => item.topFive);
  const falsePositiveRate = rate(item => item.falsePositive);
  const providerFailureRate = rate(item => item.providerFailed);
  const lexicalNdcg = mean(evaluated.map(item => item.lexicalNdcg));
  const semanticNdcg = mean(evaluated.map(item => item.semanticNdcg));
  const languageRates = {};
  ['ar','en'].forEach(language => {
    const rows = evaluated.filter(item => item.language === language);
    languageRates[language] = rows.length ? rows.filter(item => item.topFive).length / rows.length : 0;
  });
  const languageGap = Math.abs(languageRates.ar - languageRates.en);
  const metrics = {
    image_count: approvedRecords.length,
    query_count: queries.length,
    silent_omissions: approvedRecords.filter(id => !new Set(indexed).has(id)).length,
    lexical_ndcg_at_10: lexicalNdcg,
    semantic_ndcg_at_10: semanticNdcg,
    ndcg_at_10_gain: semanticNdcg - lexicalNdcg,
    relevant_in_top_five: relevantTopFive,
    false_positive_top_result_rate: falsePositiveRate,
    arabic_relevant_in_top_five: languageRates.ar,
    english_relevant_in_top_five: languageRates.en,
    language_gap: languageGap,
    provider_failure_rate: providerFailureRate
  };
  if (metrics.silent_omissions) reasons.push('SILENT_OMISSIONS');
  if (metrics.ndcg_at_10_gain < 0.10) reasons.push('NDCG_GAIN_BELOW_0_10');
  if (metrics.relevant_in_top_five < 0.90) reasons.push('RELEVANT_TOP_FIVE_BELOW_0_90');
  if (metrics.false_positive_top_result_rate > 0.20) reasons.push('FALSE_POSITIVE_RATE_ABOVE_0_20');
  if (metrics.language_gap > 0.10) reasons.push('LANGUAGE_GAP_ABOVE_0_10');
  if (metrics.provider_failure_rate > 0.05) reasons.push('PROVIDER_FAILURE_RATE_ABOVE_0_05');
  return {
    status: reasons.length ? 'FAIL' : 'PASS',
    reasons: Array.from(new Set(reasons)),
    evaluated_at: now.toISOString(),
    dataset_id: String(approval.dataset_id), model: String(approval.model),
    approved_at: isNaN(approvedAt.getTime()) ? String(approval.approved_at) : approvedAt.toISOString(),
    approval_expires_at: isNaN(approvalExpiresAt.getTime())
      ? String(approval.expires_at) : approvalExpiresAt.toISOString(),
    record_ids: approvedRecords, queries: approval.queries.map(String), metrics
  };
}

if (require.main === module) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: node tools/evaluate_semantic_retrieval.js <evaluation.json>');
    process.exit(2);
  }
  const result = evaluateSemanticRetrieval(JSON.parse(fs.readFileSync(path, 'utf8')));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

module.exports = {evaluateSemanticRetrieval};
