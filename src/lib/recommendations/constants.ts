export const RECOMMENDATION_TYPES = ['rewrite', 'foresight', 'linking', 'expansion'] as const;

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number];

export const RECOMMENDATION_STATUSES = ['pending', 'in_progress', 'done', 'dismissed'] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_TO_TASK_ACTION: Record<RecommendationType, string> = {
  rewrite: 'rewrite',
  foresight: 'write',
  linking: 'linking',
  expansion: 'research'
};
