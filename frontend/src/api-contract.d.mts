export type FeatureDeviation = { feature: string; residual: number };
export type DemoRecord = {
  id: string;
  application: Record<string, unknown>;
  fields: [string, unknown][];
  description?: string;
  demoGroup?: 'baseline' | 'unusual_demo';
  score?: number;
  threshold?: number;
  review?: boolean;
  deviations?: FeatureDeviation[];
  scoreError?: string;
};
export function normalizeDemoPayload(payload: unknown): DemoRecord[];
export function normalizeApplicationsPayload(payload: unknown): DemoRecord[];
export function normalizeDisplayContext(payload: unknown, applicationIds: string[]): Map<string, Record<string, number>>;
export function normalizeUploadPayload(payload: unknown, idPrefix?: string): Array<DemoRecord & { display: Record<string, number> }>;
export function normalizeBatchPayload(payload: unknown, records: DemoRecord[]): DemoRecord[];
export function readableApiError(value: unknown, fallback: string): string;
