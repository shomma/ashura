import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import {
  buildOpportunityExpected,
  buildOpportunityScoreBreakdown,
  buildOpportunityEvidenceItems,
  mapOpportunityType,
  mapOpportunityStatusDbToApi,
  mapOpportunityStatusApiToDb,
  buildOpportunityActions,
  normalizeConfidence01,
  normalizeScore,
  safeNumber
} from '@/lib/api-mapping';
import { decodeJsonArray, decodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

type SortKey = 'expectedRevenue' | 'score' | 'confidence';

type QueryParams = {
  type: string | null;
  status: string | null;
  sort: SortKey;
  limit: number;
  minConfidence: number | null;
  maxConfidence: number | null;
  source: string | null;
};

type OpportunityListItem = {
  id: string;
  siteId: string;
  type: string;
  status: string;
  title: string;
  why: string;
  score: number;
  scoreBreakdown: {
    total: number;
    demand: number;
    competition: number;
    achievability: number;
    business: number;
    freshness: number;
  };
  expected: {
    sessions: number;
    revenue: number;
  };
  confidence: number;
  source: string;
  impact: string | null;
  evidenceCount: number;
  evidences: Array<{
    id: string;
    kind: string;
    label: string;
    value: string | null;
    sourceUrl: string | null;
    observedAt: string | null;
  }>;
  evidence: Array<{
    source: string;
    summary: string;
    ref: { sourceUrl: string | null; payload: unknown; date: string | null };
  }>;
  actions: Array<{ kind: string; items: string[] }>;
  task: {
    id: string;
    status: string;
    href: string;
  } | null;
  createdAt: string;
  updatedAt: string;
};

const ALLOWED_SORTS = new Set<SortKey>(['expectedRevenue', 'score', 'confidence']);
const ALLOWED_STATUSES = new Set(['open', 'saved', 'dismissed', 'tasked', 'done']);
const ALLOWED_TYPES = new Set(['new', 'rewrite', 'linking', 'recover', 'trend']);
const MAX_LIMIT = 200;

function parseLimit(value: string | null): number {
  const parsed = Number(value || '50');
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsed)));
}

function parseConfidenceFilter(value: string | null): number | null {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeConfidence(value: number) {
  return normalizeConfidence01(value);
}

function toDbStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const mapped = mapOpportunityStatusApiToDb(raw);
  return mapped;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const params = {
      type: searchParams.get('type')?.trim().toLowerCase() || null,
      status: searchParams.get('status')?.trim().toLowerCase() || null,
      source: searchParams.get('source')?.trim().toLowerCase() || null,
      sort: (searchParams.get('sort')?.trim() || 'score') as SortKey,
      limit: parseLimit(searchParams.get('limit')),
      minConfidence: parseConfidenceFilter(searchParams.get('minConfidence')),
      maxConfidence: parseConfidenceFilter(searchParams.get('maxConfidence'))
    } as QueryParams;

    if (!ALLOWED_SORTS.has(params.sort)) {
      return fail(req, 400, 'BAD_REQUEST', 'sort must be expectedRevenue, score, or confidence');
    }
    if (params.type && !ALLOWED_TYPES.has(params.type)) {
      return fail(req, 400, 'BAD_REQUEST', 'invalid type');
    }
    if (params.status && !ALLOWED_STATUSES.has(params.status)) {
      return fail(req, 400, 'BAD_REQUEST', 'invalid status');
    }

    const site = await requireSingleSite();

    const requestedStatus = toDbStatus(params.status);

    const opportunities = await prisma.opportunity.findMany({
      where: {
        siteId: site.id,
        ...(requestedStatus ? { status: requestedStatus } : {}),
        ...(params.source ? { source: { contains: params.source } } : {})
      },
      orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
      take: MAX_LIMIT,
      include: {
        evidences: {
          orderBy: { observedAt: 'desc' },
          take: 20
        },
        tasks: {
          select: { id: true, status: true, title: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    const rows = opportunities
      .map((opportunity) => {
        const type = mapOpportunityType({
          source: opportunity.source,
          category: opportunity.category,
          tags: decodeJsonArray(opportunity.tags),
          title: opportunity.title
        });

        if (params.type && type !== params.type) return null;

        const scoreBreakdown = buildOpportunityScoreBreakdown({
          score: opportunity.score,
          impactScore: opportunity.impactScore,
          confidence: opportunity.confidence,
          observedAt: opportunity.observedAt,
          createdAt: opportunity.createdAt
        });

        const confidence = normalizeConfidence(opportunity.confidence);

        if (
          params.minConfidence !== null &&
          params.maxConfidence === null &&
          confidence < params.minConfidence
        ) {
          return null;
        }
        if (
          params.maxConfidence !== null &&
          params.maxConfidence !== null &&
          confidence > params.maxConfidence
        ) {
          return null;
        }

        const expected = buildOpportunityExpected({
          score: scoreBreakdown,
          confidence
        });

        const evidence = buildOpportunityEvidenceItems(
          opportunity.evidences.map((item) => ({
            kind: item.kind,
            label: item.label,
            value: item.value,
            sourceUrl: item.sourceUrl,
            observedAt: item.observedAt,
            payload: decodeJsonField(item.payload, null)
          }))
        );

        const mappedStatus = mapOpportunityStatusDbToApi(opportunity.status);
        const task = opportunity.tasks[0]
          ? {
              id: opportunity.tasks[0].id,
              status: opportunity.tasks[0].status,
              href: `/dashboard/tasks/${opportunity.tasks[0].id}`
            }
          : null;

        return {
          id: opportunity.id,
          siteId: opportunity.siteId,
          type,
          status: mappedStatus,
          title: opportunity.title,
          why: opportunity.why || opportunity.summary || '',
          score: normalizeScore(scoreBreakdown.total, 0, 100),
          scoreBreakdown,
          expected,
          confidence,
          source: opportunity.source,
          impact: opportunity.impact ?? null,
          evidenceCount: opportunity.evidences.length,
          evidences: opportunity.evidences.map((item) => ({
            id: item.id,
            kind: item.kind,
            label: item.label,
            value: item.value,
            sourceUrl: item.sourceUrl || null,
            observedAt: item.observedAt ? item.observedAt.toISOString() : null
          })),
          evidence,
          actions: buildOpportunityActions({
            title: opportunity.title,
            type
          }),
          task,
          createdAt: opportunity.createdAt.toISOString(),
          updatedAt: opportunity.updatedAt.toISOString()
        };
      })
      .filter((item) => item !== null) as OpportunityListItem[];

    const sortedRows = rows
      .slice()
      .sort((a, b) => {
        if (params.sort === 'expectedRevenue') return b.expected.revenue - a.expected.revenue;
        if (params.sort === 'confidence') return b.confidence - a.confidence;
        return b.score - a.score;
      })
      .slice(0, params.limit);

    return ok(req, {
      siteId: site.id,
      items: sortedRows,
      count: sortedRows.length,
      sort: params.sort,
      filters: {
        type: params.type ?? null,
        status: params.status ?? null,
        source: params.source ?? null
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
