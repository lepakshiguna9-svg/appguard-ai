const LABELS = new Set(['typical_synthetic', 'unusual_synthetic']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableId(record) {
  const id = record?.application?.application_id ?? record?.application_id;
  if (typeof id !== 'string' || !id.trim()) throw new Error('Evaluation record is missing a stable application_id.');
  return id;
}

function rate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

/** Compare API review outputs with a separate, synthetic-only label sidecar by application_id. */
export function evaluateLabeledScores(scoredRecords, sidecar) {
  if (!Array.isArray(scoredRecords) || !scoredRecords.length) {
    throw new Error('Evaluation needs scored application records.');
  }
  const labelRows = Array.isArray(sidecar) ? sidecar : isObject(sidecar) ? sidecar.labels : undefined;
  if (!Array.isArray(labelRows) || !labelRows.length) {
    throw new Error('Evaluation label sidecar is malformed: expected a labels array.');
  }

  const labelsById = new Map();
  for (const label of labelRows) {
    if (!isObject(label) || typeof label.application_id !== 'string' || !label.application_id.trim()) {
      throw new Error('Evaluation label is missing a stable application_id.');
    }
    if (!LABELS.has(label.demo_label)) {
      throw new Error(`Evaluation label for ${label.application_id} is missing or has an unsupported demo_label.`);
    }
    if (labelsById.has(label.application_id)) {
      throw new Error(`Evaluation sidecar contains duplicate application_id "${label.application_id}".`);
    }
    labelsById.set(label.application_id, label);
  }

  const scoresById = new Map();
  for (const record of scoredRecords) {
    const id = stableId(record);
    if (scoresById.has(id)) throw new Error(`Scoring results contain duplicate application_id "${id}".`);
    if (record.scoreError || typeof record.review !== 'boolean') {
      throw new Error(`Evaluation cannot include ${id}: its score or review recommendation is unavailable.`);
    }
    scoresById.set(id, record);
  }

  for (const id of scoresById.keys()) {
    if (!labelsById.has(id)) throw new Error(`Missing synthetic label for application_id "${id}".`);
  }
  for (const id of labelsById.keys()) {
    if (!scoresById.has(id)) throw new Error(`Label sidecar application_id "${id}" has no matching scored record.`);
  }

  const counts = { truePositives: 0, falseNegatives: 0, falsePositives: 0, trueNegatives: 0 };
  const rows = [...scoresById.entries()].map(([id, record]) => {
    const labelRecord = labelsById.get(id);
    const demoLabel = labelRecord.demo_label;
    const intentionallyUnusual = demoLabel === 'unusual_synthetic';
    let outcome;
    if (intentionallyUnusual && record.review) { counts.truePositives += 1; outcome = 'flagged_true_positive'; }
    else if (intentionallyUnusual) { counts.falseNegatives += 1; outcome = 'missed_false_negative'; }
    else if (record.review) { counts.falsePositives += 1; outcome = 'flagged_false_positive'; }
    else { counts.trueNegatives += 1; outcome = 'not_flagged_true_negative'; }
    return { ...record, demoLabel, scenario: labelRecord.scenario, scenarioDescription: labelRecord.scenario_description, evaluationOutcome: outcome };
  });

  const positivePredictive = counts.truePositives + counts.falsePositives;
  const actualPositives = counts.truePositives + counts.falseNegatives;
  const actualNegatives = counts.falsePositives + counts.trueNegatives;
  const positives = rows.filter((row) => row.demoLabel === 'unusual_synthetic').map((row) => row.score);
  const negatives = rows.filter((row) => row.demoLabel === 'typical_synthetic').map((row) => row.score);
  const rocAuc = positives.length && negatives.length
    ? positives.reduce((sum, positive) => sum + negatives.reduce((wins, negative) => wins + (positive > negative ? 1 : positive === negative ? 0.5 : 0), 0), 0) / (positives.length * negatives.length)
    : null;
  const f1Denominator = (2 * counts.truePositives) + counts.falsePositives + counts.falseNegatives;
  return {
    rows,
    counts,
    confusionMatrix: {
      truePositive: counts.truePositives, falseNegative: counts.falseNegatives,
      falsePositive: counts.falsePositives, trueNegative: counts.trueNegatives,
    },
    typicalCount: negatives.length,
    unusualCount: positives.length,
    accuracy: rate(counts.truePositives + counts.trueNegatives, rows.length),
    precision: rate(counts.truePositives, positivePredictive),
    recall: rate(counts.truePositives, actualPositives),
    f1: rate(2 * counts.truePositives, f1Denominator),
    falsePositiveRate: rate(counts.falsePositives, actualNegatives),
    rocAuc,
  };
}
