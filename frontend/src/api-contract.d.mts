export type FeatureDeviation = { feature: string; residual: number };
export type DemoRecord = {
  id: string;
  application: Record<string, unknown>;
  fields: [string, unknown][];
  description?: string;
  demoGroup: 'baseline' | 'unusual_demo';
  score?: number;
  threshold?: number;
  review?: boolean;
  deviations?: FeatureDeviation[];
  scoreError?: string;
};
export function normalizeDemoPayload(payload: unknown): DemoRecord[];
export function normalizeBatchPayload(payload: unknown, records: DemoRecord[]): DemoRecord[];
export function readableApiError(value: unknown, fallback: string): string;
