export type FlagCategory = 'model' | 'statistical' | 'consistency' | 'behavior' | 'data_quality';
export type FlagSeverity = 'info' | 'review' | 'warning' | 'high';
export type ApplicationFlag = {
  code: string;
  category: string;
  name: string;
  severity: FlagSeverity;
  triggeringValue: string | number;
  reference: string;
  explanation: string;
};
export type FlagRow = {
  id: string;
  application: Record<string, unknown>;
  score?: number;
  threshold?: number;
  review?: boolean;
  flags?: ApplicationFlag[];
  dataQualityIssues?: Array<{ field: string; actual: string | number; reference: string; explanation: string }>;
  scoreError?: string;
  [key: string]: unknown;
};
export function validateScoringInput(application: Record<string, unknown>): Array<{ field: string; actual: string | number; reference: string; explanation: string }>;
export function buildApplicationFlags(row: FlagRow): ApplicationFlag[];
export function filterFlaggedRows<T extends FlagRow>(rows: T[], options?: { category?: string; severity?: string }): T[];
export function summarizeFlags(rows: FlagRow[]): {
  totalFlagged: number;
  highDeviation: number;
  consistencyRelated: number;
  behaviorRelated: number;
  dataQualityWarnings: number;
  withinRange: number;
};
