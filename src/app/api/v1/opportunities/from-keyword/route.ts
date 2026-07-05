import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { encodeJsonArray } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

type CreateFromKeywordBody = {
  siteId?: string;
  keywordId?: string;
  type?: 'new' | 'rewrite' | 'linking' | 'recover' | 'trend';
};

const ALLOWED_TYPES = new Set(['new', 'rewrite', 'linking', 'recover', 'trend']);

export const runtime = 'nodejs';

function mapType(raw?: string) {
  const value = (raw || 'new').trim().toLowerCase();
  return ALLOWED_TYPES.has(value) ? value : 'new';
}

function buildOpportunity(
  keyword: { id: string; term: string; volume: number | null },
  type: string
) {
  const score = Math.max(10, Math.min(100, Math.round((keyword.volume || 30) / 2 + 20)));
  return {
    title: `Keyword ${type}: ${keyword.term}`,
    source: `keyword:${type}`,
    why: `keywordId=${keyword.id}, source=from-keyword`,
    summary: `keyword ${keyword.term} as ${type} opportunity`,
    score,
    impactScore: 60,
    confidence: 70,
    tags: [type],
    category: type
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CreateFromKeywordBody;
    const keywordId = body.keywordId?.trim();
    if (!keywordId) {
      return fail(req, 400, 'BAD_REQUEST', 'keywordId is required');
    }

    const type = mapType(body.type);
    const site = await requireSingleSite();

    const keyword = await prisma.keyword.findFirst({
      where: { id: keywordId, siteId: site.id }
    });
    if (!keyword) {
      return fail(req, 404, 'NOT_FOUND', 'keyword not found');
    }

    const payload = buildOpportunity(keyword, type);
    const dedupeKey = `keyword:${keyword.id}:${type}`;
    const existing = await prisma.opportunity.findFirst({
      where: { siteId: site.id, source: payload.source, title: payload.title }
    });
    if (existing) {
      return ok(req, {
        siteId: site.id,
        opportunityId: existing.id,
        dedupeKey,
        status: 'exists',
        message: 'already exists'
      });
    }

    const created = await prisma.opportunity.create({
      data: {
        siteId: site.id,
        title: payload.title,
        source: payload.source,
        status: 'open',
        score: payload.score,
        impactScore: payload.impactScore,
        confidence: payload.confidence,
        why: payload.why,
        summary: payload.summary,
        tags: encodeJsonArray(payload.tags),
        category: payload.category
      }
    });

    return ok(req, {
      siteId: site.id,
      opportunityId: created.id,
      dedupeKey,
      type,
      createdAt: created.createdAt,
      status: 'created'
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
