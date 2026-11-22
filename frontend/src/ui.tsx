import { useEffect, useMemo, useState } from 'react';
import batchAsset from '../../data/synthetic/test_batch_100.json?url';
import labelsAsset from '../../data/synthetic/test_batch_100_labels.json?url';
import { normalizeApplicationsPayload, normalizeBatchPayload, readableApiError, type DemoRecord } from './api-contract.mjs';
import { evaluateLabeledScores, type EvaluationResult, type LabeledDemoRecord } from './evaluation.mjs';

const disclaimer = 'An anomaly score indicates statistical deviation from synthetic baseline patterns. It is not a finding of fraud or an automated decision. A qualified human must review any follow-up.';
const moneyFields = new Set(['coverage_amount', 'deductible_amount', 'annual_income_estimate', 'requested_coverage', 'deductible']);
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

async function api(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(response.ok ? `The API returned invalid JSON from ${url}.` : `Request failed (${response.status}) with a non-JSON response.`);
  }
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? body.detail : undefined;
    throw new Error(readableApiError(detail, `Request failed (${response.status}).`));
  }
  return body;
}

async function localJsonAsset(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load local synthetic demo file (${response.status}).`);
  try {
    return await response.json();
  } catch {
    throw new Error('A local synthetic demo file contains invalid JSON.');
  }
}

function formatField(name: string, value: unknown): string {
  if (moneyFields.has(name) && typeof value === 'number' && Number.isFinite(value)) return currency.format(value);
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'number' && !Number.isFinite(value)) return 'Unavailable';
  return String(value);
}

function label(name: string): string {
  return name.replace(/_/g, ' ');
}

function outcomeText(outcome: LabeledDemoRecord['evaluationOutcome']): string {
  switch (outcome) {
    case 'flagged_true_positive': return 'Flagged (true positive)';
    case 'missed_false_negative': return 'Missed (false negative)';
    case 'flagged_false_positive': return 'Flagged (false positive)';
    case 'not_flagged_true_negative': return 'Not flagged (true negative)';
  }
}

function percent(value: number | null): string {
  return value === null ? 'N/A' : `${(value * 100).toFixed(1)}%`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export default function App() {
  const [rows, setRows] = useState<LabeledDemoRecord[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [health, setHealth] = useState('Checking service…');
  const [upload, setUpload] = useState('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const active = useMemo(() => rows.find((row) => row.id === selected), [rows, selected]);

  async function load() {
    setStatus('loading');
    setError('');
    setEvaluation(null);
    try {
      const [batchPayload, labelsPayload, healthPayload] = await Promise.all([
        localJsonAsset(batchAsset),
        localJsonAsset(labelsAsset),
        api('/api/v1/health'),
      ]);
      if (!isObject(healthPayload) || healthPayload.status !== 'healthy') {
        throw new Error('The scoring API is not healthy. Check the backend and retry.');
      }
      setHealth(healthPayload.model_loaded === false ? 'Service ready · model unavailable' : 'Model ready');

      // Labels remain client-side and are intentionally absent from this API payload.
      const records: DemoRecord[] = normalizeApplicationsPayload(batchPayload);
      const scorePayload = await api('/api/v1/score/batch', {
        method: 'POST',
        body: JSON.stringify({ applications: records.map((record) => record.application) }),
      });
      const scoredRows = normalizeBatchPayload(scorePayload, records);
      const result = evaluateLabeledScores(scoredRows, labelsPayload);
      setEvaluation(result);
      setRows(result.rows);
      setSelected(result.rows[0]?.id || '');
      setStatus('ready');
    } catch (cause) {
      setRows([]);
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Unable to load and score the demo samples.');
    }
  }

  useEffect(() => { void load(); }, []);

  async function scoreUpload(file?: File) {
    if (!file) return;
    setError('');
    setUpload('');
    try {
      if (file.size > 250_000) throw new Error('JSON file must be 250 KB or smaller.');
      const parsed: unknown = JSON.parse(await file.text());
      const items = Array.isArray(parsed) ? parsed : isObject(parsed) ? parsed.applications : undefined;
      if (!Array.isArray(items) || !items.length || items.length > 100) {
        throw new Error('Provide an array of 1–100 application objects (or {"applications": [...]}).');
      }
      const output = await api('/api/v1/score/batch', {
        method: 'POST',
        body: JSON.stringify({ applications: items }),
      });
      if (!isObject(output) || !Array.isArray(output.results) || output.results.length !== items.length) {
        throw new Error('Scoring response is malformed: expected one result per uploaded application.');
      }
      const successes = output.results.filter((item) => isObject(item) && (!item.status || item.status === 'success'));
      const reviews = successes.filter((item) => item.review_recommended === true).length;
      const failures = items.length - successes.length;
      setUpload(`${successes.length} of ${items.length} records scored. Review suggested for ${reviews}.${failures ? ` ${failures} could not be scored.` : ''}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to score the uploaded batch.');
    }
  }

  const activeScoreRatio = active?.score !== undefined && active.threshold !== undefined && active.threshold > 0
    ? Math.min(100, Math.max(0, 100 * active.score / active.threshold))
    : 0;

  return <main className="shell">
    <header className="top">
      <div className="brand"><span className="mark">AG</span><div><b>APPGUARD <i>AI</i></b><small>APPLICATION INTEGRITY · DEMO WORKSPACE</small></div></div>
      <div className="health"><span className={`dot ${status === 'ready' ? 'good' : ''}`}></span>{health}</div>
    </header>

    <section className="intro"><div><p className="eyebrow">INSURANCE OPERATIONS / SYNTHETIC ENVIRONMENT</p><h1>Application<br />review queue</h1></div><p className="intro-copy">A statistical screening aid for surfacing records that differ from a synthetic baseline. Every result calls for human context.</p></section>
    <div className="notice"><span className="notice-mark">i</span><p><b>Human review required.</b> Scores indicate statistical deviation only. They do not establish fraud, and must never drive an automatic approval, denial, price, or policy action.</p></div>

    <section className="workspace">
      <div className="queue">
        <div className="section-head"><div><p className="eyebrow">DEMO RECORDS</p><h2>Review queue <small>{String(rows.length).padStart(2, '0')}</small></h2></div><button className="refresh" onClick={() => void load()} aria-label="Reload demo samples">↻</button></div>
        {status === 'loading' && <div className="state">Loading labeled synthetic batch and model scores…</div>}
        {status === 'error' && <div className="state error" role="alert">{error}<button onClick={() => void load()}>Retry</button></div>}
        {status === 'ready' && evaluation && <div className="demo-eval" aria-label="Synthetic demo evaluation">
          <div className="eval-title"><b>100-record synthetic evaluation</b><small>Labels are matched to scores by application ID.</small></div>
          <div className="eval-counts">
            <span><b>{evaluation.counts.truePositives}</b> Unusual flagged <i>TP</i></span>
            <span><b>{evaluation.counts.falseNegatives}</b> Unusual missed <i>FN</i></span>
            <span><b>{evaluation.counts.falsePositives}</b> Typical flagged <i>FP</i></span>
            <span><b>{evaluation.counts.trueNegatives}</b> Typical not flagged <i>TN</i></span>
          </div>
          <div className="eval-rates">
            <span>Precision <b>{percent(evaluation.precision)}</b></span>
            <span>Recall <b>{percent(evaluation.recall)}</b></span>
            <span>False-positive rate <b>{percent(evaluation.falsePositiveRate)}</b></span>
          </div>
          <small>Precision = TP/(TP+FP); recall = TP/(TP+FN); false-positive rate = FP/(FP+TN). N/A means the denominator is zero. Synthetic demonstration only; these metrics do not establish real-world detection performance.</small>
        </div>}
        {status === 'ready' && rows.map((row) => <button className={`record ${selected === row.id ? 'selected' : ''}`} key={row.id} onClick={() => setSelected(row.id)}>
          <div className="record-main"><b>{row.id}</b><span className="truth-badge">{row.demoLabel === 'unusual_synthetic' ? 'Intentionally unusual' : 'Typical synthetic'}</span><span className={`badge ${row.review ? 'review' : ''}`}>{row.review ? 'Review suggested' : 'Within range'}</span></div>
          <div className="record-meta">{String(row.application.policy_type ?? 'Application')} · {formatField('requested_coverage', row.application.requested_coverage)} coverage · {outcomeText(row.evaluationOutcome)}</div>
          <div className="scoreline"><span>ANOMALY SCORE</span><strong>{row.score === undefined ? '—' : row.score.toFixed(5)}</strong><span className="track"><i style={{ width: `${row.score === undefined ? 0 : Math.max(2, Math.min(100, (row.score / (row.threshold || 1)) * 50))}%` }} /></span></div>
        </button>)}
        <div className="upload"><label htmlFor="jsonfile">Score a JSON batch</label><input id="jsonfile" type="file" accept="application/json,.json" onChange={(event) => void scoreUpload(event.target.files?.[0])} /><small>1–100 synthetic application objects · 250 KB max · scored in memory, not retained</small>{upload && <p className="success">{upload}</p>}{error && status === 'ready' && <p className="error-text" role="alert">{error}</p>}</div>
      </div>

      <aside className="detail">
        {active ? <>
          <div className="detail-head"><div><p className="eyebrow">SELECTED APPLICATION</p><h2>{active.id}</h2></div><span className={`badge ${active.review ? 'review' : ''}`}>{active.review ? 'Review suggested' : 'Within range'}</span></div>
          <div className="evaluation-label"><span className="truth-badge">{active.demoLabel === 'unusual_synthetic' ? 'Intentionally unusual' : 'Typical synthetic'}</span><span>{outcomeText(active.evaluationOutcome)}</span></div>
          {active.description && <p className="muted">{active.description}</p>}
          {active.scoreError ? <div className="state error" role="alert">{active.scoreError}</div> : <div className="scorebox"><span>ANOMALY SCORE</span><b>{active.score?.toFixed(6) ?? '—'}</b><small>Calibration threshold · {active.threshold?.toFixed(6) ?? '—'}</small><div className="bar"><i style={{ width: `${activeScoreRatio}%` }} /></div></div>}
          <h3>Submitted application fields</h3>
          <dl>{active.fields.map(([name, value]) => <div key={name}><dt>{label(name)}</dt><dd>{formatField(name, value)}</dd></div>)}</dl>
          <h3>Largest statistical deviations</h3>
          {active.deviations?.length ? <ul className="deviations">{active.deviations.map((deviation, index) => <li key={`${deviation.feature}-${index}`}><span>{label(deviation.feature)}</span><b>{deviation.residual.toFixed(4)}</b></li>)}</ul> : <p className="muted">No feature deviations returned by the API.</p>}
          <p className="small-note">Residuals show reconstruction differences from a learned statistical pattern. They are not reasons or explanations for fraud.</p>
        </> : <div className="state">Select a record to inspect its fields and deviations.</div>}
      </aside>
    </section>
    <footer><span>APPGUARD AI · EDUCATIONAL PROTOTYPE</span><span>NO REAL APPLICANT DATA · NO AUTOMATED DECISIONS</span></footer>
  </main>;
}
