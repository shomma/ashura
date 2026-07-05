import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { findProgramHits } from '@/lib/epg/ingest';
import type { ProgramHit } from '@/lib/epg/types';
import { fetchKeywordMonthlyTrendIndices } from '@/lib/trends/googleTrends';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

type CandidateRequest = {
  siteId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  limitPerKeyword?: number;
  enrichLimit?: number;
};

type TrendLite = {
  monthlyTrendIndex: number | null;
  latestTrendIndex: number | null;
};

type CompetitionSource = 'serpapi' | 'google' | 'yahoo' | 'mixed' | 'estimated' | 'missing';
type CompetitionStatus = 'measured' | 'estimated' | 'missing';
type CompetitionLevel = '弱い' | '普通' | '強い' | '危険' | '不明';

type SearchResultLite = {
  title: string;
  url: string;
  domain: string;
};

type CompetitionLite = {
  resultCount: number | null;
  allintitleResultCount: number | null;
  source: CompetitionSource;
  status: CompetitionStatus;
  level: CompetitionLevel;
  titleMatchCount: number;
  titleMatchRatio: number;
  strongDomainCount: number;
  strongDomains: string[];
  topResults: SearchResultLite[];
  reasons: string[];
  error?: string;
};

type SuggestLite = {
  items: string[];
  error?: string;
};

type CandidateFlag =
  | 'duplicate'
  | 'rerun'
  | 'old_movie'
  | 'weak_match'
  | 'high_competition';

type RankedCandidate = {
  id: string;
  hit: ProgramHit;
  query: string;
  score: number;
  rank: number;
  daysUntilBroadcast: number;
  demand: {
    trendIndex: number | null;
    latestTrendIndex: number | null;
    estimatedMonthlySearches: number | null;
    source: 'trends' | 'missing';
  };
  competition: {
    resultCount: number | null;
    allintitleResultCount: number | null;
    source: CompetitionSource;
    status: CompetitionStatus;
    level: CompetitionLevel;
    titleMatchCount: number;
    titleMatchRatio: number;
    strongDomainCount: number;
    strongDomains: string[];
    reasons: string[];
    error?: string;
    score: number;
  };
  suggestions: string[];
  flags: CandidateFlag[];
  reasons: string[];
  breakdown: {
    timing: number;
    match: number;
    demand: number;
    competition: number;
    suggestions: number;
    qualityPenalty: number;
  };
};

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 150;
const DEFAULT_ENRICH_LIMIT = 20;
const MAX_ENRICH_LIMIT = 40;
const TRENDS_TIMEOUT_MS = 18000;
const COMPETITION_TIMEOUT_MS = 18000;
const SUGGEST_TIMEOUT_MS = 6000;
const SEARCH_FETCH_TIMEOUT_MS = 8000;
const SERPAPI_KEY = process.env.SERPAPI_KEY?.trim() || '';

const RERUN_PATTERN = /再放送|再\s*放送|アンコール|傑作選|総集編|一挙放送|セレクション|プレイバック|再編集/i;
const OLD_MOVIE_PATTERN =
  /映画|シネマ|ロードショー|劇場版|名画|洋画|邦画|2時間|二時間|サスペンス|ミステリー|傑作劇場|午後のロードショー|映画･チャンネル/i;
const LOW_FRESHNESS_DRAMA_PATTERN =
  /時代劇|旧作|名作ドラマ|ドラマクラシック|HDリマスター|暴れん坊将軍|水戸黄門|大岡越前|遠山の金さん|鬼平犯科帳|必殺仕事人|銭形平次|長七郎江戸日記/i;
