import type { DemoRecord } from './api-contract.mjs';
export type LabeledDemoRecord = DemoRecord & {
  demoLabel: 'typical_synthetic' | 'unusual_synthetic';
  evaluationOutcome: 'flagged_true_positive' | 'missed_false_negative' | 'flagged_false_positive' | 'not_flagged_true_negative';
  scenario?: string;
  scenarioDescription?: string;
};
export type EvaluationResult = {
  rows: LabeledDemoRecord[];
  counts: { truePositives: number; falseNegatives: number; falsePositives: number; trueNegatives: number };
  confusionMatrix: { truePositive: number; falseNegative: number; falsePositive: number; trueNegative: number };
  typicalCount: number;
  unusualCount: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  falsePositiveRate: number | null;
  rocAuc: number | null;
};
export function evaluateLabeledScores(scoredRecords: DemoRecord[], sidecar: unknown): EvaluationResult;
