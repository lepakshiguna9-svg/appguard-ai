import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateLabeledScores } from './evaluation.mjs';

function scored(applicationId, review) {
  return { id: applicationId, application: { application_id: applicationId }, score: 0.2, threshold: 0.15, review };
}
function sidecar(rows) { return { labels: rows.map(([application_id, demo_label]) => ({ application_id, demo_label })) }; }

test('joins shuffled scores and labels by stable application ID and computes all four outcomes', () => {
  const result = evaluateLabeledScores([
    scored('T2', false), scored('U2', true), scored('T1', true), scored('U1', false),
  ], sidecar([
    ['U1', 'unusual_synthetic'], ['T1', 'typical_synthetic'],
    ['U2', 'unusual_synthetic'], ['T2', 'typical_synthetic'],
  ]));
  assert.deepEqual(result.counts, { truePositives: 1, falseNegatives: 1, falsePositives: 1, trueNegatives: 1 });
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
  assert.equal(result.falsePositiveRate, 0.5);
  assert.equal(result.accuracy, 0.5);
  assert.equal(result.f1, 0.5);
  assert.equal(result.rocAuc, 0.5); // all raw scores tie, so AUC gives half credit
  assert.deepEqual(result.confusionMatrix, { truePositive: 1, falseNegative: 1, falsePositive: 1, trueNegative: 1 });
  assert.equal(result.rows.find((row) => row.id === 'U1').evaluationOutcome, 'missed_false_negative');
  assert.equal(result.rows.find((row) => row.id === 'T1').evaluationOutcome, 'flagged_false_positive');
});

test('rejects label IDs that do not match scored IDs and missing labels', () => {
  assert.throws(
    () => evaluateLabeledScores([scored('APP-1', true)], sidecar([['WRONG-ID', 'unusual_synthetic']])),
    /Missing synthetic label for application_id "APP-1"/,
  );
  assert.throws(
    () => evaluateLabeledScores([scored('APP-1', true)], sidecar([])),
    /expected a labels array/,
  );
  assert.throws(
    () => evaluateLabeledScores([scored('APP-1', true), scored('APP-2', false)], sidecar([['APP-1', 'unusual_synthetic']])),
    /Missing synthetic label for application_id "APP-2"/,
  );
});

test('reports zero-denominator metrics as null rather than NaN or infinity', () => {
  const noFlags = evaluateLabeledScores([scored('T1', false), scored('U1', false)], sidecar([
    ['T1', 'typical_synthetic'], ['U1', 'unusual_synthetic'],
  ]));
  assert.equal(noFlags.counts.falseNegatives, 1);
  assert.equal(noFlags.precision, null); // no flagged predictions
  assert.equal(noFlags.recall, 0);
  assert.equal(noFlags.falsePositiveRate, 0);
  assert.equal(noFlags.f1, 0);
  assert.equal(noFlags.accuracy, 0.5);
  assert.equal(noFlags.rocAuc, 0.5);

  const noTypicalRecords = evaluateLabeledScores([scored('U1', true)], sidecar([['U1', 'unusual_synthetic']]));
  assert.equal(noTypicalRecords.falsePositiveRate, null); // no actual negatives
  assert.equal(noTypicalRecords.rocAuc, null);
});

test('rejects duplicate IDs, unknown labels, and unscored examples', () => {
  assert.throws(() => evaluateLabeledScores([scored('APP-1', true), scored('APP-1', false)], sidecar([['APP-1', 'unusual_synthetic']])), /duplicate application_id/);
  assert.throws(() => evaluateLabeledScores([scored('APP-1', true)], sidecar([['APP-1', 'fraud']])), /unsupported demo_label/);
  assert.throws(() => evaluateLabeledScores([{ ...scored('APP-1', true), scoreError: 'invalid' }], sidecar([['APP-1', 'unusual_synthetic']])), /score or review recommendation is unavailable/);
});
