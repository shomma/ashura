import { decodeJsonArray, decodeJsonField } from '@/lib/json-fields';

export function mapOpportunityType(db: {
  source?: string | null;
  category?: string | null;
  tags?: unknown;
  title?: string | null;
}): 'new' | 'rewrite' | 'linking' | 'recover' | 'trend' {
  const source = (db.source || '').toLowerCase();
  const category = (db.category || '').toLowerCase();
  const tags = decodeJsonArray(db.tags).map((item) => String(item).toLowerCase());
  const title = (db.title || '').toLowerCase();

  if (source.includes('trend') || category === 'trend') return 'trend';
  if (source.includes('link') || tags.includes('linking')) return 'linking';
  if (source.includes('recover') || category === 'recover') return 'recover';
  if (source.includes('rewrite') || category === 'rewrite' || tags.includes('rewrite')) return 'rewrite';
  if (tags.includes('trend')) return 'trend';
  if (title.includes('リライト') || title.includes('rewrite')) return 'rewrite';
  return 'new';
}

export function mapOpportunityStatusDbToApi(raw: string): 'open' | 'saved' | 'dismissed' | 'tasked' | 'done' {
  const value = String(raw || 'open').toLowerCase();
  if (value === 'saved' || value === 'in_review') return 'saved';
  if (value === 'dismissed' || value === 'archived') return 'dismissed';
  if (value === 'tasked') return 'tasked';
  if (value === 'done') return 'done';
  return 'open';
}

export function mapOpportunityStatusApiToDb(
  raw: string | undefined
): 'open' | 'saved' | 'dismissed' | 'tasked' | 'done' | 'in_review' | 'archived' {
  const value = String(raw || '').toLowerCase();
  if (value === 'saved') return 'in_review';
  if (value === 'dismissed') return 'dismissed';
  if (value === 'tasked') return 'tasked';
  if (value === 'done') return 'done';
  return 'open';
}

export function mapTaskStatusDbToApi(
  raw: string | undefined | null
): 'todo' | 'doing' | 'review' | 'done' | 'blocked' {
  const value = String(raw || 'pending').toLowerCase();
  if (value === 'pending') return 'todo';
  if (value === 'in_progress' || value === 'running') return 'doing';
  if (value === 'done') return 'done';
  if (value === 'blocked') return 'blocked';
  return 'review';
}

export function mapTaskStatusApiToDb(
  raw: string | undefined | null
): 'pending' | 'in_progress' | 'blocked' | 'done' {
  const value = String(raw || '').toLowerCase();
  if (value === 'todo') return 'pending';
  if (value === 'doing') return 'in_progress';
  if (value === 'review') return 'blocked';
  if (value === 'blocked') return 'blocked';
  if (value === 'done') return 'done';
  return 'pending';
}

export function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

export function normalizeScore(value: unknown, min = 0, max = 100): number {
  const base = safeNumber(value, 0);
  return Number(Math.min(max, Math.max(min, base)).toFixed(4));
}

export function normalizeConfidence01(raw: unknown): number {
  const val = normalizeScore(raw, 0, 100);
  return Number(Math.min(1, Math.max(0, val / 100)).toFixed(4));
}

function freshnessFromDate(raw: Date | null | undefined): number {
  const now = Date.now();
  const created = raw ? new Date(raw).getTime() : now;
  const ageHours = Math.max(0, (now - created) / (1000 * 60 * 60));
  return Number(Math.max(0, 100 - Math.min(100, ageHours * 1.8)).toFixed(2));
}

export function buildOpportunityScoreBreakdown(rec: {
  score?: unknown;
  impactScore?: unknown;
  confidence?: unknown;
  observedAt?: Date | null;
  createdAt: Date;
}) {
  const score = normalizeScore(rec.score, 0, 100);
  const impactScore = normalizeScore(rec.impactScore, 0, 100);
  const confidence = normalizeScore(rec.confidence, 0, 100);

  return {
    total: score,
    demand: Number((score * 0.9 + impactScore * 0.1).toFixed(2)),
    competition: Number((Math.max(8, 100 - score * 0.45 - confidence * 0.1)).toFixed(2)),
    achievability: Number(impactScore.toFixed(2)),
    business: Number((confidence * 0.85).toFixed(2)),
    freshness: freshnessFromDate(rec.observedAt || rec.createdAt)
  };
}

