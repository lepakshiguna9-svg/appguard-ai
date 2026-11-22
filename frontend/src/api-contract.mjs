const CURRENT_REQUIRED = [
  'policy_type',
  'coverage_amount',
  'deductible_amount',
  'premium_frequency',
  'application_channel',
  'applicant_age',
  'annual_income_estimate',
];
const CURRENT_OPTIONAL = [
  'prior_application_count',
  'recent_address_changes_count',
  'property_or_vehicle_age',
  'beneficiary_relation',
  'declared_credit_tier',
];
const LEGACY_FIELDS = [
  'policy_type',
  'requested_coverage',
  'deductible',
  'payment_frequency',
  'channel',
  'submission_velocity_24h',
  'recent_change_count',
];
const CURRENT_FIELDS = [
  'application_id', ...CURRENT_REQUIRED, ...CURRENT_OPTIONAL,
];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`Demo samples response is malformed: expected a "${name}" array.`);
  }
  if (value.length === 0) throw new Error('The API returned no demo samples.');
  if (value.length > 100) throw new Error('The API returned more than 100 demo samples; the scoring limit is 100.');
  return value;
}

/** Normalize both the documented `samples` contract and the older local `records` contract. */
export function normalizeDemoPayload(payload) {
  if (!isObject(payload)) throw new Error('Demo samples response is malformed: expected a JSON object.');

  const current = Object.hasOwn(payload, 'samples');
  const values = requireArray(current ? payload.samples : payload.records, current ? 'samples' : 'records');
  return values.map((value, index) => {
    if (!isObject(value)) throw new Error(`Demo sample ${index + 1} is malformed: expected an object.`);

    if (current) {
      const id = value.application_id;
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error(`Demo sample ${index + 1} is missing its application_id.`);
      }
      for (const field of CURRENT_REQUIRED) {
        if (!(field in value) || value[field] === null || value[field] === '') {
          throw new Error(`Demo sample ${id} is missing required field "${field}".`);
        }
      }
      const application = { application_id: id };
      for (const field of [...CURRENT_REQUIRED, ...CURRENT_OPTIONAL]) {
        if (field in value) application[field] = value[field];
      }
      return {
        id,
        application,
        fields: Object.entries(value).filter(([key]) => key !== 'description'),
        description: typeof value.description === 'string' ? value.description : undefined,
        demoGroup: undefined,
      };
    }

    const id = value.sample_id;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Demo record ${index + 1} is missing its sample_id.`);
    }
    const missing = LEGACY_FIELDS.filter((field) => !(field in value));
    if (missing.length) {
      throw new Error(`Demo record ${id} is missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`);
    }
    const application = Object.fromEntries(LEGACY_FIELDS.map((field) => [field, value[field]]));
    return {
      id,
      application,
      fields: Object.entries(application),
      description: undefined,
      demoGroup: value.demo_group === 'unusual_demo' ? 'unusual_demo' : 'baseline',
    };
  });
}

/** Convert the separate synthetic batch file into API-only records, dropping any accidental label fields. */
export function normalizeApplicationsPayload(payload) {
  if (!Array.isArray(payload) || payload.length !== 100) {
    throw new Error('Synthetic evaluation batch is malformed: expected exactly 100 application records.');
  }
  const seen = new Set();
  return payload.map((value, index) => {
    if (!isObject(value)) throw new Error(`Synthetic application ${index + 1} is malformed: expected an object.`);
    const id = value.application_id;
    if (typeof id !== 'string' || !id.trim()) throw new Error(`Synthetic application ${index + 1} is missing application_id.`);
    if (seen.has(id)) throw new Error(`Synthetic evaluation batch contains duplicate application_id "${id}".`);
    seen.add(id);
    for (const field of CURRENT_REQUIRED) {
      if (!(field in value) || value[field] === null || value[field] === '') {
        throw new Error(`Synthetic application ${id} is missing required field "${field}".`);
      }
    }
    const application = Object.fromEntries(CURRENT_FIELDS.filter((field) => field in value).map((field) => [field, value[field]]));
    return {
      id,
      application,
      fields: Object.entries(application),
      description: undefined,
      demoGroup: undefined,
    };
  });
}

function finiteNumber(value, name, id) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Scoring response for ${id} is missing a finite ${name}.`);
  }
  return value;
}

function normalizeDeviation(value, id) {
  if (!isObject(value)) throw new Error(`Scoring response for ${id} contains a malformed feature deviation.`);
  const feature = typeof value.feature_name === 'string' ? value.feature_name : value.feature;
  const residual = typeof value.reconstruction_error === 'number' ? value.reconstruction_error : value.residual;
  if (typeof feature !== 'string' || !feature || typeof residual !== 'number' || !Number.isFinite(residual)) {
    throw new Error(`Scoring response for ${id} contains a feature deviation without a feature name and finite residual.`);
  }
  return { feature, residual };
}

/** Validate and map current batch results (`calibrated_threshold`) or the older local contract (`threshold`). */
export function normalizeBatchPayload(payload, records) {
  if (!isObject(payload) || !Array.isArray(payload.results)) {
    throw new Error('Scoring response is malformed: expected a "results" array.');
  }
  if (payload.results.length !== records.length) {
    throw new Error(`Scoring returned ${payload.results.length} results for ${records.length} samples.`);
  }

  const recordsHaveStableIds = records.every((record) => typeof record.application?.application_id === 'string' && record.application.application_id.length > 0);
  const recordsById = new Map(records.map((record) => [record.application.application_id, record]));
  const seenResultIds = new Set();

  return payload.results.map((value, index) => {
    if (!isObject(value)) throw new Error(`Scoring result ${index + 1} is malformed.`);
    let sample = records[index];
    if (recordsHaveStableIds) {
      const resultId = value.application_id;
      if (typeof resultId !== 'string' || !resultId.trim()) {
        throw new Error(`Scoring result ${index + 1} is missing application_id; results must be matched by stable ID.`);
      }
      if (seenResultIds.has(resultId)) throw new Error(`Scoring response contains duplicate application_id "${resultId}".`);
      seenResultIds.add(resultId);
      sample = recordsById.get(resultId);
      if (!sample) throw new Error(`Scoring response contains an unexpected application_id "${resultId}".`);
    } else if (typeof value.application_id === 'string' && value.application_id.trim()) {
      const matched = recordsById.get(value.application_id);
      if (matched) sample = matched;
    }
    if (value.status && value.status !== 'success') {
      return { ...sample, scoreError: typeof value.error_message === 'string' && value.error_message ? value.error_message : 'The API could not score this sample.' };
    }

    const score = finiteNumber(value.anomaly_score, 'anomaly_score', sample.id);
    const threshold = finiteNumber(value.calibrated_threshold ?? value.threshold, 'calibrated_threshold', sample.id);
    if (typeof value.review_recommended !== 'boolean') {
      throw new Error(`Scoring response for ${sample.id} is missing review_recommended.`);
    }
    const rawDeviations = value.top_deviations ?? [];
    if (!Array.isArray(rawDeviations)) {
      throw new Error(`Scoring response for ${sample.id} has a malformed top_deviations field.`);
    }
    const deviations = rawDeviations.map((deviation) => normalizeDeviation(deviation, sample.id));
    return { ...sample, score, threshold, review: value.review_recommended, deviations };
  });
}

export function readableApiError(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    const messages = value.map((item) => isObject(item) && typeof item.msg === 'string' ? item.msg : '').filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  if (isObject(value) && typeof value.detail === 'string') return value.detail;
  return fallback;
}
