import assert from 'node:assert/strict';
import test from 'node:test';
import { scorePresentation } from './score-presentation.mjs';

test('shows unbounded scores as a direct threshold multiple without capping', () => {
  const typical = scorePresentation(0.03, 0.15);
  assert.equal(typical.comparison, '0.2× the review threshold');
  assert.equal(typical.reviewRecommended, false);
  const rawExtremeScore = 482142.3125;
  const extreme = scorePresentation(rawExtremeScore, 0.0684283);
  assert.equal(extreme.scoreText, '482,142.31');
  assert.equal(extreme.comparison, '7,045,950× the review threshold');
  assert.equal(extreme.reviewRecommended, true);
  assert.equal(rawExtremeScore, 482142.3125);
});

test('uses the API strict-greater-than rule at and around the threshold', () => {
  assert.equal(scorePresentation(0.15, 0.15).reviewRecommended, false);
  assert.equal(scorePresentation(0.150001, 0.15).reviewRecommended, true);
  assert.equal(scorePresentation(0.149999, 0.15).reviewRecommended, false);
});

test('handles a zero threshold without inventing an infinite multiple', () => {
  assert.equal(scorePresentation(0, 0).comparison, 'At the threshold');
  assert.equal(scorePresentation(0.01, 0).comparison, 'Threshold is zero; ratio is undefined');
  assert.throws(() => scorePresentation(Number.NaN, 1), /finite/);
});
