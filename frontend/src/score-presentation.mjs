const numberFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 12 });
const ratioFormat = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 6 });

export function scorePresentation(score, threshold) {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    throw new Error('Anomaly score must be a finite, non-negative number.');
  }
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0) {
    throw new Error('Review threshold must be a finite, non-negative number.');
  }
  const reviewRecommended = score > threshold;
  const ratio = threshold === 0 ? null : score / threshold;
  const comparison = ratio === null
    ? (score === threshold ? 'At the threshold' : 'Threshold is zero; ratio is undefined')
    : `${ratioFormat.format(ratio)}× the review threshold`;
  return {
    scoreText: numberFormat.format(score),
    thresholdText: numberFormat.format(threshold),
    ratio,
    comparison,
    reviewRecommended,
    relation: score === threshold ? 'at' : reviewRecommended ? 'above' : 'below',
  };
}
