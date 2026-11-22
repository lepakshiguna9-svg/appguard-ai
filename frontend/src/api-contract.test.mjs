import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBatchPayload, normalizeDemoPayload } from './api-contract.mjs';

const sample = {
  application_id: 'DEMO-NORM-001', policy_type: 'auto', coverage_amount: 50000,
  deductible_amount: 500, premium_frequency: 'monthly', application_channel: 'online_direct',
  applicant_age: 36, annual_income_estimate: 78000, prior_application_count: 0,
  recent_address_changes_count: 0, property_or_vehicle_age: 4,
  beneficiary_relation: 'spouse', declared_credit_tier: 'good', description: 'Synthetic baseline sample',
};

test('normalizes the documented samples response and maps the batch scoring contract', () => {
  const records = normalizeDemoPayload({ count: 1, samples: [sample], disclaimer: 'synthetic' });
  assert.equal(records[0].id, 'DEMO-NORM-001');
  assert.equal(records[0].application.coverage_amount, 50000);
  const [scored] = normalizeBatchPayload({ results: [{
    status: 'success', application_id: records[0].id, anomaly_score: 0.09,
    calibrated_threshold: 0.15, review_recommended: false,
    top_deviations: [{ feature_name: 'coverage_amount', reconstruction_error: 0.4 }],
  }] }, records);
  assert.equal(scored.score, 0.09);
  assert.equal(scored.threshold, 0.15);
  assert.equal(scored.review, false);
  assert.deepEqual(scored.deviations[0], { feature: 'coverage_amount', residual: 0.4 });
});

test('continues to accept the older records response and score field names', () => {
  const records = normalizeDemoPayload({ records: [{
    sample_id: 'B-001', demo_group: 'baseline', policy_type: 'auto', requested_coverage: 18000,
    deductible: 500, payment_frequency: 'monthly', channel: 'web',
    submission_velocity_24h: 1, recent_change_count: 0,
  }] });
  const [scored] = normalizeBatchPayload({ results: [{ anomaly_score: 0.01, threshold: 0.05,
    review_recommended: false, top_deviations: [{ feature: 'policy_type', residual: 0.2 }] }] }, records);
  assert.equal(scored.id, 'B-001');
  assert.equal(scored.threshold, 0.05);
  assert.equal(scored.deviations[0].feature, 'policy_type');
});

test('returns clear errors instead of allowing malformed values to reach render mapping', () => {
  assert.throws(() => normalizeDemoPayload({ count: 2, samples: null }), /expected a "samples" array/);
  assert.throws(() => normalizeDemoPayload({ samples: [{ application_id: 'DEMO-X' }] }), /missing required field/);
  const records = normalizeDemoPayload({ samples: [sample] });
  assert.throws(() => normalizeBatchPayload({ results: [] }, records), /0 results for 1 samples/);
  assert.throws(() => normalizeBatchPayload({ results: [{ anomaly_score: 'bad' }] }, records), /finite anomaly_score/);
});
