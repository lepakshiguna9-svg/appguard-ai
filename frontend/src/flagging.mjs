const REQUIRED = [
  'policy_type', 'requested_coverage', 'deductible', 'payment_frequency', 'channel',
  'submission_velocity_24h', 'recent_change_count',
];
const NUMERIC_RULES = {
  requested_coverage: [0, 100_000_000, false],
  deductible: [0, 10_000_000, true],
  submission_velocity_24h: [0, 10_000, true],
  recent_change_count: [0, 10_000, true],
  duplicate_identity_reference_count: [0, 100, true],
  identity_document_consistency: [0, 1, true],
  application_detail_consistency: [0, 1, true],
  contact_reference_consistency: [0, 1, true],
  beneficiary_reference_consistency: [0, 1, true],
  repeat_submission_count: [0, 10_000, true],
};

function fmt(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : String(value ?? 'missing');
}

/** Mirrors the current Pydantic request constraints so invalid rows are withheld from scoring. */
export function validateScoringInput(application) {
  const issues = [];
  for (const field of REQUIRED) {
    const value = application?.[field];
    const valid = typeof value === 'string' ? value.length >= 1 && value.length <= 40 : false;
    if (!valid) issues.push({ field, actual: fmt(value), reference: 'non-empty string, max length 40', explanation: 'The API requires a non-empty category string of at most 40 characters.' });
  }
  for (const [field, [min, max, inclusiveMin]] of Object.entries(NUMERIC_RULES)) {
    const value = application?.[field];
    if (value === undefined && !REQUIRED.includes(field)) continue;
    const valid = typeof value === 'number' && Number.isFinite(value) && (inclusiveMin ? value >= min : value > min) && value <= max;
    if (!valid) issues.push({ field, actual: fmt(value), reference: `${inclusiveMin ? '≥' : '>'} ${min} and ≤ ${max}`, explanation: 'The submitted value is missing, not finite numeric data, or outside the API’s accepted range.' });
  }
  return issues;
}

export function buildApplicationFlags(row) {
  const application = row?.application || {};
  const hasApiFlags = Array.isArray(row?.flags);
  const flags = hasApiFlags ? [...row.flags] : [];
  if (!hasApiFlags) {
  if (row?.review === true && Number.isFinite(row.score) && Number.isFinite(row.threshold)) {
    flags.push({ code: 'review_suggested', category: 'model', name: 'Review Suggested', severity: 'review', triggeringValue: row.score, reference: `> ${row.threshold}`, explanation: 'The returned reconstruction score is above the calibrated review threshold; a human should assess it.' });
  } else if (row?.review === false && Number.isFinite(row.score) && Number.isFinite(row.threshold)) {
    flags.push({ code: 'within_range', category: 'model', name: 'Within Range', severity: 'info', triggeringValue: row.score, reference: `≤ ${row.threshold}`, explanation: 'The returned reconstruction score is at or below the calibrated review threshold.' });
  }
  if (Number.isFinite(row?.score) && Number.isFinite(row?.threshold) && row.threshold > 0 && row.score >= 3 * row.threshold) {
    flags.push({ code: 'high_statistical_deviation', category: 'statistical', name: 'High Statistical Deviation', severity: 'high', triggeringValue: row.score, reference: `≥ 3× threshold (${3 * row.threshold})`, explanation: 'The raw reconstruction score is at least three times the calibrated threshold; this is statistical deviation, not evidence of wrongdoing.' });
  }
  const consistency = ['identity_document_consistency', 'application_detail_consistency', 'contact_reference_consistency', 'beneficiary_reference_consistency']
    .filter((field) => typeof application[field] === 'number' && application[field] < 0.8);
  if (consistency.length) {
    const actual = consistency.map((field) => `${field}=${fmt(application[field])}`).join(', ');
    flags.push({ code: 'synthetic_consistency_deviation', category: 'consistency', name: 'Synthetic consistency deviation', severity: 'warning', triggeringValue: actual, reference: 'demo rule: indicator < 0.80', explanation: 'An optional synthetic consistency value is below the demo rule. It is separate from VAE scoring and does not verify identity or establish wrongdoing.' });
  }
  if (typeof application.duplicate_identity_reference_count === 'number' && application.duplicate_identity_reference_count > 1) {
    flags.push({ code: 'repeated_opaque_reference_count', category: 'consistency', name: 'Repeated opaque reference count', severity: 'warning', triggeringValue: application.duplicate_identity_reference_count, reference: 'demo rule: count > 1', explanation: 'The optional synthetic count exceeds its demo rule. No underlying identity value is present and no identity check was performed.' });
  }
  const behavior = [];
  if (typeof application.submission_velocity_24h === 'number' && application.submission_velocity_24h > 5) behavior.push(`submission_velocity_24h=${fmt(application.submission_velocity_24h)}`);
  if (typeof application.recent_change_count === 'number' && application.recent_change_count > 6) behavior.push(`recent_change_count=${fmt(application.recent_change_count)}`);
  if (typeof application.repeat_submission_count === 'number' && application.repeat_submission_count > 3) behavior.push(`repeat_submission_count=${fmt(application.repeat_submission_count)}`);
  if (behavior.length) flags.push({ code: 'unusual_submission_behaviour', category: 'behavior', name: 'Unusual Submission Behaviour', severity: 'warning', triggeringValue: behavior.join(', '), reference: 'demo rule: >5 submissions/24h, >6 recent changes, or >3 repeated submissions', explanation: 'One or more submitted counts exceed an explicit demo rule. This signal does not establish intent.' });
  }
  if (row?.dataQualityIssues?.length || row?.scoreError) {
    const issues = row.dataQualityIssues || [];
    flags.push({
      code: 'data_quality_warning', category: 'data_quality', name: 'Data Quality Warning', severity: 'warning',
      triggeringValue: issues.length ? issues.map((issue) => `${issue.field}: ${issue.actual}`).join('; ') : row.scoreError,
      reference: issues.map((issue) => `${issue.field} ${issue.reference}`).join('; ') || 'API scoring result unavailable',
      explanation: issues.map((issue) => issue.explanation).join(' ') || 'This record did not receive a valid scoring result and should not be interpreted as a model outcome.',
    });
  }
  return flags;
}

const NON_SIGNAL = new Set(['within_range']);

export function filterFlaggedRows(rows, { category = 'all', severity = 'all' } = {}) {
  return rows.filter((row) => {
    const flags = buildApplicationFlags(row);
    return (category === 'all' || flags.some((flag) => flag.category === category))
      && (severity === 'all' || flags.some((flag) => flag.severity === severity));
  });
}

export function summarizeFlags(rows) {
  const analyses = rows.map((row) => ({ row, flags: buildApplicationFlags(row) }));
  const has = (entry, code) => entry.flags.some((flag) => flag.code === code);
  return {
    totalFlagged: analyses.filter((entry) => entry.flags.some((flag) => !NON_SIGNAL.has(flag.code))).length,
    highDeviation: analyses.filter((entry) => has(entry, 'high_statistical_deviation')).length,
    consistencyRelated: analyses.filter((entry) => has(entry, 'synthetic_consistency_deviation') || has(entry, 'repeated_opaque_reference_count')).length,
    behaviorRelated: analyses.filter((entry) => has(entry, 'unusual_submission_behaviour')).length,
    dataQualityWarnings: analyses.filter((entry) => has(entry, 'data_quality_warning')).length,
    withinRange: analyses.filter((entry) => entry.row.review === false && Number.isFinite(entry.row.score)).length,
  };
}
