import { useEffect, useMemo, useState } from 'react';
import batchAsset from '../../data/synthetic/test_batch_100.json?url';
import labelsAsset from '../../data/synthetic/test_batch_100_labels.json?url';
import displayAsset from '../../data/synthetic/test_batch_100_display.json?url';
import {
  normalizeApplicationsPayload,
  normalizeBatchPayload,
  normalizeDemoPayload,
  normalizeDisplayContext,
  normalizeUploadPayload,
  readableApiError,
} from './api-contract.mjs';
import { evaluateLabeledScores } from './evaluation.mjs';
import { scorePresentation } from './score-presentation.mjs';
import { buildApplicationFlags, filterFlaggedRows, summarizeFlags, validateScoringInput } from './flagging.mjs';

const applicationFields = [
  'policy_type', 'requested_coverage', 'deductible', 'payment_frequency', 'channel',
  'submission_velocity_24h', 'recent_change_count', 'duplicate_identity_reference_count',
  'identity_document_consistency', 'application_detail_consistency', 'contact_reference_consistency',
  'beneficiary_reference_consistency', 'repeat_submission_count',
] as const;
const modelLabels: Record<string, string> = {
  policy_type: 'Policy type', requested_coverage: 'Requested coverage', deductible: 'Deductible',
  payment_frequency: 'Payment frequency', channel: 'Application channel',
  submission_velocity_24h: 'Submissions in 24 hours', recent_change_count: 'Recent changes',
  duplicate_identity_reference_count: 'Opaque repeated-reference count · synthetic',
  identity_document_consistency: 'Synthetic document-consistency indicator',
  application_detail_consistency: 'Synthetic application-consistency indicator',
  contact_reference_consistency: 'Synthetic contact-match indicator',
  beneficiary_reference_consistency: 'Synthetic beneficiary-match indicator',
  repeat_submission_count: 'Repeated submissions',
  applicant_age: 'Synthetic age (display only)', annual_income_estimate: 'Synthetic income (display only)',
};
const featureNotes: Record<string, string> = {
  policy_type: 'Category reconstruction difference across its encoded category values (0–1 scale).',
  payment_frequency: 'Category reconstruction difference across its encoded category values (0–1 scale).',
  channel: 'Category reconstruction difference across its encoded category values (0–1 scale).',
  requested_coverage: 'Absolute difference in standardized feature units; one unit is about one training-set standard deviation.',
  deductible: 'Absolute difference in standardized feature units; one unit is about one training-set standard deviation.',
  submission_velocity_24h: 'Absolute difference in standardized feature units; one unit is about one training-set standard deviation.',
  recent_change_count: 'Absolute difference in standardized feature units; one unit is about one training-set standard deviation.',
  duplicate_identity_reference_count: 'Absolute difference in the count of reused, opaque synthetic references. No identity value is collected.',
  identity_document_consistency: 'Difference in an abstract synthetic 0–1 consistency indicator; it is not document validation.',
  application_detail_consistency: 'Difference in an abstract synthetic 0–1 consistency indicator; it does not reveal which detail differs.',
  contact_reference_consistency: 'Difference in an opaque synthetic comparison indicator; no contact details are present.',
  beneficiary_reference_consistency: 'Difference in an abstract synthetic consistency indicator; no relationship category is present.',
  repeat_submission_count: 'Absolute difference in synthetic repeated-submission count; it is not linked to a person or device.',
};
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactNumber = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 8 });
const workflowChoices = [
  'Awaiting human review', 'Standard queue · demo', 'Clear alert (demo only)', 'Request documents (simulated only)', 'Refer for second review (simulated only)',
];

type QueueRow = {
  id: string;
  application: Record<string, unknown>;
  fields: Array<[string, unknown]>;
  display?: Record<string, unknown>;
  score?: number;
  threshold?: number;
  review?: boolean;
  deviations?: Array<{ feature: string; residual: number }>;
  featureDeviations?: Array<{ feature: string; residual: number }>;
  demoLabel?: 'typical_synthetic' | 'unusual_synthetic';
  evaluationOutcome?: 'flagged_true_positive' | 'missed_false_negative' | 'flagged_false_positive' | 'not_flagged_true_negative';
  scenario?: string;
  scenarioDescription?: string;
  scoreError?: string;
  workflowStatus?: string;
  dataQualityIssues?: Array<{ field: string; actual: string | number; reference: string; explanation: string }>;
  flags?: Array<{ code: string; category: string; name: string; severity: 'info' | 'review' | 'warning' | 'high'; triggeringValue: string | number; reference: string; explanation: string }>;
};
type ModelInfo = { model_version?: string; feature_schema?: string[]; calibration?: { threshold?: number; method?: string } };
type Filters = 'all' | 'review' | 'standard';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function api(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  let body: unknown;
  try { body = await response.json(); }
  catch { throw new Error(response.ok ? `The API returned invalid JSON from ${url}.` : `Request failed (${response.status}) with a non-JSON response.`); }
  if (!response.ok) {
    const detail = object(body) ? body.detail : undefined;
    throw new Error(readableApiError(detail, `Request failed (${response.status}).`));
  }
  return body;
}

