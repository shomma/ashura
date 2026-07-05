import { PrismaClient, Recommendation } from '@prisma/client';
import { findProgramHits } from '@/lib/epg/ingest';
import type { ProgramHit } from '@/lib/epg/types';
import {
  buildProgramHitResearchQueries
} from '@/lib/epg/research-queries';
import { encodeJsonField } from '@/lib/json-fields';
import { RecommendationType } from './constants';

type CandidateRecommendation = {
  dedupeKey: string;
  legacyDedupeKey?: string;
  type: RecommendationType;
  title: string;
  reason: string;
  evidence: unknown;
  priority: number;
  expectedImpact: string;
  dueAt?: Date;
};

type GenerateResult = {
  created: number;
  updated: number;
  skipped: number;
  generated: number;
  items: Recommendation[];
};

const RECOMMENDATION_BATCH_SIZE = 20;
const PROGRAM_HIT_LIMIT_PER_KEYWORD = 50;

type ResearchBackedHit = ProgramHit & {
  research: {
    term: string;
    pattern: string;
    volume: number | null;
    difficulty: number | null;
    opportunityScore: number;
    resultCount: number | null;
    fetchedAt: string | null;
  };
};

export async function generateRecommendationsForSite(params: {
  prisma: PrismaClient;
  siteId: string;
}): Promise<GenerateResult> {
  const range = await resolveFetchedProgramRange(params.prisma);

  if (!range) {
    return emptyResult();
  }

  const hits = await findProgramHits({
    start: range.start,
    end: range.end,
    limitPerKeyword: PROGRAM_HIT_LIMIT_PER_KEYWORD
  });
  const researchedHits = await loadResearchBackedHits({
    prisma: params.prisma,
    siteId: params.siteId,
    hits
  });

  const candidates = sortCandidates(dedupeCandidates(buildForesightRecommendations(researchedHits)));
  if (!candidates.length) {
    return {
      ...emptyResult(),
      skipped: hits.length
    };
  }

  const candidateKeys = Array.from(
    new Set(
      candidates.flatMap((candidate) =>
        [candidate.dedupeKey, candidate.legacyDedupeKey].filter((key): key is string => Boolean(key))
      )
    )
  );

  const existing = await params.prisma.recommendation.findMany({
    where: {
      siteId: params.siteId,
      dedupeKey: { in: candidateKeys }
    },
    select: { dedupeKey: true }
  });
  const existingKeys = new Set(existing.map((item) => item.dedupeKey));
  const nextCandidates = candidates
    .filter(
      (candidate) =>
        !existingKeys.has(candidate.dedupeKey) &&
        !(candidate.legacyDedupeKey && existingKeys.has(candidate.legacyDedupeKey))
    )
    .slice(0, RECOMMENDATION_BATCH_SIZE);

  if (!nextCandidates.length) {
    return {
      created: 0,
      updated: 0,
      skipped: Math.max(0, hits.length - researchedHits.length) + existing.length,
      generated: 0,
      items: []
    };
  }

  const items: Recommendation[] = [];
  for (const candidate of nextCandidates) {
    const createdItem = await params.prisma.recommendation.create({
      data: {
        siteId: params.siteId,
        dedupeKey: candidate.dedupeKey,
        type: candidate.type,
        title: candidate.title,
        reason: candidate.reason,
        evidence: encodeJsonField(candidate.evidence),
        priority: candidate.priority,
        expectedImpact: candidate.expectedImpact,
        dueAt: candidate.dueAt,
        status: 'pending'
      }
    });
    items.push(createdItem);
  }

  return {
    created: items.length,
    updated: 0,
    skipped: Math.max(0, hits.length - researchedHits.length) + existing.length,
    generated: items.length,
    items
  };
}

async function resolveFetchedProgramRange(prisma: PrismaClient) {
  const today = startOfDay(new Date());
  const fetchedDays = await prisma.epgHtml.findMany({
    where: { date: { gte: today } },
    orderBy: { date: 'asc' },
    select: { date: true }
  });

  if (!fetchedDays.length) return null;

  return {
    start: startOfDay(fetchedDays[0].date),
    end: addDays(startOfDay(fetchedDays[fetchedDays.length - 1].date), 1)
  };
}