export function buildOpportunityExpected(args: {
  score: { total: number };
  confidence: number;
}) {
  const sessions = Math.max(0, Math.round(args.score.total * 12 + args.confidence * 8));
  const revenue = Math.max(0, Math.round(sessions * (1.5 + args.confidence / 25)));
  return {
    sessions,
    revenue
  };
}

export function buildOpportunityEvidenceItems(
  items?: Array<{
    kind?: string;
    label?: string;
    value?: string | null;
    sourceUrl?: string | null;
    observedAt?: Date | null;
    payload?: unknown;
  }>
) {
  if (!Array.isArray(items) || !items.length) return [] as Array<{ source: string; summary: string; ref?: any }>;
  return items.map((item) => ({
    source: String(item.kind || 'signal'),
    summary: [item.label, item.value].filter(Boolean).join(' '),
    ref: {
      sourceUrl: item.sourceUrl || null,
      payload: decodeJsonField(item.payload, null),
      date: item.observedAt ? new Date(item.observedAt).toISOString() : null
    }
  }));
}

export function buildOpportunityActions(rec: {
  title?: string | null;
  type?: string;
}) {
  const label = rec.title || '提案';
  const type = (rec.type || 'new') as 'new' | 'rewrite' | 'linking' | 'recover' | 'trend';
  if (type === 'trend') {
    return [
      { kind: 'title', items: [`${label}に関連する潮流要素を先頭に明示`] },
      { kind: 'outline', items: ['トレンド導線', '検索意図別の比較', '導入導入', '次の一歩'] }
    ];
  }
  if (type === 'linking') {
    return [
      { kind: 'title', items: [`${label}を内部リンクハブ記事として再定義`] },
      { kind: 'outline', items: ['関連記事リンク', '更新ノート', '関連セクションの追加'] }
    ];
  }
  if (type === 'recover' || type === 'rewrite') {
    return [
      { kind: 'title', items: [`${label}の問題解決導線を再設計`] },
      { kind: 'outline', items: ['タイトルを課題主語で起点化', '比較要素を追加', 'CTAを明確化'] }
    ];
  }
  return [
    { kind: 'title', items: [`${label}を想定需要で再評価`] },
    { kind: 'outline', items: ['導入', '読みやすさ改善', '情報網羅性の拡張'] }
  ];
}

export function mapOpportunityForApi(
  opportunity: {
    id: string;
    siteId: string;
    title: string;
    source: string;
    status: string;
    score: number | null;
    impactScore?: number | null;
    confidence: number | null;
    why?: string | null;
    summary?: string | null;
    impact?: string | null;
    observedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    evidences?: Array<{
      id?: string;
      kind?: string;
      label?: string;
      value?: string | null;
      sourceUrl?: string | null;
      observedAt?: Date | null;
      payload?: unknown;
    }>;
  },
  opts?: {
    category?: string | null;
    tags?: unknown;
  }
) {
  const score = buildOpportunityScoreBreakdown({
    score: opportunity.score,
    impactScore: opportunity.impactScore,
    confidence: opportunity.confidence,
    observedAt: opportunity.observedAt,
    createdAt: opportunity.createdAt
  });
  const expected = buildOpportunityExpected({
    score,
    confidence: Number(opportunity.confidence ?? 0)
  });
  const confidence = normalizeConfidence01(opportunity.confidence);
  const type = mapOpportunityType({
    source: opportunity.source,
    category: opts?.category ?? null,
    tags: opts?.tags ?? [],
    title: opportunity.title
  });

  return {
    id: opportunity.id,
    siteId: opportunity.siteId,
    type,
    status: mapOpportunityStatusDbToApi(opportunity.status),
    title: opportunity.title,
    keyword: null,
    postId: null,
    score,
    expected: {
      sessions: expected.sessions,
      revenue: expected.revenue
    },
    confidence,
    why: opportunity.why || opportunity.summary || '',
    evidence: buildOpportunityEvidenceItems(opportunity.evidences),
    actions: buildOpportunityActions({ title: opportunity.title, type }),
    updatedAt: opportunity.updatedAt.toISOString(),
    createdAt: opportunity.createdAt.toISOString(),
    dedupeKey: `${opportunity.siteId}:${opportunity.id}`,
    expiresAt: opportunity.updatedAt.toISOString()
  };
}

