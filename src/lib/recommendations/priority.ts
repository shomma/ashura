type RecommendationPriorityLike = {
  id?: string | null;
  title?: string | null;
  priority?: number | null;
  evidence?: unknown;
  dueAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export function getRecommendationDisplayPriority(item: RecommendationPriorityLike) {
  const evidenceScore = extractEvidenceOpportunityScore(item.evidence);
  const rawPriority = evidenceScore ?? item.priority ?? 1;
  return clampInt(Math.round(rawPriority), 1, 95);
}

export function compareRecommendationsForDisplay<T extends RecommendationPriorityLike>(a: T, b: T) {
  const aPriority = getRecommendationDisplayPriority(a);
  const bPriority = getRecommendationDisplayPriority(b);
  if (bPriority !== aPriority) return bPriority - aPriority;

  const aDue = toTime(a.dueAt) ?? Number.MAX_SAFE_INTEGER;
  const bDue = toTime(b.dueAt) ?? Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) return aDue - bDue;

  const aCreated = toTime(a.createdAt) ?? 0;
  const bCreated = toTime(b.createdAt) ?? 0;
  if (aCreated !== bCreated) return aCreated - bCreated;

  const titleOrder = String(a.title || '').localeCompare(String(b.title || ''), 'ja');
  if (titleOrder !== 0) return titleOrder;

  return String(a.id || '').localeCompare(String(b.id || ''));
}

function extractEvidenceOpportunityScore(evidence: unknown) {
  const value = parseEvidence(evidence);
  if (!value || typeof value !== 'object') return null;

  const score = (value as any)?.research?.opportunityScore ?? (value as any)?.opportunityScore;
  const numeric = Number(score);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseEvidence(evidence: unknown) {
  if (typeof evidence !== 'string') return evidence;
  try {
    return JSON.parse(evidence);
  } catch {
    return null;
  }
}

function toTime(value: Date | string | null | undefined) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