async function loadResearchBackedHits(params: {
  prisma: PrismaClient;
  siteId: string;
  hits: ProgramHit[];
}): Promise<ResearchBackedHit[]> {
  const hitQueries = params.hits.map((hit) => ({
    hit,
    queries: buildProgramHitResearchQueries(hit)
  }));
  const normalizedTerms = Array.from(
    new Set(hitQueries.flatMap((entry) => entry.queries.map((query) => query.normalizedTerm)))
  );

  if (!normalizedTerms.length) return [];

  const keywords = await params.prisma.keyword.findMany({
    where: {
      siteId: params.siteId,
      normalizedTerm: { in: normalizedTerms },
      lastSignalAt: { not: null }
    },
    select: {
      id: true,
      term: true,
      normalizedTerm: true,
      priority: true,
      volume: true,
      difficulty: true,
      lastSignalAt: true
    }
  });

  if (!keywords.length) return [];

  const serps = await params.prisma.serp.findMany({
    where: {
      siteId: params.siteId,
      keywordId: { in: keywords.map((keyword) => keyword.id) }
    },
    orderBy: [{ keywordId: 'asc' }, { fetchedAt: 'desc' }],
    select: {
      keywordId: true,
      resultCount: true,
      fetchedAt: true
    }
  });

  const latestSerpByKeywordId = new Map<string, (typeof serps)[number]>();
  for (const serp of serps) {
    if (!latestSerpByKeywordId.has(serp.keywordId)) {
      latestSerpByKeywordId.set(serp.keywordId, serp);
    }
  }

  const keywordByNormalizedTerm = new Map(keywords.map((keyword) => [keyword.normalizedTerm, keyword]));
  const backedHits: ResearchBackedHit[] = [];

  for (const entry of hitQueries) {
    const matchedQuery = entry.queries.find((query) =>
      keywordByNormalizedTerm.has(query.normalizedTerm)
    );
    if (!matchedQuery) continue;

    const keyword = keywordByNormalizedTerm.get(matchedQuery.normalizedTerm)!;
    const serp = latestSerpByKeywordId.get(keyword.id);
    if (!serp || serp.resultCount == null) {
      continue;
    }

    backedHits.push({
      ...entry.hit,
      research: {
        term: keyword.term,
        pattern: matchedQuery.pattern,
        volume: keyword.volume,
        difficulty: keyword.difficulty,
        opportunityScore: keyword.priority,
        resultCount: serp.resultCount,
        fetchedAt: serp.fetchedAt.toISOString()
      }
    });
  }

  return backedHits;
}

function buildForesightRecommendations(hits: ResearchBackedHit[]) {
  return hits.map((hit) => {
    const start = new Date(hit.start);
    const dueAt = addDays(start, -1);
    const resultCount =
      hit.research.resultCount == null
        ? '未取得'
        : `${hit.research.resultCount.toLocaleString()}件`;
    const volume =
      hit.research.volume == null ? '未取得' : `${hit.research.volume.toLocaleString()}目安`;

    return {
      dedupeKey: buildDedupeKey('epg-research', buildStableProgramDedupeValue(hit)),
      legacyDedupeKey: buildDedupeKey('epg-research', `${hit.programId}:${hit.research.term}`),
      type: 'foresight' as const,
      title: `調査済み番組ネタ: ${hit.keyword} / ${hit.title}`,
      reason:
        `取得済み番組表で「${hit.keyword}」がヒットし、需要競合調査では「${hit.research.term}」を確認済みです。` +
        ` 検索需要は${volume}、競合件数は${resultCount}として記事下書き候補にします。`,
      evidence: {
        source: 'epg-research',
        keyword: hit.keyword,
        title: hit.title,
        dateKey: hit.dateKey,
        channelName: hit.channelName,
        start: hit.start,
        end: hit.end,
        programId: hit.programId,
        research: hit.research
      },
      priority: clampInt(Math.round(hit.research.opportunityScore || 1), 1, 95),
      expectedImpact: '番組放送前後の検索需要を狙う記事下書き',
      dueAt
    };
  });
}

function sortCandidates(items: CandidateRecommendation[]) {
  return [...items].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aDue = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDue = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    const titleOrder = a.title.localeCompare(b.title, 'ja');
    if (titleOrder !== 0) return titleOrder;
    return a.dedupeKey.localeCompare(b.dedupeKey);
  });
}

function dedupeCandidates(items: CandidateRecommendation[]) {
  const map = new Map<string, CandidateRecommendation>();
  for (const item of items) {
    if (!item.dedupeKey) continue;
    if (!map.has(item.dedupeKey)) {
      map.set(item.dedupeKey, item);
      continue;
    }
    const current = map.get(item.dedupeKey)!;
    if (compareCandidates(item, current) < 0) {
      map.set(item.dedupeKey, item);
    }
  }
  return Array.from(map.values());
}

function compareCandidates(a: CandidateRecommendation, b: CandidateRecommendation) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  const aDue = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  const bDue = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) return aDue - bDue;
  const titleOrder = a.title.localeCompare(b.title, 'ja');
  if (titleOrder !== 0) return titleOrder;
  return a.dedupeKey.localeCompare(b.dedupeKey);
}

function emptyResult(): GenerateResult {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    generated: 0,
    items: []
  };
}

function buildDedupeKey(prefix: string, value: string) {
  const normalized = normalizeToken(value).slice(0, 180);
  if (normalized) return `${prefix}:${normalized}`;
  return `${prefix}:h${stableHash(value)}`;
}

function buildStableProgramDedupeValue(hit: ResearchBackedHit) {
  return [
    hit.keyword,
    hit.research.term,
    hit.dateKey,
    hit.start,
    hit.end,
    hit.title,
    hit.channelName
  ].join('|');
}

function normalizeToken(value: string) {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return '';
  return encodeURIComponent(trimmed).replace(/%/g, '');
}

function stableHash(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
