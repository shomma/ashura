import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

type EvaluateBody = {
  siteId?: string;
  keywords?: string[];
  location?: string;
  language?: string;
};

type EvaluateItem = {
  term: string;
  normalizedTerm: string;
  score: number;
  estimatedVolume: number;
  competition: number;
  trendVelocity: number;
};

const MAX_ITEMS = 80;

function normalizeTerm(raw: string) {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeKeywords(raw?: string[]) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const list = raw
    .map((item) => normalizeTerm(item))
    .filter((term) => term.length > 0)
    .filter((item, index, self) => self.indexOf(item) === index)
    .slice(0, MAX_ITEMS);
  return list;
}

function estimateValues(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  const lengthBonus = Math.min(20, value.length);
  const score = Math.min(100, Math.round(35 + words.length * 8 + lengthBonus));
  const estimatedVolume = Math.max(20, Math.round(280 + value.length * 12 + words.length * 36));
  const competition = Math.max(5, Math.round(88 - words.length * 6 + (value.length % 13)));
  const trendVelocity = Math.max(1, Math.round(12 + (value.length % 12) - words.length * 2));

  return {
    score: Math.max(1, Math.min(100, score)),
    estimatedVolume,
    competition: Math.max(1, Math.min(100, competition)),
    trendVelocity: Math.max(1, Math.min(100, trendVelocity))
  };
}

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as EvaluateBody;
    const keywords = normalizeKeywords(body.keywords);
    const language = body.language?.trim() || 'ja';
    const location = body.location?.trim() || 'jp';

    if (!keywords.length) {
      return fail(req, 400, 'BAD_REQUEST', 'keywords is required');
    }

    const site = await requireSingleSite();

    const now = new Date();
    const payload = keywords.map((term, index) => {
      const score = estimateValues(term);
      return {
        term,
        normalizedTerm: `${term}::${language}:${location}`,
        score: Math.max(1, score.score - index),
        estimatedVolume: score.estimatedVolume,
        competition: score.competition,
        trendVelocity: score.trendVelocity
      } as EvaluateItem;
    });

    const results = await Promise.all(
      payload.map(async (entry) => {
        const keyword = await prisma.keyword.upsert({
          where: {
            siteId_normalizedTerm: {
              siteId: site.id,
              normalizedTerm: entry.normalizedTerm
            }
          },
          create: {
            siteId: site.id,
            term: entry.term,
            normalizedTerm: entry.normalizedTerm,
            priority: Math.max(1, Math.min(99, 100 - entry.competition)),
            difficulty: entry.competition,
            volume: entry.estimatedVolume,
            cpc: entry.score / 10,
            status: 'active',
            latestSerpAt: now,
            lastSignalAt: now
          },
          update: {
            term: entry.term,
            priority: Math.max(1, Math.min(99, 100 - entry.competition)),
            difficulty: entry.competition,
            volume: entry.estimatedVolume,
            cpc: entry.score / 10,
            latestSerpAt: now,
            lastSignalAt: now
          }
        });
        return {
          id: keyword.id,
          term: keyword.term,
          normalizedTerm: keyword.normalizedTerm,
          score: entry.score,
          estimatedVolume: entry.estimatedVolume,
          competition: entry.competition,
          trendVelocity: entry.trendVelocity
        };
      })
    );

    return ok(req, {
      siteId: site.id,
      language,
      location,
      itemCount: results.length,
      items: results
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
