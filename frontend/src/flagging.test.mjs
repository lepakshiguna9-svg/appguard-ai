import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApplicationFlags, filterFlaggedRows, summarizeFlags, validateScoringInput } from './flagging.mjs';

const base = (overrides = {}) => ({
  id: 'SYN-1', application: {
    policy_type: 'auto', requested_coverage: 40000, deductible: 500,
    payment_frequency: 'monthly', channel: 'web', submission_velocity_24h: 1,
    recent_change_count: 0, duplicate_identity_reference_count: 0,
    identity_document_consistency: 0.98, application_detail_consistency: 0.97,
    contact_reference_consistency: 0.96, beneficiary_reference_consistency: 0.99,
    repeat_submission_count: 0,
  }, score: 0.1, threshold: 0.1, review: false, ...overrides,
});

test('generates model and statistical flags only when their conditions are met', () => {
  assert.deepEqual(buildApplicationFlags(base()).map(({ code }) => code), ['within_range']);
  const equal = buildApplicationFlags(base({ score: 0.31, threshold: 0.1, review: true }));
  assert(equal.some((flag) => flag.code === 'high_statistical_deviation'));
  assert(equal.some((flag) => flag.code === 'review_suggested'));
  const above = buildApplicationFlags(base({ score: 0.32, threshold: 0.1, review: true }));
  assert(above.some((flag) => flag.code === 'review_suggested'));
});

test('generates separate synthetic consistency, behavior and data-quality flags from supplied values', () => {
  const flags = buildApplicationFlags(base({
    application: { ...base().application, identity_document_consistency: 0.79, duplicate_identity_reference_count: 2, submission_velocity_24h: 6, repeat_submission_count: 4 },
    dataQualityIssues: [{ field: 'policy_type', actual: 'missing', reference: 'required', explanation: 'Missing field.' }],
  }));
  assert.deepEqual(new Set(flags.map(({ code }) => code)), new Set(['within_range', 'synthetic_consistency_deviation', 'repeated_opaque_reference_count', 'unusual_submission_behaviour', 'data_quality_warning']));
  assert.equal(validateScoringInput({ ...base().application, requested_coverage: -1 }).some((issue) => issue.field === 'requested_coverage'), true);
});

test('filters by flag category and severity and summarizes per-application counts', () => {
  const rows = [
    base(),
    base({ id: 'SYN-2', score: 0.5, threshold: 0.1, review: true, application: { ...base().application, submission_velocity_24h: 8 } }),
    base({ id: 'SYN-3', score: undefined, threshold: undefined, review: undefined, dataQualityIssues: [{ field: 'channel', actual: 'missing', reference: 'required', explanation: 'Missing.' }] }),
  ];
  assert.deepEqual(filterFlaggedRows(rows, { category: 'consistency' }), []);
  assert.equal(filterFlaggedRows(rows, { category: 'behavior', severity: 'warning' }).length, 1);
  assert.equal(filterFlaggedRows(rows, { category: 'data_quality' }).length, 1);
  assert.deepEqual(summarizeFlags(rows), { totalFlagged: 2, highDeviation: 1, consistencyRelated: 0, behaviorRelated: 1, dataQualityWarnings: 1, withinRange: 1 });
});
