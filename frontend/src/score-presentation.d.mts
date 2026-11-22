export type ScorePresentation = {
  scoreText: string;
  thresholdText: string;
  ratio: number | null;
  comparison: string;
  reviewRecommended: boolean;
  relation: 'at' | 'above' | 'below';
};
export function scorePresentation(score: number, threshold: number): ScorePresentation;