const NOISE_PATTERN = /通販|ショッピング|天気|ニュース|報道|ワイドショー|情報番組|番宣|ダイジェスト/i;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as CandidateRequest;
    const site = await requireSingleSite();

    const start = parseDateOrDefault(body.startDate, new Date());
    const end = parseDateOrDefault(
      body.endDate,
      new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000)
    );
    if (end < start) {
      return NextResponse.json({ error: 'endDate must be >= startDate' }, { status: 400 });
    }

    const limit = clampInt(body.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
    const limitPerKeyword = clampInt(body.limitPerKeyword, 4, 1, 20);
    const enrichLimit = clampInt(body.enrichLimit, DEFAULT_ENRICH_LIMIT, 0, MAX_ENRICH_LIMIT);
    const hits = await findProgramHits({ start, end, limitPerKeyword });
    const rough = dedupeHits(hits)
      .map((hit) => buildRoughCandidate(hit))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(limit, enrichLimit));

    const enrichTargets = rough.slice(0, Math.min(enrichLimit, rough.length));
    const enrichQueries = Array.from(new Set(enrichTargets.map((item) => item.query)));
    const keywordTrends = await loadTrendMap(enrichTargets.map((item) => item.hit.keyword));
    const competitionMap = await runPool(
      enrichQueries,
      1,
      async (query) => {
        await sleep(900);
        return withTimeout(fetchCompetition(query), COMPETITION_TIMEOUT_MS, {
          resultCount: null,
          allintitleResultCount: null,
          source: 'missing' as const,
          status: 'missing' as const,
          level: '不明' as const,
          titleMatchCount: 0,
          titleMatchRatio: 0,
          strongDomainCount: 0,
          strongDomains: [],
          topResults: [],
          reasons: ['競合調査がタイムアウトしました。'],
          error: 'competition timeout'
        });
      }
    );
    const suggestMap = await runPool(
      enrichTargets.map((item) => item.query),
      4,
      (query) =>
        withTimeout(fetchSuggests(query), SUGGEST_TIMEOUT_MS, {
          items: [],
          error: 'suggest timeout'
        })
    );

    const enriched = rough.map((item) => {
      const trend = keywordTrends.get(normalizeKey(item.hit.keyword)) ?? {
        monthlyTrendIndex: null,
        latestTrendIndex: null
      };
      const competition = competitionMap.get(item.query) ?? {
        resultCount: null,
        allintitleResultCount: null,
        source: 'missing' as const,
        status: 'missing' as const,
        level: '不明' as const,
        titleMatchCount: 0,
        titleMatchRatio: 0,
        strongDomainCount: 0,
        strongDomains: [],
        topResults: [],
        reasons: ['競合調査が未実行です。']
      };
      const suggestions = suggestMap.get(item.query)?.items ?? [];
      return finalizeCandidate(item.hit, {
        trend,
        competition,
        suggestions,
        duplicate: item.duplicate
      });
    });

    const items = enriched
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item, index) => ({ ...item, rank: index + 1 }));

    return NextResponse.json({
      ok: true,
      siteId: site.id,
      range: {
        startDate: start.toISOString(),
        endDate: end.toISOString()
      },
      summary: {
        hitCount: hits.length,
        candidateCount: items.length,
        enrichedCount: enrichTargets.length
      },
      items,
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function parseDateOrDefault(value: string | undefined, fallback: Date) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function dedupeHits(hits: ProgramHit[]) {
  const seen = new Set<string>();
  const out: Array<ProgramHit & { duplicate?: boolean }> = [];
  for (const hit of hits) {
    const key = [
      normalizeKey(hit.keyword),
      normalizeKey(stripProgramNoise(hit.title))
    ].join('|');
    const duplicate = seen.has(key);
    if (!duplicate) seen.add(key);
    out.push({ ...hit, duplicate });
  }
  return out;
}

function buildRoughCandidate(hit: ProgramHit & { duplicate?: boolean }) {
  const query = buildQuery(hit);
  const candidate = finalizeCandidate(hit, {
    trend: { monthlyTrendIndex: null, latestTrendIndex: null },
    competition: estimateCompetition(query, null),
    suggestions: [],
    duplicate: Boolean(hit.duplicate)
  });
  return {
    ...candidate,
    duplicate: Boolean(hit.duplicate)
  };
}

function finalizeCandidate(
  hit: ProgramHit,
  input: {
    trend: TrendLite;
    competition: CompetitionLite;
    suggestions: string[];
    duplicate: boolean;
  }
): RankedCandidate {
  const query = buildQuery(hit);
  const daysUntilBroadcast = Math.max(
    0,
    Math.ceil((new Date(hit.start).getTime() - Date.now()) / 86400000)
  );
  const timing = scoreTiming(daysUntilBroadcast);
  const match = scoreMatch(hit);
  const trendIndex = input.trend.monthlyTrendIndex;
  const estimatedMonthlySearches =
    trendIndex == null ? null : Math.max(10, Math.round(trendIndex * 120));
  const demand = trendIndex == null ? 16 : clamp(Math.round(12 + trendIndex * 0.8), 1, 100);
  const competition =
    input.competition.status === 'missing'
      ? estimateCompetition(query, trendIndex, input.competition.error)
      : input.competition;
  const competitionScore = scoreCompetition(competition);
  const suggestionScore = clamp(input.suggestions.length * 12, 0, 100);
  const qualityPenalty = calcQualityPenalty(hit, input.duplicate, competition);
  const score = clamp(
    Math.round(
      timing * 0.24 +
        match * 0.2 +
        demand * 0.23 +
        competitionScore * 0.23 +
        suggestionScore * 0.1 -
        qualityPenalty
    ),
    1,
    100
  );
  const flags = buildFlags(hit, input.duplicate, competition);

  return {
    id: buildCandidateId(hit),
    hit,
    query,
    score,
    rank: 0,
    daysUntilBroadcast,
    demand: {
      trendIndex,
      latestTrendIndex: input.trend.latestTrendIndex,
      estimatedMonthlySearches,
      source: trendIndex == null ? 'missing' : 'trends'
    },
    competition: {
      resultCount: competition.resultCount,
      allintitleResultCount: competition.allintitleResultCount,
      source: competition.source,
      status: competition.status,
      level: competition.level,
      titleMatchCount: competition.titleMatchCount,
      titleMatchRatio: competition.titleMatchRatio,
      strongDomainCount: competition.strongDomainCount,
      strongDomains: competition.strongDomains,
      reasons: competition.reasons,
      ...(competition.error ? { error: competition.error } : {}),
      score: competitionScore
    },
    suggestions: input.suggestions.slice(0, 8),
    flags,
    reasons: buildReasons({
      hit,
      daysUntilBroadcast,
      trendIndex,
      competition,
      suggestions: input.suggestions,
      flags,
      match
    }),
    breakdown: {
      timing,
      match,
      demand,
      competition: competitionScore,
      suggestions: suggestionScore,
      qualityPenalty
    }
  };
}

function scoreTiming(days: number) {
  if (days <= 1) return 95;
  if (days <= 3) return 86;
  if (days <= 5) return 74;
  if (days <= 7) return 62;
  return 42;
}

function scoreMatch(hit: ProgramHit) {
  const keyword = normalizeKey(hit.keyword);
  const title = normalizeKey(hit.title);
  const summary = normalizeKey(hit.summary || '');
  if (keyword && title.includes(keyword)) return 95;
  if (keyword && summary.includes(keyword)) return 78;
  if (hit.channelName && normalizeKey(hit.channelName).includes(keyword)) return 54;
  return 44;
}

function scoreCompetition(competition: CompetitionLite) {
  if (competition.status === 'missing') return 38;

  const resultScore =
    competition.resultCount == null
      ? 46
      : clamp(Math.round(100 - Math.log10(competition.resultCount + 10) * 15), 1, 100);
  const allintitleScore =
    competition.allintitleResultCount == null
      ? 52
      : clamp(Math.round(112 - Math.log10(competition.allintitleResultCount + 10) * 21), 1, 100);
  const topSerpScore = clamp(
    100 - competition.strongDomainCount * 11 - competition.titleMatchCount * 5,
    1,
    100
  );
  const measuredPenalty = competition.status === 'estimated' ? 12 : 0;
  return clamp(
    Math.round(resultScore * 0.3 + allintitleScore * 0.42 + topSerpScore * 0.28 - measuredPenalty),
    1,
    100
  );
}

function calcQualityPenalty(
  hit: ProgramHit,
  duplicate: boolean,
  competition: CompetitionLite
) {
  let penalty = 0;
  const text = `${hit.title} ${hit.summary || ''}`;
  if (duplicate) penalty += 34;
  if (RERUN_PATTERN.test(text)) penalty += 22;
  if (LOW_FRESHNESS_DRAMA_PATTERN.test(text)) {
    penalty += 30;
    if (/\b(cs|bs)\b/i.test(normalizeKey(hit.channelName))) penalty += 8;
  }
  if (OLD_MOVIE_PATTERN.test(text)) {
    penalty += normalizeKey(hit.channelName).includes('cs') ? 34 : 18;
    if (!normalizeKey(hit.title).includes(normalizeKey(hit.keyword))) penalty += 10;
  }
  if (NOISE_PATTERN.test(text) && !normalizeKey(hit.title).includes(normalizeKey(hit.keyword))) {
    penalty += 14;
  }
  if (competition.level === '危険') penalty += 24;
  else if (competition.level === '強い') penalty += 14;
  if (competition.status === 'estimated') penalty += 6;
  return penalty;
}

function buildFlags(
  hit: ProgramHit,
  duplicate: boolean,
  competition: CompetitionLite
): CandidateFlag[] {
  const flags: CandidateFlag[] = [];
  const text = `${hit.title} ${hit.summary || ''}`;
  if (duplicate) flags.push('duplicate');
  if (RERUN_PATTERN.test(text)) flags.push('rerun');
  if (LOW_FRESHNESS_DRAMA_PATTERN.test(text)) flags.push('rerun');
  if (OLD_MOVIE_PATTERN.test(text)) {
    flags.push('old_movie');
  }
  if (scoreMatch(hit) < 60) flags.push('weak_match');
  if (competition.level === '強い' || competition.level === '危険') {
    flags.push('high_competition');
  }
  return flags;
}

function buildReasons(input: {
  hit: ProgramHit;
  daysUntilBroadcast: number;
  trendIndex: number | null;
  competition: CompetitionLite;
  suggestions: string[];
  flags: CandidateFlag[];
  match: number;
}) {
  const reasons: string[] = [];
  reasons.push(`放送まで${input.daysUntilBroadcast}日で、先回り記事の準備対象です。`);
  if (input.match >= 90) reasons.push('出演者キーワードが番組タイトル内で一致しています。');
  else if (input.match >= 70) reasons.push('出演者キーワードが番組概要内で一致しています。');
  else reasons.push('一致が弱いため、記事化前に関連性を確認してください。');
  if (input.trendIndex != null) {
    reasons.push(`Google Trends指数は${input.trendIndex}です。`);
  } else {
    reasons.push('検索需要は未取得のため、番組表情報中心で暫定評価しています。');
  }
  if (input.competition.resultCount != null) {
    reasons.push(`競合件数の目安は${input.competition.resultCount.toLocaleString()}件です。`);
  }
  if (input.competition.allintitleResultCount != null) {
    reasons.push(`allintitle件数は${input.competition.allintitleResultCount.toLocaleString()}件です。`);
  }
  reasons.push(
    `競合レベルは${input.competition.level}です（${input.competition.status === 'measured' ? '実測' : input.competition.status === 'estimated' ? '推定' : '不明'} / ${sourceLabel(input.competition.source)}）。`
  );
  if (input.competition.strongDomainCount > 0) {
    reasons.push(`上位10件に強いドメインが${input.competition.strongDomainCount}件あります。`);
  }
  if (input.competition.error) {
    reasons.push(`取得失敗理由: ${input.competition.error}`);
  }
  if (input.competition.reasons.length) {
    reasons.push(...input.competition.reasons.slice(0, 2));
  }
  if (input.suggestions.length) {
    reasons.push(`サジェスト候補が${input.suggestions.length}件あります。`);
  }
  if (input.flags.includes('rerun')) reasons.push('再放送・総集編系の語があるため優先度を下げています。');
  if (input.flags.includes('old_movie')) reasons.push('映画/名画系のため、鮮度のある切り口が必要です。');
  if (input.flags.includes('duplicate')) reasons.push('同一候補の重複として優先度を下げています。');
  return reasons.slice(0, 7);
}

function buildQuery(hit: ProgramHit) {
  const keyword = stripProgramNoise(hit.keyword);
  const title = stripProgramNoise(hit.title)
    .replace(/第\s*\d+\s*(話|回)/g, ' ')
    .replace(/[#＃]\s*\d+/g, ' ');
  return normalizeTerm([keyword, title].filter(Boolean).join(' ')).slice(0, 80);
}

function stripProgramNoise(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/【[^】]*】/g, ' ')
    .replace(/［[^］]*］/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[「」『』〈〉《》]/g, ' ')
    .replace(/[!！?？★☆◇◆▽▼◎●○◯□■※＊*・~〜…]/g, ' ');
}

function normalizeTerm(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeKey(value: string) {
  return normalizeTerm(String(value || '').normalize('NFKC').toLowerCase()).replace(/\s+/g, '');
}

function buildCandidateId(hit: ProgramHit) {
  return [hit.programId, normalizeKey(hit.keyword), hit.start].join(':');
}

async function loadTrendMap(keywords: string[]) {
  const unique = Array.from(new Set(keywords.map(normalizeTerm).filter(Boolean))).slice(0, 80);
  const trends = await withTimeout(
    fetchKeywordMonthlyTrendIndices({ keywords: unique, months: 1, geo: 'JP', hl: 'ja', concurrency: 4 }),
    TRENDS_TIMEOUT_MS,
    []
  );
  return new Map(
    trends.map((item) => [
      normalizeKey(item.keyword),
      {
        monthlyTrendIndex: item.monthlyTrendIndex,
        latestTrendIndex: item.latestTrendIndex
      }
    ])
  );
}

async function fetchCompetition(query: string): Promise<CompetitionLite> {
  const normal = await fetchSearchSnapshot(query);
  const allintitle = await fetchSearchSnapshot(`allintitle:${query}`, { allintitle: true });
  const error = joinErrors(normal.error, allintitle.error);
  const topResults = normal.results.slice(0, 10);
  const topAnalysis = analyzeTopResults(query, topResults);
  const source = mergeCompetitionSource(normal.source, allintitle.source);

  if (normal.resultCount == null && allintitle.resultCount == null) {
    return estimateCompetition(query, null, error || 'search result count missing');
  }

  const level = classifyCompetition({
    resultCount: normal.resultCount,
    allintitleResultCount: allintitle.resultCount,
    strongDomainCount: topAnalysis.strongDomainCount,
    titleMatchCount: topAnalysis.titleMatchCount,
    status: 'measured'
  });

  return {
    resultCount: normal.resultCount,
    allintitleResultCount: allintitle.resultCount,
    source,
    status: 'measured',
    level,
    titleMatchCount: topAnalysis.titleMatchCount,
    titleMatchRatio: topAnalysis.titleMatchRatio,
    strongDomainCount: topAnalysis.strongDomainCount,
    strongDomains: topAnalysis.strongDomains,
    topResults,
    reasons: buildCompetitionReasons({
      resultCount: normal.resultCount,
      allintitleResultCount: allintitle.resultCount,
      source,
      status: 'measured',
      level,
      strongDomainCount: topAnalysis.strongDomainCount,
      titleMatchCount: topAnalysis.titleMatchCount,
      error
    }),
    ...(error ? { error } : {})
  };
}

function estimateCompetition(query: string, trendIndex: number | null, error?: string): CompetitionLite {
  const words = normalizeTerm(query).split(/\s+/).filter(Boolean).length;
  const base = 160_000 + Math.max(0, words - 1) * 260_000;
  const trendBoost = trendIndex == null ? 220_000 : trendIndex * 35_000;
  const resultCount = Math.round(base + trendBoost);
  const allintitleResultCount = Math.max(20, Math.round(resultCount * 0.006));
  const level = classifyCompetition({
    resultCount,
    allintitleResultCount,
    strongDomainCount: 0,
    titleMatchCount: 0,
    status: 'estimated'
  });
  return {
    resultCount,
    allintitleResultCount,
    source: 'estimated',
    status: 'estimated',
    level,
    titleMatchCount: 0,
    titleMatchRatio: 0,
    strongDomainCount: 0,
    strongDomains: [],
    topResults: [],
    reasons: buildCompetitionReasons({
      resultCount,
      allintitleResultCount,
      source: 'estimated',
      status: 'estimated',
      level,
      strongDomainCount: 0,
      titleMatchCount: 0,
      error
    }),
    ...(error ? { error } : {})
  };
}

function parseGoogleResultCount(html: string) {
  const text = html.replace(/<[^>]+>/g, ' ');
  const patterns = [
    /約\s*([\d,]+)\s*件/,
    /([\d,]+)\s*件/,
    /About\s*([\d,]+)\s*results/i,
    /([\d,]+)\s*results/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number(match[1].replace(/[^\d]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

type SearchSnapshot = {
  resultCount: number | null;
  source: CompetitionSource;
  results: SearchResultLite[];
  resultStatsText?: string | null;
  error?: string;
};

async function fetchSearchSnapshot(
  query: string,
  options: { allintitle?: boolean } = {}
): Promise<SearchSnapshot> {
  if (SERPAPI_KEY) {
    const serpapi = await fetchSerpApiSnapshot(query);
    if (serpapi.resultCount != null || serpapi.results.length) return serpapi;
    const fallback = await fetchGoogleSnapshot(query);
    if (fallback.resultCount != null || fallback.results.length) {
      return {
        ...fallback,
        error: joinErrors(serpapi.error, fallback.error)
      };
    }
    const yahoo = await fetchYahooSnapshot(query);
    return {
      ...yahoo,
      error: joinErrors(serpapi.error, fallback.error, yahoo.error)
    };
  }

  const google = await fetchGoogleSnapshot(query);
  if (google.resultCount != null || google.results.length) return google;
  const yahoo = await fetchYahooSnapshot(query);
  return {
    ...yahoo,
    error: joinErrors(google.error, options.allintitle ? 'allintitle google result count missing' : undefined, yahoo.error)
  };
}

async function fetchSerpApiSnapshot(query: string): Promise<SearchSnapshot> {
  const url = `https://serpapi.com/search.json?engine=google&hl=ja&gl=jp&google_domain=google.co.jp&num=10&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(SERPAPI_KEY)}`;
  try {
    const payload = await fetchJsonWithTimeout<any>(url, SEARCH_FETCH_TIMEOUT_MS);
    if (payload?.error) {
      return { resultCount: null, source: 'missing', results: [], error: `serpapi error: ${payload.error}` };
    }
    const resultCount = parseApiResultCount(payload?.search_information?.total_results ?? null);
    const results = Array.isArray(payload?.organic_results)
      ? payload.organic_results
          .map((item: any) => toSearchResult(item?.title, item?.link || item?.displayed_link))
          .filter((item: SearchResultLite | null): item is SearchResultLite => Boolean(item))
          .slice(0, 10)
      : [];
    return {
      resultCount,
      source: resultCount == null && !results.length ? 'missing' : 'serpapi',
      results,
      resultStatsText: resultCount == null ? null : `SerpAPI total_results: ${resultCount}`
    };
  } catch (error: any) {
    return {
      resultCount: null,
      source: 'missing',
      results: [],
      error: `serpapi ${String(error?.message || error)}`
    };
  }
}

async function fetchGoogleSnapshot(query: string): Promise<SearchSnapshot> {
  const url = `https://www.google.com/search?hl=ja&gl=jp&num=10&q=${encodeURIComponent(query)}`;
  try {
    const html = await fetchTextWithTimeout(url, SEARCH_FETCH_TIMEOUT_MS);
    if (/detected unusual traffic|\/sorry\/index|Our systems have detected unusual traffic/i.test(html)) {
      return { resultCount: null, source: 'missing', results: [], error: 'google blocked request' };
    }
    const resultStatsText = extractGoogleResultStatsText(html);
    const resultCount = parseResultCount(resultStatsText);
    const results = extractGoogleResults(html);
    return {
      resultCount,
      source: resultCount == null && !results.length ? 'missing' : 'google',
      results,
      resultStatsText,
      ...(resultCount == null ? { error: 'google result count parse miss' } : {})
    };
  } catch (error: any) {
    return {
      resultCount: null,
      source: 'missing',
      results: [],
      error: `google ${String(error?.message || error)}`
    };
  }
}

async function fetchYahooSnapshot(query: string): Promise<SearchSnapshot> {
  const url = `https://search.yahoo.co.jp/search?p=${encodeURIComponent(query)}`;
  try {
    const html = await fetchTextWithTimeout(url, SEARCH_FETCH_TIMEOUT_MS);
    const resultCount = extractYahooHits(html);
    const results = extractYahooResults(html);
    return {
      resultCount,
      source: resultCount == null && !results.length ? 'missing' : 'yahoo',
      results,
      resultStatsText: resultCount == null ? null : `Yahoo hits: ${resultCount}`,
      ...(resultCount == null ? { error: 'yahoo result count parse miss' } : {})
    };
  } catch (error: any) {
    return {
      resultCount: null,
      source: 'missing',
      results: [],
      error: `yahoo ${String(error?.message || error)}`
    };
  }
}

function extractGoogleResultStatsText(html: string) {
  const resultStatsMatch = html.match(/id="result-stats"[^>]*>([\s\S]*?)<\/div>/i);
  if (resultStatsMatch?.[1]) {
    return decodeEntities(stripTags(resultStatsMatch[1])).replace(/\s+/g, ' ').trim();
  }
  const text = decodeEntities(stripTags(html)).replace(/\s+/g, ' ').trim();
  const fallback = text.match(/(?:約\s*)?[\d,]+(?:\s*件| results?)/i);
  return fallback?.[0] || null;
}

function parseResultCount(resultStatsText: string | null) {
  if (!resultStatsText) return null;
  const patterns = [
    /約\s*([\d,]+)\s*件/,
    /([\d,]+)\s*件/,
    /About\s*([\d,]+)\s*results/i,
    /([\d,]+)\s*results/i
  ];
  for (const pattern of patterns) {
    const match = resultStatsText.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number(match[1].replace(/[^\d]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseApiResultCount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractGoogleResults(html: string): SearchResultLite[] {
  const results: SearchResultLite[] = [];
  const h3Blocks = html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi);
  for (const match of h3Blocks) {
    const href = decodeEntities(match[1]);
    const title = decodeEntities(stripTags(match[2])).replace(/\s+/g, ' ').trim();
    const url = normalizeGoogleUrl(href);
    const result = toSearchResult(title, url);
    if (result) results.push(result);
    if (results.length >= 10) break;
  }
  return dedupeSearchResults(results).slice(0, 10);
}

function extractYahooResults(html: string): SearchResultLite[] {
  const results: SearchResultLite[] = [];
  const anchorBlocks = html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
  for (const match of anchorBlocks) {
    const href = decodeEntities(match[1]);
    const title = decodeEntities(stripTags(match[2])).replace(/\s+/g, ' ').trim();
    if (!title || title.length < 4) continue;
    const result = toSearchResult(title, normalizeYahooUrl(href));
    if (result) results.push(result);
    if (results.length >= 16) break;
  }
  return dedupeSearchResults(results).slice(0, 10);
}

function extractYahooHits(html: string) {
  const text = decodeEntities(stripTags(html)).replace(/\s+/g, ' ');
  const patterns = [
    /約\s*([\d,]+)\s*件/,
    /([\d,]+)\s*件/,
    /([\d,]+)\s*results/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const parsed = Number(match[1].replace(/[^\d]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function analyzeTopResults(query: string, results: SearchResultLite[]) {
  const tokens = extractQueryTokens(query);
  let titleMatchCount = 0;
  const strongDomains: string[] = [];

  for (const result of results.slice(0, 10)) {
    const titleKey = normalizeKey(result.title);
    const matchedTokens = tokens.filter((token) => titleKey.includes(token));
    if (matchedTokens.length >= Math.min(2, tokens.length) || (tokens[0] && titleKey.includes(tokens[0]))) {
      titleMatchCount += 1;
    }
    if (isStrongDomain(result.domain, result.title)) {
      strongDomains.push(result.domain);
    }
  }

  return {
    titleMatchCount,
    titleMatchRatio: results.length ? Number((titleMatchCount / results.length).toFixed(2)) : 0,
    strongDomainCount: strongDomains.length,
    strongDomains: Array.from(new Set(strongDomains)).slice(0, 10)
  };
}

function extractQueryTokens(query: string) {
  const stopWords = new Set([
    'the',
    'and',
    'or',
    'in',
    'on',
    '第',
    '話',
    '出演',
    '番組',
    'テレビ',
    '再放送',
    'ドラマ',
    '映画'
  ]);
  return normalizeTerm(query)
    .split(/\s+/)
    .map((token) => normalizeKey(token))
    .filter((token) => token.length >= 2 && !stopWords.has(token))
    .slice(0, 8);
}

function classifyCompetition(input: {
  resultCount: number | null;
  allintitleResultCount: number | null;
  strongDomainCount: number;
  titleMatchCount: number;
  status: CompetitionStatus;
}): CompetitionLevel {
  if (input.status === 'missing') return '不明';
  let risk = input.status === 'estimated' ? 2 : 0;

  if (input.resultCount != null) {
    if (input.resultCount >= 8_000_000) risk += 4;
    else if (input.resultCount >= 2_000_000) risk += 3;
    else if (input.resultCount >= 500_000) risk += 2;
    else if (input.resultCount >= 150_000) risk += 1;
    else risk -= 1;
  }

  if (input.allintitleResultCount != null) {
    if (input.allintitleResultCount >= 5_000) risk += 4;
    else if (input.allintitleResultCount >= 1_000) risk += 3;
    else if (input.allintitleResultCount >= 300) risk += 2;
    else if (input.allintitleResultCount >= 80) risk += 1;
    else risk -= 2;
  }

  if (input.strongDomainCount >= 6) risk += 4;
  else if (input.strongDomainCount >= 4) risk += 3;
  else if (input.strongDomainCount >= 2) risk += 1;

  if (input.titleMatchCount >= 7) risk += 2;
  else if (input.titleMatchCount >= 4) risk += 1;

  if (risk <= 1) return '弱い';
  if (risk <= 4) return '普通';
  if (risk <= 7) return '強い';
  return '危険';
}

function buildCompetitionReasons(input: {
  resultCount: number | null;
  allintitleResultCount: number | null;
  source: CompetitionSource;
  status: CompetitionStatus;
  level: CompetitionLevel;
  strongDomainCount: number;
  titleMatchCount: number;
  error?: string;
}) {
  const reasons: string[] = [];
  if (input.status === 'estimated') {
    reasons.push('検索件数を実測できなかったため推定値です。');
  } else if (input.status === 'measured') {
    reasons.push(`${sourceLabel(input.source)}で検索件数を取得しました。`);
  }
  if (input.allintitleResultCount != null) {
    reasons.push(`allintitleは${input.allintitleResultCount.toLocaleString()}件です。`);
  }
  if (input.strongDomainCount > 0) {
    reasons.push(`上位10件に公式/大手/辞書/EC/動画/ニュース系が${input.strongDomainCount}件あります。`);
  }
  if (input.titleMatchCount > 0) {
    reasons.push(`上位10件のうちタイトル一致が${input.titleMatchCount}件あります。`);
  }
  if (input.error) {
    reasons.push(`${input.status === 'measured' ? '一部取得失敗理由' : '取得失敗理由'}: ${input.error}`);
  }
  reasons.push(`総合判定は${input.level}です。`);
  return reasons.slice(0, 6);
}

function sourceLabel(source: CompetitionSource) {
  if (source === 'serpapi') return 'SerpAPI';
  if (source === 'google') return 'Google';
  if (source === 'yahoo') return 'Yahoo';
  if (source === 'mixed') return '複数ソース';
  if (source === 'estimated') return '推定';
  return '未取得';
}

function mergeCompetitionSource(a: CompetitionSource, b: CompetitionSource): CompetitionSource {
  const sources = [a, b].filter((source) => source !== 'missing');
  if (!sources.length) return 'missing';
  if (sources.every((source) => source === sources[0])) return sources[0];
  if (sources.includes('estimated') && sources.length === 1) return 'estimated';
  return 'mixed';
}

function isStrongDomain(domain: string, title: string) {
  const target = `${domain} ${title}`.toLowerCase();
  return /公式|official|wikipedia\.org|kotobank\.jp|weblio\.jp|youtube\.com|youtu\.be|amazon\.co\.jp|rakuten\.co\.jp|news\.yahoo\.co\.jp|news|nhk\.or\.jp|ntv\.co\.jp|tbs\.co\.jp|fujitv\.co\.jp|tv-asahi\.co\.jp|tv-tokyo\.co\.jp|oricon\.co\.jp|natalie\.mu|mdpr\.jp|eiga\.com|cinematoday\.jp|thetv\.jp|mantan-web\.jp|crank-in\.net|prtimes\.jp|pixiv\.net|imdb\.com/i.test(target);
}

function normalizeGoogleUrl(href: string) {
  try {
    if (href.startsWith('/url?')) {
      const parsed = new URL(`https://www.google.com${href}`);
      return parsed.searchParams.get('q') || href;
    }
  } catch {
    return href;
  }
  return href;
}

function normalizeYahooUrl(href: string) {
  try {
    const parsed = new URL(href.startsWith('http') ? href : `https://${href.replace(/^\/\//, '')}`);
    const directUrl =
      parsed.searchParams.get('u') ||
      parsed.searchParams.get('url') ||
      parsed.searchParams.get('to') ||
      parsed.searchParams.get('RU');
    if (directUrl) return decodeURIComponent(directUrl);
  } catch {
    return href;
  }
  return href;
}

function toSearchResult(title: unknown, rawUrl: unknown): SearchResultLite | null {
  const cleanTitle = String(title || '').trim();
  const cleanUrl = String(rawUrl || '').trim();
  if (!cleanTitle || !cleanUrl || cleanUrl.startsWith('#') || cleanUrl.startsWith('/search')) return null;
  try {
    const parsed = new URL(cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl.replace(/^\/\//, '')}`);
    if (/^(?:r\.)?search\.yahoo\.co\.jp$/i.test(parsed.hostname)) return null;
    return {
      title: cleanTitle,
      url: parsed.toString(),
      domain: parsed.hostname.replace(/^www\./, '')
    };
  } catch {
    return null;
  }
}

function dedupeSearchResults(results: SearchResultLite[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.domain}:${normalizeKey(result.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchTextWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number) {
  const text = await fetchTextWithTimeout(url, timeoutMs);
  return JSON.parse(text) as T;
}

function stripTags(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function joinErrors(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' / ') || undefined;
}

async function fetchSuggests(query: string): Promise<SuggestLite> {
  try {
    const response = await fetch(
      `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&q=${encodeURIComponent(query)}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return { items: [], error: `suggest HTTP ${response.status}` };
    const payload = (await response.json().catch(() => null)) as unknown;
    const items =
      Array.isArray(payload) && Array.isArray(payload[1])
        ? payload[1].filter((item): item is string => typeof item === 'string')
        : [];
    return { items: Array.from(new Set(items)).slice(0, 10) };
  } catch (error: any) {
    return { items: [], error: String(error?.message || error) };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timeoutHandle = setTimeout(() => resolve(fallback), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const map = new Map<T, R>();
  let index = 0;
  const run = async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      map.set(current, await worker(current));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, run));
  return map;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}