async function localJsonAsset(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load local synthetic demo file (${response.status}).`);
  try { return await response.json(); }
  catch { throw new Error('A local synthetic demo file contains invalid JSON.'); }
}

function displayField(name: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (name.endsWith('_consistency') && typeof value === 'number') return `${(value * 100).toFixed(1)}%`;
  if (['requested_coverage', 'deductible', 'annual_income_estimate'].includes(name) && typeof value === 'number') return currency.format(value);
  if (name === 'applicant_age' && typeof value === 'number') return `${integer.format(value)} yrs`;
  if (typeof value === 'number') return integer.format(value);
  return String(value);
}

function outcomeText(outcome?: string): string {
  switch (outcome) {
    case 'flagged_true_positive': return 'Flagged · intentionally unusual example';
    case 'missed_false_negative': return 'Not flagged · intentionally unusual example';
    case 'flagged_false_positive': return 'Flagged · typical example';
    case 'not_flagged_true_negative': return 'Not flagged · typical example';
    default: return 'No evaluation label';
  }
}

function labelText(label?: string): string {
  if (label === 'typical_synthetic') return 'Known label · typical synthetic';
  if (label === 'unusual_synthetic') return 'Known label · intentionally unusual';
  return 'No known synthetic label';
}

function flagCategoryLabel(category: string): string {
  if (category === 'consistency') return 'synthetic consistency';
  if (category === 'behavior') return 'synthetic behaviour';
  if (category === 'data_quality') return 'data quality';
  return category;
}

function newWorkflow(row: QueueRow): string {
  return row.workflowStatus || (row.review === undefined ? 'Not scored · data quality' : row.review ? 'Awaiting human review' : 'Standard queue · demo');
}

function typicalApplication(index: number, rng: () => number): Record<string, unknown> {
  const policy = ['auto', 'home', 'renters'][Math.floor(rng() * 3)];
  const coverageRange = policy === 'home' ? [160000, 700000] : policy === 'renters' ? [10000, 60000] : [10000, 80000];
  return {
    application_id: `GENERATED-${Date.now()}-${index + 1}`,
    policy_type: policy,
    requested_coverage: Math.round(coverageRange[0] + rng() * (coverageRange[1] - coverageRange[0])),
    deductible: [500, 1000, 1500, 2000, 2500][Math.floor(rng() * 5)],
    payment_frequency: ['monthly', 'quarterly', 'annual'][Math.floor(rng() * 3)],
    channel: ['agent', 'web', 'phone'][Math.floor(rng() * 3)],
    submission_velocity_24h: Math.floor(rng() * 4),
    recent_change_count: Math.floor(rng() * 4),
    duplicate_identity_reference_count: 0,
    identity_document_consistency: Number((0.88 + rng() * 0.12).toFixed(3)),
    application_detail_consistency: Number((0.88 + rng() * 0.12).toFixed(3)),
    contact_reference_consistency: Number((0.88 + rng() * 0.12).toFixed(3)),
    beneficiary_reference_consistency: Number((0.88 + rng() * 0.12).toFixed(3)),
    repeat_submission_count: Math.floor(rng() * 3),
    applicant_age: 20 + Math.floor(rng() * 59),
    annual_income_estimate: [28000, 36000, 48000, 62000, 78000, 95000, 125000, 165000, 220000][Math.floor(rng() * 9)],
  };
}

function generatedBatch(): unknown[] {
  let state = 20261122;
  const rng = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const rows = Array.from({ length: 24 }, (_, index) => typicalApplication(index, rng));
  // Synthetic consistency scenarios are moderate and do not use extreme financial values.
  rows[18] = { ...rows[18], duplicate_identity_reference_count: 3 };
  rows[19] = { ...rows[19], identity_document_consistency: 0.24, application_detail_consistency: 0.36 };
  rows[20] = { ...rows[20], repeat_submission_count: 18, submission_velocity_24h: 8 };
  rows[21] = { ...rows[21], beneficiary_reference_consistency: 0.18 };
  rows[22] = { ...rows[22], contact_reference_consistency: 0.22 };
  return rows;
}

function makeCustomRecord(values: Record<string, string>): QueueRow {
  const application: Record<string, unknown> = {
    application_id: `CUSTOM-${Date.now()}`,
    policy_type: values.policy_type,
    requested_coverage: Number(values.requested_coverage),
    deductible: Number(values.deductible),
    payment_frequency: values.payment_frequency,
    channel: values.channel,
    submission_velocity_24h: Number(values.submission_velocity_24h),
    recent_change_count: Number(values.recent_change_count),
    duplicate_identity_reference_count: Number(values.duplicate_identity_reference_count),
    identity_document_consistency: Number(values.identity_document_consistency),
    application_detail_consistency: Number(values.application_detail_consistency),
    contact_reference_consistency: Number(values.contact_reference_consistency),
    beneficiary_reference_consistency: Number(values.beneficiary_reference_consistency),
    repeat_submission_count: Number(values.repeat_submission_count),
  };
  return { id: String(application.application_id), application, fields: Object.entries(application).filter(([key]) => key !== 'application_id'), display: { applicant_age: Number(values.applicant_age), annual_income_estimate: Number(values.annual_income_estimate) } };
}

function App() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [selected, setSelected] = useState('');
  const [health, setHealth] = useState('Connecting to model…');
  const [modelInfo, setModelInfo] = useState<ModelInfo>({});
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [evaluation, setEvaluation] = useState<ReturnType<typeof evaluateLabeledScores> | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filters>('all');
  const [flagCategory, setFlagCategory] = useState('all');
  const [flagSeverity, setFlagSeverity] = useState('all');
  const [workflowDraft, setWorkflowDraft] = useState('Awaiting human review');
  const [reviewNotes, setReviewNotes] = useState('');
  const [workflowPreview, setWorkflowPreview] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [customValues, setCustomValues] = useState({ policy_type: 'auto', requested_coverage: '35000', deductible: '1000', payment_frequency: 'monthly', channel: 'web', submission_velocity_24h: '1', recent_change_count: '0', duplicate_identity_reference_count: '0', identity_document_consistency: '0.98', application_detail_consistency: '0.98', contact_reference_consistency: '0.98', beneficiary_reference_consistency: '0.98', repeat_submission_count: '0', applicant_age: '35', annual_income_estimate: '78000' });
  const [uploadMessage, setUploadMessage] = useState('');
  const active = useMemo(() => rows.find((row) => row.id === selected), [rows, selected]);
  const reviewCount = rows.filter((row) => row.review === true).length;
  const standardCount = rows.filter((row) => row.review === false).length;
  const flagSummary = useMemo(() => summarizeFlags(rows), [rows]);
  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const modelFiltered = rows.filter((row) => {
      if (filter === 'review' && row.review !== true) return false;
      if (filter === 'standard' && row.review !== false) return false;
      if (!term) return true;
      return [row.id, row.application.policy_type, row.application.channel, row.application.payment_frequency]
        .some((value) => String(value ?? '').toLowerCase().includes(term));
    });
    return filterFlaggedRows(modelFiltered, { category: flagCategory, severity: flagSeverity });
  }, [rows, query, filter, flagCategory, flagSeverity]);

  async function scoreRecords(records: QueueRow[], show: string) {
    setBusyAction(show);
    setError('');
    setUploadMessage('');
    setEvaluation(null);
    try {
      const prepared = records.map((row) => {
        const allIssues = [...(row.dataQualityIssues || []), ...validateScoringInput(row.application)];
        const issues = [...new Map(allIssues.map((issue) => [`${issue.field}:${issue.actual}`, issue])).values()];
        return { ...row, dataQualityIssues: issues };
      });
      const valid = prepared.filter((row) => !row.dataQualityIssues?.length);
      const invalid = prepared.filter((row) => !!row.dataQualityIssues?.length);
      let scored: QueueRow[] = [];
      if (valid.length) {
        const response = await api('/api/v1/score/batch', { method: 'POST', body: JSON.stringify({ applications: valid.map((row) => row.application) }) });
        scored = normalizeBatchPayload(response, valid).map((row) => ({ ...row, workflowStatus: newWorkflow(row) })) as QueueRow[];
      }
      const byId = new Map([...scored, ...invalid].map((row) => [row.id, row]));
      const ordered = prepared.map((row) => ({ ...(byId.get(row.id) || row), workflowStatus: newWorkflow(byId.get(row.id) || row) })) as QueueRow[];
      setUploadMessage(invalid.length ? `${invalid.length} record${invalid.length === 1 ? '' : 's'} withheld from scoring because of data-quality issues.` : 'All records passed the local API schema checks.');
      setRows(ordered);
      setSelected(ordered[0]?.id || '');
      setWorkflowDraft(ordered[0] ? newWorkflow(ordered[0]) : workflowChoices[0]);
      setWorkflowPreview('');
      setStatus('ready');
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to score these synthetic applications.');
      return false;
    } finally { setBusyAction(''); }
  }

  async function loadEvaluation() {
    setBusyAction('evaluation'); setStatus('loading'); setError(''); setEvaluation(null);
    try {
      const [batchPayload, labelsPayload, displayPayload] = await Promise.all([localJsonAsset(batchAsset), localJsonAsset(labelsAsset), localJsonAsset(displayAsset)]);
      const records = normalizeApplicationsPayload(batchPayload) as QueueRow[];
      const ids = records.map((row) => row.id);
      const context = normalizeDisplayContext(displayPayload, ids);
      const response = await api('/api/v1/score/batch', { method: 'POST', body: JSON.stringify({ applications: records.map((row) => row.application) }) });
      const scored = normalizeBatchPayload(response, records) as QueueRow[];
      const evaluated = evaluateLabeledScores(scored, labelsPayload);
      const enriched = evaluated.rows.map((row) => ({ ...row, display: context.get(row.id), workflowStatus: newWorkflow(row) })) as QueueRow[];
      setEvaluation({ ...evaluated, rows: enriched as typeof evaluated.rows });
      setRows(enriched);
      setSelected(enriched[0]?.id || '');
      setWorkflowDraft(enriched[0] ? newWorkflow(enriched[0]) : workflowChoices[0]);
      setStatus('ready');
      setHealth('Model ready');
    } catch (cause) {
      setRows([]); setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Unable to load and score the labeled synthetic batch.');
    } finally { setBusyAction(''); }
  }

  async function loadCurated() {
    setBusyAction('curated'); setError(''); setEvaluation(null);
    try {
      const payload = await api('/api/v1/demo/samples');
      const samples = normalizeDemoPayload(payload);
      const records = samples.map((sample: any) => {
        const id = sample.id;
        const application = { application_id: id, ...sample.application };
        return { id, application, fields: Object.entries(sample.application) } as QueueRow;
      });
      await scoreRecords(records, 'curated');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load curated synthetic scenarios.'); setBusyAction(''); }
  }

  async function generate() {
    try {
      const records = normalizeUploadPayload(generatedBatch(), 'GENERATED') as QueueRow[];
      await scoreRecords(records, 'generate');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to generate the synthetic batch.'); }
  }

  async function scoreUpload(file?: File) {
    if (!file) return;
    setError(''); setUploadMessage('');
    try {
      if (file.size > 250_000) throw new Error('JSON file must be 250 KB or smaller.');
      const parsed: unknown = JSON.parse(await file.text());
      const records = normalizeUploadPayload(parsed) as QueueRow[];
      const scored = await scoreRecords(records, 'upload');
      if (scored && records.every((row) => !row.dataQualityIssues?.length)) setUploadMessage(`${records.length} synthetic record${records.length === 1 ? '' : 's'} scored. Any age/income fields were display-only and omitted from the API request.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to read the uploaded JSON batch.'); }
  }

  async function scoreCustom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const record = makeCustomRecord(customValues);
    await scoreRecords([record], 'custom');
    setShowCustom(false);
  }

  function updateWorkflow() {
    if (!active) return;
    setRows((current) => current.map((row) => row.id === active.id ? { ...row, workflowStatus: workflowDraft } : row));
    setWorkflowPreview(`Preview updated for ${active.id}; this choice exists only in this browser session.`);
  }

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const [healthPayload, infoPayload] = await Promise.all([api('/api/v1/health'), api('/api/v1/model-info')]);
        if (!object(healthPayload) || healthPayload.status !== 'healthy' || healthPayload.model_loaded !== true) throw new Error('The scoring API is not healthy or the model is not loaded.');
        if (cancelled) return;
        setModelInfo(infoPayload as ModelInfo); setHealth('Model ready');
        await loadEvaluation();
      } catch (cause) {
        if (!cancelled) { setHealth('Model unavailable'); setStatus('error'); setError(cause instanceof Error ? cause.message : 'Unable to connect to the scoring service.'); }
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  const activePresentation = active?.score !== undefined && active.threshold !== undefined
    ? scorePresentation(active.score, active.threshold)
    : undefined;
  function selectRecord(row: QueueRow) {
    setSelected(row.id);
    setWorkflowDraft(newWorkflow(row));
    setWorkflowPreview('');
  }

  return <main className="workbench">
    <header className="masthead">
      <a className="brand" href="#top" aria-label="AppGuard AI home"><span className="brand-mark">AG</span><span><b>AppGuard <i>AI</i></b><small>APPLICATION REVIEW WORKBENCH</small></span></a>
      <div className="mast-meta"><span className="model-chip">MODEL {modelInfo.model_version || '—'}</span><span className="demo-chip">SYNTHETIC DEMO</span><span className={`service-state ${status === 'ready' ? 'online' : ''}`}>{health}</span></div>
    </header>

    <section className="hero" id="top">
      <div><p className="eyebrow">INSURANCE APPLICATION SCREENING</p><h1>Review with context.</h1><p className="hero-copy">A statistical screening aid for exploring patterns in synthetic application data. Every signal needs human context.</p></div>
      <div className="hero-actions">
        <button className="button secondary" onClick={() => void loadCurated()} disabled={!!busyAction}>Curated scenarios</button>
        <button className="button secondary" onClick={() => void generate()} disabled={!!busyAction}>Generate synthetic batch</button>
        <label className="button secondary upload-button" htmlFor="batch-upload">Upload JSON</label>
        <input id="batch-upload" className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { void scoreUpload(event.target.files?.[0]); event.currentTarget.value = ''; }} />
        <button className="button primary" onClick={() => setShowCustom((shown) => !shown)} disabled={!!busyAction}>Score one synthetic application</button>
      </div>
    </section>

    <section className="safety-banner" aria-label="Synthetic demo disclaimer">
      <span className="safety-icon">!</span><p><b>All records and labels shown here are synthetic.</b> Scores measure statistical deviation; they do not prove fraud, deception, or intent. Human review is required. Never use this demo for automated insurance decisions, pricing, approval, denial, or policy action.</p>
    </section>

    {showCustom && <form className="custom-form" onSubmit={(event) => void scoreCustom(event)}>
      <div className="panel-heading"><div><p className="eyebrow">SCORING INPUT</p><h2>Custom synthetic application</h2></div><button type="button" className="icon-button" aria-label="Close custom application form" onClick={() => setShowCustom(false)}>×</button></div>
      <p className="muted-copy">The VAE scores the original seven fields. Optional abstract consistency/count values feed separate demo flag rules only; they are not identity verification. No personal data is collected. Age and income are client-only display context.</p>
      <div className="form-grid">
        <label>Policy type<select value={customValues.policy_type} onChange={(e) => setCustomValues({ ...customValues, policy_type: e.target.value })}><option>auto</option><option>home</option><option>renters</option></select></label>
        <label>Requested coverage<input type="number" min="1" max="100000000" required value={customValues.requested_coverage} onChange={(e) => setCustomValues({ ...customValues, requested_coverage: e.target.value })} /></label>
        <label>Deductible<input type="number" min="0" max="10000000" required value={customValues.deductible} onChange={(e) => setCustomValues({ ...customValues, deductible: e.target.value })} /></label>
        <label>Payment frequency<select value={customValues.payment_frequency} onChange={(e) => setCustomValues({ ...customValues, payment_frequency: e.target.value })}><option>monthly</option><option>quarterly</option><option>annual</option></select></label>
        <label>Channel<select value={customValues.channel} onChange={(e) => setCustomValues({ ...customValues, channel: e.target.value })}><option>agent</option><option>web</option><option>phone</option></select></label>
        <label>Submissions in 24h<input type="number" min="0" max="10000" required value={customValues.submission_velocity_24h} onChange={(e) => setCustomValues({ ...customValues, submission_velocity_24h: e.target.value })} /></label>
        <label>Recent changes<input type="number" min="0" max="10000" required value={customValues.recent_change_count} onChange={(e) => setCustomValues({ ...customValues, recent_change_count: e.target.value })} /></label>
        <label>Opaque synthetic reference count<input type="number" min="0" max="100" value={customValues.duplicate_identity_reference_count} onChange={(e) => setCustomValues({ ...customValues, duplicate_identity_reference_count: e.target.value })} /></label>
        <label>Synthetic document-consistency value (0–1)<input type="number" min="0" max="1" step="0.01" value={customValues.identity_document_consistency} onChange={(e) => setCustomValues({ ...customValues, identity_document_consistency: e.target.value })} /></label>
        <label>Application detail consistency (0–1)<input type="number" min="0" max="1" step="0.01" value={customValues.application_detail_consistency} onChange={(e) => setCustomValues({ ...customValues, application_detail_consistency: e.target.value })} /></label>
        <label>Contact reference consistency (0–1)<input type="number" min="0" max="1" step="0.01" value={customValues.contact_reference_consistency} onChange={(e) => setCustomValues({ ...customValues, contact_reference_consistency: e.target.value })} /></label>
        <label>Beneficiary reference consistency (0–1)<input type="number" min="0" max="1" step="0.01" value={customValues.beneficiary_reference_consistency} onChange={(e) => setCustomValues({ ...customValues, beneficiary_reference_consistency: e.target.value })} /></label>
        <label>Repeated submissions<input type="number" min="0" max="10000" value={customValues.repeat_submission_count} onChange={(e) => setCustomValues({ ...customValues, repeat_submission_count: e.target.value })} /></label>
        <label>Age · display only<input type="number" min="18" max="105" value={customValues.applicant_age} onChange={(e) => setCustomValues({ ...customValues, applicant_age: e.target.value })} /></label>
        <label>Annual income · display only<input type="number" min="0" max="5000000" value={customValues.annual_income_estimate} onChange={(e) => setCustomValues({ ...customValues, annual_income_estimate: e.target.value })} /></label>
      </div>
      <div className="form-footer"><small>Use synthetic values only. Age and income are not model features.</small><button className="button primary" disabled={!!busyAction}>{busyAction === 'custom' ? 'Scoring…' : 'Score synthetic record'}</button></div>
    </form>}

    <section className="summary-strip" aria-label="Queue summary">
      <div><span>QUEUE SIZE</span><b>{rows.length}</b><small>{evaluation ? 'Labeled synthetic batch' : 'Synthetic records'}</small></div>
      <div><span>REVIEW SUGGESTED</span><b>{reviewCount}</b><small>Model recommendation</small></div>
      <div><span>WITHIN RANGE</span><b>{standardCount}</b><small>Below or at threshold</small></div>
      <div><span>CALIBRATED THRESHOLD</span><b>{typeof modelInfo.calibration?.threshold === 'number' ? compactNumber.format(modelInfo.calibration.threshold) : '—'}</b><small>99th percentile · synthetic baseline</small></div>
    </section>

    <section className="flag-analytics" aria-label="Flag analytics">
      <div><span>TOTAL FLAGGED</span><b>{flagSummary.totalFlagged}</b><small>At least one review or data signal</small></div>
      <div><span>HIGH DEVIATION</span><b>{flagSummary.highDeviation}</b><small>Score ≥ 3× threshold</small></div>
      <div><span>SYNTHETIC CONSISTENCY</span><b>{flagSummary.consistencyRelated}</b><small>Separate demo flag evidence</small></div>
      <div><span>BEHAVIOUR RELATED</span><b>{flagSummary.behaviorRelated}</b><small>Synthetic submission counts</small></div>
      <div><span>DATA QUALITY</span><b>{flagSummary.dataQualityWarnings}</b><small>Inputs needing correction</small></div>
      <div><span>WITHIN RANGE</span><b>{flagSummary.withinRange}</b><small>Model outcome</small></div>
    </section>

    <section className="work-area">
      <section className="queue-panel" aria-label="Application queue">
        <div className="queue-heading"><div><p className="eyebrow">APPLICATIONS</p><h2>Review queue <span>{visibleRows.length}</span></h2></div><button className="icon-button" title="Reload labeled synthetic evaluation" aria-label="Reload synthetic evaluation" onClick={() => void loadEvaluation()} disabled={!!busyAction}>↻</button></div>
        <div className="queue-controls"><label className="searchbox"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, policy, channel…" aria-label="Search applications" /></label><div className="filter-tabs" role="group" aria-label="Filter queue">{(['all', 'review', 'standard'] as Filters[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item === 'all' ? 'All' : item === 'review' ? 'Review' : 'Standard'}</button>)}</div><label className="flag-filter">Flag category<select value={flagCategory} onChange={(e) => setFlagCategory(e.target.value)}><option value="all">All categories</option><option value="model">Model outcome</option><option value="statistical">Statistical</option><option value="consistency">Synthetic consistency</option><option value="behavior">Behaviour</option><option value="data_quality">Data quality</option></select></label><label className="flag-filter">Severity<select value={flagSeverity} onChange={(e) => setFlagSeverity(e.target.value)}><option value="all">All severities</option><option value="high">High</option><option value="warning">Warning</option><option value="review">Review</option><option value="info">Info</option></select></label></div>
        {(busyAction || status === 'loading') && <div className="inline-state">{busyAction === 'curated' ? 'Loading curated scenarios…' : busyAction === 'generate' ? 'Scoring generated synthetic records…' : busyAction === 'upload' ? 'Scoring uploaded synthetic records…' : busyAction === 'custom' ? 'Scoring custom synthetic application…' : 'Loading scores and evaluation…'}</div>}
        {error && <div className="error-state" role="alert">{error}<button onClick={() => void loadEvaluation()}>Reload evaluation</button></div>}
        {status === 'ready' && <><div className="table-scroll"><table className="application-table"><thead><tr><th>Application</th><th>Policy</th><th>Coverage</th><th>Income*</th><th>Channel</th><th>Age*</th><th>Score</th><th>Signal</th><th>Flags</th><th>Workflow · demo</th></tr></thead><tbody>{visibleRows.map((row) => {
          const signal = row.score !== undefined && row.threshold !== undefined ? scorePresentation(row.score, row.threshold) : undefined;
          return <tr key={row.id} className={selected === row.id ? 'selected-row' : ''} onClick={() => selectRecord(row)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectRecord(row); }}>
            <td><b className="mono">{row.id}</b><small className="known-label">{row.demoLabel === 'typical_synthetic' ? 'Typical · synthetic label' : row.demoLabel === 'unusual_synthetic' ? 'Unusual · synthetic label' : 'No evaluation label'}</small></td>
            <td>{displayField('policy_type', row.application.policy_type)}</td><td>{displayField('requested_coverage', row.application.requested_coverage)}</td><td>{displayField('annual_income_estimate', row.display?.annual_income_estimate)}</td><td>{displayField('channel', row.application.channel)}</td><td>{displayField('applicant_age', row.display?.applicant_age)}</td>
            <td className="mono score-cell">{signal?.scoreText ?? '—'}<small>{signal?.comparison ?? 'Awaiting score'}</small></td>
            <td>{row.review === undefined ? <span className="signal warning">Not scored</span> : <><span className={`signal ${row.review ? 'review' : 'standard'}`}>{row.review ? 'Review suggested' : 'Within range'}</span><small className="known-label">Model output</small></>}</td>
            <td><div className="flag-badges">{buildApplicationFlags(row).map((flag) => <span key={flag.code} className={`flag-badge severity-${flag.severity}`} title={flag.explanation}>{flag.name}</span>)}</div></td>
            <td><small>{newWorkflow(row)}</small></td>
          </tr>;
        })}</tbody></table></div><div className="mobile-records">{visibleRows.map((row) => {
          const signal = row.score !== undefined && row.threshold !== undefined ? scorePresentation(row.score, row.threshold) : undefined;
          return <button className={`mobile-record ${selected === row.id ? 'selected-row' : ''}`} key={row.id} onClick={() => selectRecord(row)}>
            <span className="mobile-record-head"><b>{row.id}</b><span className={`signal ${row.review === undefined ? 'warning' : row.review ? 'review' : 'standard'}`}>{row.review === undefined ? 'Not scored' : row.review ? 'Review suggested' : 'Within range'}</span></span>
            <span className="flag-badges">{buildApplicationFlags(row).map((flag) => <span key={flag.code} className={`flag-badge severity-${flag.severity}`}>{flag.name}</span>)}</span>
            <span className="mobile-record-meta">{displayField('policy_type', row.application.policy_type)} · {displayField('requested_coverage', row.application.requested_coverage)} · {displayField('annual_income_estimate', row.display?.annual_income_estimate)} · {displayField('channel', row.application.channel)} · {displayField('applicant_age', row.display?.applicant_age)}</span>
            <span className="mobile-record-score"><span>Score {signal?.scoreText ?? '—'}</span><span>{signal?.comparison ?? 'Awaiting score'}</span></span>
            <small>{labelText(row.demoLabel)} · {outcomeText(row.evaluationOutcome)} · Workflow preview: {newWorkflow(row)}</small>
          </button>;
        })}</div>{!visibleRows.length && <p className="empty-state">No applications match this search or filter.</p>}</>}
        {uploadMessage && <p className="upload-message">{uploadMessage}</p>}
        <div className="queue-foot"><span>* Age and income are separate synthetic display context, not model inputs.</span><button className="text-button" onClick={() => { const input = document.getElementById('batch-upload') as HTMLInputElement | null; input?.click(); }}>Choose JSON file</button></div>
      </section>

      <aside className="detail-panel" aria-label="Selected application details">
        {!active ? <div className="empty-detail"><span>◎</span><h2>Select an application</h2><p>Scores and submitted synthetic fields will appear here.</p></div> : <>
          <div className="detail-heading"><div><p className="eyebrow">SELECTED APPLICATION</p><h2>{active.id}</h2></div>{active.review === undefined ? <span className="signal warning">Not scored</span> : <span className={`signal ${active.review ? 'review' : 'standard'}`}>{active.review ? 'Review suggested' : 'Within range'}</span>}</div>
          <section className="detail-section flag-analysis"><div className="section-title"><h3>Flag analysis</h3><span>TRIGGERED CONDITIONS</span></div>{buildApplicationFlags(active).length ? <ul className="flag-analysis-list">{buildApplicationFlags(active).map((flag) => <li key={flag.code}><div className="flag-analysis-head"><span className={`flag-badge severity-${flag.severity}`}>{flag.name}</span><small>{flag.severity.toUpperCase()} · {flagCategoryLabel(flag.category)}</small></div><dl><div><dt>Triggering value</dt><dd>{typeof flag.triggeringValue === 'number' ? compactNumber.format(flag.triggeringValue) : flag.triggeringValue}</dd></div><div><dt>Reference</dt><dd>{flag.reference}</dd></div></dl><p>{flag.explanation}</p></li>)}</ul> : <p className="muted-copy">No flag conditions were triggered.</p>}<small>Model flags reflect the original seven-feature VAE. Other flags use separately validated optional synthetic evidence; none establishes fraud, intent, or identity.</small></section>
          <section className="review-action"><span>RECOMMENDED HUMAN REVIEW ACTION</span><b>{active.review === true ? 'Review the submitted details and context' : active.review === false ? 'Continue with the standard human workflow' : 'Correct data-quality issues before scoring'}</b><p>{active.review === true ? 'Check the source information and possible data-entry or distribution context, then record an independent rationale. A score does not establish fraud or intent.' : active.review === false ? 'The model did not suggest anomaly-driven follow-up. This result does not replace normal underwriting review.' : 'This application has no valid model outcome yet. Resolve the listed input warnings and submit it again.'}</p></section>
          <section className="detail-section"><div className="section-title"><h3>Application details</h3><span>SUBMITTED SYNTHETIC FIELDS</span></div><dl className="field-grid">
            {applicationFields.map((name) => <div key={name}><dt>{modelLabels[name]}</dt><dd>{displayField(name, active.application[name])}</dd></div>)}
            <div><dt>{modelLabels.applicant_age}</dt><dd>{displayField('applicant_age', active.display?.applicant_age)}</dd></div>
            <div><dt>{modelLabels.annual_income_estimate}</dt><dd>{displayField('annual_income_estimate', active.display?.annual_income_estimate)}</dd></div>
          </dl><p className="muted-copy identity-limit">The VAE score uses only the original seven fields listed in Model Details. Optional consistency and count values are evaluated separately by demo flag rules; they are synthetic indicators and do not verify identity.</p></section>
          {active.demoLabel && <div className="outcome-box"><span>SYNTHETIC GROUND-TRUTH LABEL · EVALUATION ONLY</span><b>{labelText(active.demoLabel)}</b><small>Evaluation label: {outcomeText(active.evaluationOutcome)}. This planted label is separate from the model recommendation and human review.</small></div>}
          {active.scenarioDescription && <div className="outcome-box scenario-box"><span>SYNTHETIC CONSTRUCTION SCENARIO · EVALUATION ONLY</span><b>{(active.scenario || '').replace(/_/g, ' ')}</b><small>{active.scenarioDescription} This describes how the fictional test case was generated; it is not evidence about a real applicant.</small></div>}
          <section className="underwriter-preview"><div className="section-title"><div><p className="eyebrow">SIMULATED UNDERWRITER REVIEW</p><h3>Workflow preview</h3></div><span className="demo-only">DEMO ONLY</span></div><p>Session-only preview. No one is contacted, no application is changed, and no policy decision is made or saved.</p><small>Record {active.id} · {active.review === undefined ? 'Not scored' : active.review ? 'Review suggested' : 'Within range'} · {activePresentation?.comparison ?? 'No score comparison available.'}</small><label>Human review notes<textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} maxLength={500} placeholder="Optional synthetic demonstration note" /></label><label>Preview status<select value={workflowDraft} onChange={(e) => setWorkflowDraft(e.target.value)}>{workflowChoices.map((choice) => <option key={choice}>{choice}</option>)}</select></label><button className="button secondary" onClick={updateWorkflow}>Update local preview</button>{workflowPreview && <small role="status">{workflowPreview} Notes are held in this page only and are not submitted to the API.</small>}</section>
          <details className="model-details"><summary><span>Model details</span><small>Raw MSE · calibrated threshold · feature reconstruction errors</small></summary><div className="model-details-content">
            <div className="score-card"><div className="score-card-top"><span>RAW RECONSTRUCTION MSE</span><b className={activePresentation?.relation === 'above' ? 'score-high' : ''} title={active.score === undefined ? '' : `Unrounded score: ${String(active.score)}`}>{activePresentation?.scoreText ?? '—'}</b></div><p>{activePresentation?.comparison || 'Score is not available.'}</p><div className="threshold-line"><span>Calibrated review threshold</span><b title={active.threshold === undefined ? '' : `Unrounded threshold: ${String(active.threshold)}`}>{activePresentation?.thresholdText ?? '—'}</b></div><small>Mean squared reconstruction error across one-hot categories and standardized numeric features. This score is mathematically unbounded and is displayed compactly without changing the underlying score or threshold.</small></div>
            <section className="detail-section"><div className="section-title"><h3>Statistical deviations</h3><span>NOT CAUSAL EXPLANATIONS</span></div>{active.deviations?.length ? <ul className="deviation-list">{active.deviations.map((deviation, index) => <li key={`${deviation.feature}-${index}`}><div><b>{modelLabels[deviation.feature] || deviation.feature.replace(/_/g, ' ')}</b><small>{featureNotes[deviation.feature] || 'Reconstruction difference from a learned synthetic baseline pattern.'}</small></div><strong>{deviation.residual.toFixed(4)}</strong></li>)}</ul> : <p className="muted-copy">No notable deviations were returned.</p>}<p className="muted-copy">Residuals describe reconstruction differences only. They do not identify why a record differs or indicate wrongdoing.</p></section>
            <section className="detail-section"><div className="section-title"><h3>Feature-level reconstruction errors</h3><span>AVAILABLE API RESIDUALS</span></div>{(active.featureDeviations?.length ? active.featureDeviations : active.deviations || []).length ? <ul className="deviation-list">{(active.featureDeviations?.length ? active.featureDeviations : active.deviations || []).map((deviation, index) => <li key={`feature-${deviation.feature}-${index}`}><b>{modelLabels[deviation.feature] || deviation.feature.replace(/_/g, ' ')}</b><strong>{deviation.residual.toFixed(4)}</strong></li>)}</ul> : <p className="muted-copy">Feature-level errors were not returned by this API response.</p>}</section>
          </div></details>
        </>}
      </aside>
    </section>

    {evaluation && <section className="evaluation-strip evaluation-section" aria-label="Synthetic evaluation summary"><details><summary className="evaluation-summary">Synthetic evaluation · 100 labeled examples <span>Expand metrics</span></summary><div className="evaluation-content">
      <div className="eval-heading"><div><p className="eyebrow">LABELED BATCH CHECK</p><h2>100 synthetic examples</h2></div><span>Labels joined by application ID · never sent for scoring</span></div>
      <div className="eval-counts"><span><b>{evaluation.counts.truePositives}</b>Unusual flagged <i>TP</i></span><span><b>{evaluation.counts.falseNegatives}</b>Unusual missed <i>FN</i></span><span><b>{evaluation.counts.falsePositives}</b>Typical flagged <i>FP</i></span><span><b>{evaluation.counts.trueNegatives}</b>Typical not flagged <i>TN</i></span><span><b>{evaluation.typicalCount}</b>Typical labels</span><span><b>{evaluation.unusualCount}</b>Unusual labels</span></div>
      <div className="eval-metrics"><span>Accuracy <b>{evaluation.accuracy === null ? 'N/A' : `${(evaluation.accuracy * 100).toFixed(1)}%`}</b></span><span>Precision <b>{evaluation.precision === null ? 'N/A' : `${(evaluation.precision * 100).toFixed(1)}%`}</b></span><span>Recall <b>{evaluation.recall === null ? 'N/A' : `${(evaluation.recall * 100).toFixed(1)}%`}</b></span><span>F1 <b>{evaluation.f1 === null ? 'N/A' : `${(evaluation.f1 * 100).toFixed(1)}%`}</b></span><span>False-positive rate <b>{evaluation.falsePositiveRate === null ? 'N/A' : `${(evaluation.falsePositiveRate * 100).toFixed(1)}%`}</b></span><span>ROC-AUC <b>{evaluation.rocAuc === null ? 'N/A' : evaluation.rocAuc.toFixed(3)}</b></span></div>
      <div className="matrix-scroll"><table className="confusion-matrix"><caption>Confusion matrix · rows are synthetic label, columns are model outcome</caption><thead><tr><th></th><th>Within range</th><th>Review suggested</th></tr></thead><tbody><tr><th>Typical</th><td>{evaluation.counts.trueNegatives} TN</td><td>{evaluation.counts.falsePositives} FP</td></tr><tr><th>Intentionally unusual</th><td>{evaluation.counts.falseNegatives} FN</td><td>{evaluation.counts.truePositives} TP</td></tr></tbody></table></div>
      <small>Definitions: accuracy = (TP+TN)/N; precision = TP/(TP+FP); recall = TP/(TP+FN); F1 = 2TP/(2TP+FP+FN); false-positive rate = FP/(FP+TN). ROC-AUC uses the raw score ranking across thresholds. N/A means a zero denominator or a missing class. These metrics use planted synthetic labels only and are not a real-world performance estimate.</small>
    </div></details></section>}

    <footer className="footer"><span>APPGUARD AI · EDUCATIONAL SYNTHETIC DEMO</span><span>Scoring support only · human review required · no real applicant data</span></footer>
  </main>;
}

export default App;
