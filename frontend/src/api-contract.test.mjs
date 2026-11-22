import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApplicationsPayload, normalizeBatchPayload, normalizeDemoPayload } from './api-contract.mjs';

const sample = {
  application_id: 'DEMO-NORM-001', policy_type: 'auto', requested_coverage: 50000,
  deductible: 500, payment_frequency: 'monthly', channel: 'web',
  submission_velocity_24h: 1, recent_change_count: 0,
};

test('normalizes model-supported fields and maps the batch scoring contract', () => {
  const records = normalizeDemoPayload({ count: 1, samples: [sample], disclaimer: 'synthetic' });
  assert.equal(records[0].id, 'DEMO-NORM-001');
  assert.equal(records[0].application.requested_coverage, 50000);
  const [scored] = normalizeBatchPayload({ results: [{
    application_id: records[0].id, anomaly_score: 0.09,
    threshold: 0.15, review_recommended: false,
    top_deviations: [{ feature: 'requested_coverage', residual: 0.4 }],
  }] }, records);
  assert.equal(scored.score, 0.09);
  assert.equal(scored.threshold, 0.15);
  assert.equal(scored.review, false);
  assert.deepEqual(scored.deviations[0], { feature: 'requested_coverage', residual: 0.4 });
  assert.equal(normalizeDemoPayload({ samples: [{ ...sample, application_id: 'DEMO-ANOM-001' }] })[0].demoGroup, undefined);
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
  assert.throws(() => normalizeBatchPayload({ results: [{ application_id: sample.application_id, anomaly_score: 'bad' }] }, records), /finite anomaly_score/);
});

test('matches current batch results by application ID and strips sidecar labels from API records', () => {
  const input = Array.from({ length: 100 }, (_, index) => ({
    ...sample,
    application_id: `APP-${index + 1}`,
    demo_label: 'unusual_synthetic',
    scenario: 'test-only',
  }));
  const records = normalizeApplicationsPayload(input);
  assert.equal(records[0].application.demo_label, undefined);
  assert.equal(records[0].application.scenario, undefined);
  const validResults = records.map((record) => ({ application_id: record.id, anomaly_score: 0.1, threshold: 0.2, review_recommended: false }));
  assert.throws(() => normalizeBatchPayload({ results: [{ ...validResults[0], application_id: 'WRONG-ID' }, ...validResults.slice(1)] }, records), /unexpected application_id/);
  assert.throws(() => normalizeBatchPayload({ results: [{ anomaly_score: 0.1 }, ...validResults.slice(1)] }, records), /missing application_id/);
  const reversed = normalizeBatchPayload({ results: [...validResults].reverse() }, records);
  assert.equal(reversed.find((record) => record.id === 'APP-1').application.requested_coverage, 50000);
});