export function mapTaskForApi(task: {
  id: string;
  siteId: string;
  opportunityId?: string | null;
  action: string;
  status: string;
  title: string;
  source: string;
  dueAt?: Date | null;
  recommendedDueAt?: Date | null;
  payload?: unknown;
  recommendationSourceId?: string | null;
  recommendationType?: string | null;
  recommendationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  taskOutcomes?: Array<{
    id: string;
    status: string;
    outcome?: string | null;
    scoreDelta?: number | null;
    executedAt?: Date | null;
    payload?: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
}) {
  const taskStatus = mapTaskStatusDbToApi(task.status);
  const latestOutcome = task.taskOutcomes && task.taskOutcomes[0];
  const taskPayload = decodeJsonField(task.payload, null);
  const latestOutcomePayload = latestOutcome
    ? decodeJsonField<Record<string, unknown>>(latestOutcome.payload, {})
    : null;
  return {
    id: task.id,
    siteId: task.siteId,
    opportunityId: task.opportunityId ?? null,
    type: task.action,
    status: taskStatus,
    title: task.title,
    source: task.source,
    dueAt: (task.dueAt || task.recommendedDueAt)?.toISOString() || null,
    payload: taskPayload,
    recommendation: task.recommendationSourceId
      ? {
          id: task.recommendationSourceId,
          type: task.recommendationType || null,
          reason: task.recommendationReason || null
        }
      : null,
    outcome: latestOutcome
      ? {
          id: latestOutcome.id,
          taskId: task.id,
          siteId: task.siteId,
          measuredAt: latestOutcome.executedAt
            ? latestOutcome.executedAt.toISOString()
            : latestOutcome.createdAt.toISOString(),
          before: latestOutcomePayload?.before || null,
          after: latestOutcomePayload?.after || null,
          delta: normalizeTaskOutcomeDelta(latestOutcome),
          confidence: normalizeConfidence01(latestOutcomePayload?.confidence),
          status: latestOutcome.status,
          beforeAfter: null,
          scoreDelta: latestOutcome.scoreDelta ?? 0
        }
      : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  };
}

function normalizeTaskOutcomeDelta(outcome: {
  scoreDelta?: number | null;
  payload?: unknown;
}): { sessions?: number; revenue?: number; avgPosition?: number; ctr?: number } {
  const payload = decodeJsonField<Record<string, unknown>>(outcome?.payload, {});
  if (payload && typeof payload === 'object') {
    const explicit =
      (payload.beforeAfter && typeof payload.beforeAfter === 'object' ? payload.beforeAfter : null) ??
      payload;
    const d = explicit as Record<string, unknown>;
    if (d && typeof d === 'object') {
      const direct = {
        sessions: safeNumber(d.sessionsDelta ?? d.sessions, 0),
        revenue: safeNumber(d.revenueDelta ?? d.revenue, 0),
        avgPosition: safeNumber(d.avgPositionDelta ?? d.positionDelta, 0),
        ctr: safeNumber(d.ctrDelta ?? d.ctr, 0)
      };
      if (Object.values(direct).some((value) => value !== 0)) {
        return direct;
      }
    }
  }
  return {
    sessions: safeNumber(outcome.scoreDelta, 0),
    revenue: 0,
    avgPosition: 0,
    ctr: 0
  };
}
