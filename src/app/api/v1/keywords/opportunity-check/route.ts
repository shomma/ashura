import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { fetchKeywordMonthlyTrendIndices } from '@/lib/trends/googleTrends';
import { encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

type OpportunityCheckBody = {
  siteId?: string;
  keywords?: string[];
  months?: number;
  persist?: boolean;
  cacheOnly?: boolean;
};

type RawGoogleResult = {
  resultCount: number | null;
  resultStatsText: string | null;
  provider: 'google' | 'yahoo' | 'serpapi' | 'missing';
  error?: string;
};

type OpportunitySources = {
  volumeSource: 'trends' | 'cache' | 'missing';
  competitionSource: 'google' | 'yahoo' | 'serpapi' | 'cache' | 'estimated' | 'missing';
};

type OpportunityItem = {
  term: string;
  trendIndex: number | null;
  estimatedMonthlySearches: number | null;
  googleResultCount: number | null;
  volumeSource: OpportunitySources['volumeSource'];
  competitionSource: OpportunitySources['competitionSource'];
  competitionStatus: 'ok' | 'missing' | 'estimated';
  demandScore: number;
  competitionScore: number;
  scarcityScore: number;
  opportunityScore: number;
  competitionLevel: '低' | '中' | '高' | '不明';
  note: string;
  keywordId?: string | null;
  debug?: {
    resultStatsText: string | null;
    error?: string;
  };
};

const MAX_KEYWORDS = 40;
const GOOGLE_CONCURRENCY = 2;
const SERPAPI_CONCURRENCY = 6;
const REQUEST_DELAY_MS = 180;
const GOOGLE_FETCH_TIMEOUT_MS = 8000;
const SERPAPI_FETCH_TIMEOUT_MS = 8000;
const TRENDS_FETCH_TIMEOUT_MS = 25000;
const CACHE_TTL_HOURS = 12;
const SERPAPI_KEY = process.env.SERPAPI_KEY?.trim() || '';
const VOLUME_METHOD_NOTE = 'Google Trends 指数(0-100) × 120 を検索ボリューム目安として利用';
const COMPETITION_METHOD_NOTE =
  'SerpAPI(設定時)またはGoogle検索結果件数を優先し、取得不可時はYahoo検索の件数(hits)、さらに不可時は推定値で補完';
const OPPORTUNITY_METHOD_NOTE = '有望度 = 需要スコア(65%) + 競合スコア(35%)';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as OpportunityCheckBody;
    const keywords = normalizeKeywords(body.keywords);
    const months = Math.max(1, Math.min(12, Number(body.months || 1)));
    const persist = body.persist !== false;

    if (!keywords.length) {
      return fail(req, 400, 'BAD_REQUEST', 'keywords is required');
    }

    const site = await requireSingleSite();

    if (body.cacheOnly) {
      const cachedItems = await loadPersistedOpportunityItems(site.id, keywords);
      const responseItems = keywords
        .map((term) => cachedItems.get(normalizeTerm(term)))
        .filter((item): item is OpportunityItem => Boolean(item));

      return ok(req, {
        siteId: site.id,
        months,
        itemCount: responseItems.length,
        cacheOnly: true,
        note: 'saved demand/competition results only',
        methods: {
          volume: VOLUME_METHOD_NOTE,
          competition: COMPETITION_METHOD_NOTE,
          opportunity: OPPORTUNITY_METHOD_NOTE
        },
        items: responseItems
      });
    }

    const cachedItems = await loadCachedOpportunityItems(site.id, keywords);
    const pendingKeywords = keywords.filter((term) => {
      const cached = cachedItems.get(normalizeTerm(term));
      if (!cached) return true;
      return !hasMeasuredCompetition(cached);
    });

    let pendingItems: OpportunityItem[] = [];
    if (pendingKeywords.length > 0) {
      const trends = await withTimeout(
        fetchKeywordMonthlyTrendIndices({
          keywords: pendingKeywords,
          months,
          geo: 'JP',
          hl: 'ja',
          concurrency: 3
        }),
        TRENDS_FETCH_TIMEOUT_MS,
        []
      );
      const trendMap = new Map(trends.map((item) => [item.keyword, item]));
      const googleMap = await fetchGoogleResultCounts(pendingKeywords);
      pendingItems = pendingKeywords.map((term) => {
        const trend = trendMap.get(term);
        const google =
          googleMap.get(term) ??
          { resultCount: null, resultStatsText: null, provider: 'missing' as const };
        return buildOpportunityItem(term, trend?.monthlyTrendIndex ?? null, google, {
          volumeSource: trend?.monthlyTrendIndex == null ? 'missing' : 'trends',
          competitionSource: google.resultCount == null ? 'missing' : google.provider
        });
      });
    }

    const pendingMap = new Map(
      pendingItems.map((item) => [normalizeTerm(item.term), item])
    );
    const items = keywords.map((term) => {
      const normalized = normalizeTerm(term);
      return (
        pendingMap.get(normalized) ??
        cachedItems.get(normalized) ??
        buildOpportunityItem(term, null, {
          resultCount: null,
          resultStatsText: null,
          provider: 'missing',
          error: 'no data'
        }, {
          volumeSource: 'missing',
          competitionSource: 'missing'
        })
      );
    });

    let keywordIdMap: Map<string, string> | null = null;
    if (persist && pendingItems.length > 0) {
      keywordIdMap = await persistKeywordResearch(site.id, pendingItems);
    }
    const responseItems = items.map((item) => ({
      ...item,
      keywordId: item.keywordId ?? keywordIdMap?.get(buildNormalizedTerm(item.term)) ?? null
    }));

    return ok(req, {
      siteId: site.id,
      months,
      itemCount: responseItems.length,
      note: '検索ボリュームは広告APIの厳密値ではなく、比較用の推定値です。',
      methods: {
        volume: VOLUME_METHOD_NOTE,
        competition: COMPETITION_METHOD_NOTE,
        opportunity: OPPORTUNITY_METHOD_NOTE
      },
      items: responseItems
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

function normalizeKeywords(raw?: string[]) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((item) => normalizeTerm(item))
        .filter((item) => item.length > 0)
        .slice(0, MAX_KEYWORDS)
    )
  );
}

function normalizeTerm(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

function buildNormalizedTerm(term: string) {
  return `${normalizeTerm(term).toLowerCase()}::ja:jp`;
}

async function fetchGoogleResultCounts(keywords: string[]) {
  const results = new Map<string, RawGoogleResult>();
  let index = 0;
  const useSerpApi = Boolean(SERPAPI_KEY);
  const workerCount = useSerpApi
    ? Math.min(SERPAPI_CONCURRENCY, keywords.length)
    : Math.min(GOOGLE_CONCURRENCY, keywords.length);
  let providerRateLimited = false;

  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= keywords.length) break;
      const keyword = keywords[current];
      if (providerRateLimited) {
        results.set(keyword, {
          resultCount: null,
          resultStatsText: null,
          provider: 'missing',
          error: 'provider rate-limited'
        });
        continue;
      }
      const item = await fetchCompetitionResultCount(keyword);
      if (!useSerpApi && isProviderRateLimited(item.error)) {
        providerRateLimited = true;
      }
      results.set(keyword, item);
      if (!useSerpApi && current < keywords.length - 1) {
        await delay(REQUEST_DELAY_MS);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

async function fetchCompetitionResultCount(keyword: string): Promise<RawGoogleResult> {
  if (!SERPAPI_KEY) {
    return fetchGoogleResultCount(keyword);
  }

  const serpapiResult = await fetchSerpApiResultCount(keyword);
  if (serpapiResult.resultCount != null) {
    return serpapiResult;
  }

  const fallback = await fetchGoogleResultCount(keyword);
  return {
    ...fallback,
    error: joinErrors(serpapiResult.error, fallback.error)
  };
}

async function fetchSerpApiResultCount(keyword: string): Promise<RawGoogleResult> {
  const q = encodeURIComponent(keyword);
  const url = `https://serpapi.com/search.json?engine=google&hl=ja&gl=jp&google_domain=google.co.jp&num=10&q=${q}&api_key=${SERPAPI_KEY}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SERPAPI_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        resultCount: null,
        resultStatsText: null,
        provider: 'missing',
        error: `serpapi HTTP ${response.status}`
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          search_information?: {
            total_results?: number | string | null;
          };
          error?: string;
        }
      | null;

    if (payload?.error) {
      return {
        resultCount: null,
        resultStatsText: null,
        provider: 'missing',
        error: `serpapi error: ${payload.error}`
      };
    }

    const totalResults = parseApiResultCount(payload?.search_information?.total_results ?? null);
    if (totalResults != null) {
      return {
        resultCount: totalResults,
        resultStatsText: `SerpAPI total_results: ${totalResults}`,
        provider: 'serpapi'
      };
    }

    return {
      resultCount: null,
      resultStatsText: null,
      provider: 'missing',
      error: 'serpapi result count parse miss'
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return {
        resultCount: null,
        resultStatsText: null,
        provider: 'missing',
        error: 'serpapi request timeout'
      };
    }
    return {
      resultCount: null,
      resultStatsText: null,
      provider: 'missing',
      error: `serpapi ${String(error?.message || error)}`
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGoogleResultCount(keyword: string): Promise<RawGoogleResult> {
  const q = encodeURIComponent(keyword);
  const url = `https://www.google.com/search?hl=ja&gl=jp&num=10&q=${q}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6'
      }
    });
    if (!response.ok) {
      return await fetchYahooResultCount(keyword, `google HTTP ${response.status}`);
    }
    const html = await response.text();
    if (/detected unusual traffic|\/sorry\/index|Our systems have detected unusual traffic/i.test(html)) {
      return await fetchYahooResultCount(keyword, 'google blocked request');
    }

    const resultStatsText = extractSearchResultStatsText(html);
    const resultCount = parseSearchResultCount(resultStatsText);
    if (resultCount != null) {
      return { resultCount, resultStatsText, provider: 'google' };
    }
    return await fetchYahooResultCount(keyword, 'google result count parse miss');
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return await fetchYahooResultCount(keyword, 'google request timeout');
    }
    return await fetchYahooResultCount(keyword, String(error?.message || error));
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooResultCount(keyword: string, googleError?: string): Promise<RawGoogleResult> {
  const q = encodeURIComponent(keyword);
  const url = `https://search.yahoo.co.jp/search?p=${q}&ei=UTF-8&x=wrt`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_FETCH_TIMEOUT_MS);
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
    if (!response.ok) {
      return {
        resultCount: null,
        resultStatsText: null,
        provider: 'missing',
        error: googleError ? `${googleError}; yahoo HTTP ${response.status}` : `yahoo HTTP ${response.status}`
      };
    }
    const html = await response.text();
    const yahooHits = extractYahooHits(html);
    if (yahooHits != null) {
      return {
        resultCount: yahooHits,
        resultStatsText: `Yahoo hits: ${yahooHits}`,
        provider: 'yahoo',
        ...(googleError ? { error: googleError } : {})
      };
    }
    return {
      resultCount: null,
      resultStatsText: null,
      provider: 'missing',
      error: googleError ? `${googleError}; yahoo parse miss` : 'yahoo parse miss'
    };
  } catch (error: any) {
    const detail = error?.name === 'AbortError' ? 'yahoo request timeout' : String(error?.message || error);
    return {
      resultCount: null,
      resultStatsText: null,
      provider: 'missing',
      error: googleError ? `${googleError}; ${detail}` : detail
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractResultStatsText(html: string) {
  const resultStatsMatch = html.match(/id="result-stats"[^>]*>([\s\S]*?)<\/div>/i);
  if (resultStatsMatch?.[1]) {
    return decodeEntities(stripTags(resultStatsMatch[1])).replace(/\s+/g, ' ').trim();
  }

  const roleStatusMatch = html.match(/role="status"[^>]*>([\s\S]*?)<\/div>/i);
  if (roleStatusMatch?.[1]) {
    const text = decodeEntities(stripTags(roleStatusMatch[1])).replace(/\s+/g, ' ').trim();
    if (/(?:件|results?)/i.test(text)) {
      return text;
    }
  }

  const fallback = html.match(
    /((?:約|About)?\s*[0-9][0-9,.\s]*\s*(?:件|results?)(?:\s*\([^)]+\))?)/i
  );
  if (fallback?.[1]) {
    return decodeEntities(stripTags(fallback[1])).replace(/\s+/g, ' ').trim();
  }
  return null;
}

function parseResultCount(resultStatsText: string | null) {
  if (!resultStatsText) return null;

  const candidates = [
    /(?:約|About)?\s*([0-9][0-9,.\s]*)\s*(?:件|results?)/i,
    /([0-9][0-9,.\s]*)/
  ];

  for (const pattern of candidates) {
    const numberMatch = resultStatsText.match(pattern);
    if (!numberMatch?.[1]) continue;
    const normalized = numberMatch[1].replace(/[\s,\.]/g, '');
    const value = Number(normalized);
    if (Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }
  return null;
}

function parseApiResultCount(value: number | string | null | undefined) {
  if (value == null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  const normalized = String(value).replace(/[^\d]/g, '');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function joinErrors(...values: Array<string | undefined>) {
  const text = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (text.length === 0) return undefined;
  return text.join(' ; ');
}

function extractYahooHits(html: string) {
  const nextData = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i
  );
  if (nextData?.[1]) {
    try {
      const payload = JSON.parse(nextData[1]);
      const hits =
        payload?.props?.pageProps?.initialProps?.pageData?.pager?.hits ??
        findFirstNumericKey(payload, 'hits');
      if (Number.isFinite(hits) && hits >= 0) {
        return Math.round(hits);
      }
    } catch {
      // ignore
    }
  }

  const pagerHits = html.match(/"pager"\s*:\s*\{[\s\S]*?"hits"\s*:\s*([0-9]{3,})/i);
  if (pagerHits?.[1]) {
    const value = Number(pagerHits[1]);
    if (Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }

  const anyHits = html.match(/"hits"\s*:\s*([0-9]{2,})/i);
  if (anyHits?.[1]) {
    const value = Number(anyHits[1]);
    if (Number.isFinite(value) && value >= 0) {
      return Math.round(value);
    }
  }

  const resultStatsText = extractSearchResultStatsText(html);
  const resultCount = parseSearchResultCount(resultStatsText);
  if (resultCount != null) return resultCount;

  return null;
}

function extractSearchResultStatsText(html: string) {
  const resultStatsMatch = html.match(/id="result-stats"[^>]*>([\s\S]*?)<\/div>/i);
  if (resultStatsMatch?.[1]) {
    return decodeEntities(stripTags(resultStatsMatch[1])).replace(/\s+/g, ' ').trim();
  }

  const roleStatusMatch = html.match(/role="status"[^>]*>([\s\S]*?)<\/div>/i);
  if (roleStatusMatch?.[1]) {
    const text = decodeEntities(stripTags(roleStatusMatch[1])).replace(/\s+/g, ' ').trim();
    if (hasResultCountMarker(text)) return text;
  }

  const fallback = html.match(resultCountTextPattern());
  if (fallback?.[1]) {
    return decodeEntities(stripTags(fallback[1])).replace(/\s+/g, ' ').trim();
  }

  return null;
}

function parseSearchResultCount(resultStatsText: string | null) {
  if (!resultStatsText) return null;

  const candidates = [
    resultCountNumberPattern(),
    /([0-9０-９][0-9０-９,，.．\s]*)/
  ];

  for (const pattern of candidates) {
    const numberMatch = resultStatsText.match(pattern);
    if (!numberMatch?.[1]) continue;
    const value = parseLocalizedCount(numberMatch[1], numberMatch[2]);
    if (value != null) return value;
  }

  return null;
}

function hasMeasuredCompetition(item: OpportunityItem) {
  return (
    item.competitionStatus === 'ok' &&
    item.googleResultCount != null &&
    (item.competitionSource === 'google' ||
      item.competitionSource === 'yahoo' ||
      item.competitionSource === 'serpapi' ||
      item.competitionSource === 'cache')
  );
}

function hasResultCountMarker(text: string) {
  return /\u4ef6|results?/i.test(text);
}

function resultCountTextPattern() {
  return /((?:\u7d04|About)?\s*[0-9０-９][0-9０-９,，.．\s]*(?:\s*[\u4e07\u5104])?\s*(?:\u4ef6|results?)(?:\s*\([^)]+\))?)/i;
}

function resultCountNumberPattern() {
  return /(?:\u7d04|About)?\s*([0-9０-９][0-9０-９,，.．\s]*)(?:\s*([\u4e07\u5104]))?\s*(?:\u4ef6|results?)/i;
}

function parseLocalizedCount(rawNumber: string, rawUnit?: string) {
  const numberText = toAsciiDigits(rawNumber)
    .replace(/[，,]/g, '')
    .replace(/．/g, '.')
    .replace(/\s+/g, '');
  if (!numberText) return null;

  const parsed = Number(numberText);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  const unit = rawUnit || '';
  const multiplier = unit === '\u5104' ? 100_000_000 : unit === '\u4e07' ? 10_000 : 1;
  return Math.round(parsed * multiplier);
}

function toAsciiDigits(value: string) {
  return String(value || '').replace(/[０-９]/g, (char) =>
    String(char.charCodeAt(0) - 0xff10)
  );
}

function findFirstNumericKey(value: unknown, key: string): number | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstNumericKey(item, key);
      if (found != null) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const direct = record[key];
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0) {
    return direct;
  }
  if (typeof direct === 'string') {
    const parsed = parseApiResultCount(direct);
    if (parsed != null) return parsed;
  }

  for (const child of Object.values(record)) {
    const found = findFirstNumericKey(child, key);
    if (found != null) return found;
  }
  return null;
}

function estimateCompetitionCount(term: string, trendIndex: number | null, volume: number | null) {
  const compactLength = normalizeTerm(term).replace(/\s+/g, '').length;
  const syntheticTrend = trendIndex ?? clamp(28 - compactLength, 6, 24);
  const demandHint = volume ?? Math.max(300, syntheticTrend * 120);
  const shortTermBoost = compactLength <= 3 ? 1.8 : compactLength <= 6 ? 1.4 : 1.1;
  const volumeBase = Math.max(700, Math.round(demandHint * 2200));
  return Math.max(500, Math.round(volumeBase * shortTermBoost));
}

function isProviderRateLimited(error?: string) {
  if (!error) return false;
  const text = error.toLowerCase();
  return text.includes('google http 429') && text.includes('yahoo http 429');
}

function buildOpportunityItem(
  term: string,
  trendIndex: number | null,
  googleResult: RawGoogleResult,
  source?: OpportunitySources
): OpportunityItem {
  const volume = trendIndex == null ? null : Math.max(0, trendIndex * 120);
  let googleResultCount = googleResult.resultCount;
  const volumeSource = source?.volumeSource ?? (trendIndex == null ? 'missing' : 'trends');
  let competitionSource =
    source?.competitionSource ?? (googleResultCount == null ? 'missing' : 'google');

  if (googleResultCount == null) {
    googleResultCount = estimateCompetitionCount(term, trendIndex, volume);
    competitionSource = 'estimated';
  }

  const demandScore =
    volume == null ? 0 : clamp(Math.round(Math.log10(volume + 10) * 24), 1, 100);
  const competitionScore =
    googleResultCount == null ? 40 : clamp(Math.round(100 - Math.log10(googleResultCount + 10) * 17), 1, 100);
  const scarcityScore = competitionScore;
  const opportunityScore = clamp(Math.round(demandScore * 0.65 + competitionScore * 0.35), 1, 100);

  const competitionLevel = classifyCompetition(googleResultCount);
  const note =
    competitionSource === 'estimated'
      ? 'Google/Yahoo件数が未取得のため、推定値で有望度を計算しています。'
      : competitionLevel === '低'
      ? '競合が少なく、狙い目の可能性があります。'
      : competitionLevel === '中'
      ? '競合は中程度です。見出し差別化が必要です。'
      : '競合が多いため、切り口を絞ってください。';

  return {
    term,
    trendIndex,
    estimatedMonthlySearches: volume,
    googleResultCount,
    volumeSource,
    competitionSource,
    competitionStatus:
      competitionSource === 'estimated'
        ? 'estimated'
        : googleResultCount == null
        ? 'missing'
        : 'ok',
    demandScore,
    competitionScore,
    scarcityScore,
    opportunityScore,
    competitionLevel,
    note,
    debug: {
      resultStatsText: googleResult.resultStatsText,
      ...(googleResult.error ? { error: googleResult.error } : {})
    }
  };
}

function classifyCompetition(resultCount: number | null): '低' | '中' | '高' | '不明' {
  if (resultCount == null) return '不明';
  if (resultCount < 200_000) return '低';
  if (resultCount < 2_000_000) return '中';
  return '高';
}

async function persistKeywordResearch(siteId: string, items: OpportunityItem[]) {
  const now = new Date();
  const keywordPairs = await Promise.all(
    items.map(async (item) => {
      const normalizedTerm = buildNormalizedTerm(item.term);
      const keyword = await prisma.keyword.upsert({
        where: {
          siteId_normalizedTerm: {
            siteId,
            normalizedTerm
          }
        },
        create: {
          siteId,
          term: item.term,
          normalizedTerm,
          priority: item.opportunityScore,
          difficulty:
            item.googleResultCount == null ? null : Number((Math.log10(item.googleResultCount + 10) * 12).toFixed(2)),
          volume: item.estimatedMonthlySearches,
          cpc: null,
          status: 'active',
          latestSerpAt: now,
          lastSignalAt: now
        },
        update: {
          term: item.term,
          priority: item.opportunityScore,
          difficulty:
            item.googleResultCount == null ? null : Number((Math.log10(item.googleResultCount + 10) * 12).toFixed(2)),
          volume: item.estimatedMonthlySearches,
          latestSerpAt: now,
          lastSignalAt: now
        }
      });

      if (item.googleResultCount != null && item.competitionSource !== 'estimated') {
        const payload = item.debug ? encodeJsonField(item.debug) : undefined;
        await prisma.serp.create({
          data: {
            siteId,
            keywordId: keyword.id,
            provider: 'google_web',
            locale: 'ja-JP',
            device: 'desktop',
            rank: null,
            url: null,
            title: null,
            snippet: null,
            resultCount: item.googleResultCount,
            fetchedAt: now,
            ...(payload ? { payload } : {})
          }
        });
      }

      return {
        normalizedTerm,
        keywordId: keyword.id
      };
    })
  );
  return new Map(keywordPairs.map((entry) => [entry.normalizedTerm, entry.keywordId]));
}

function stripTags(text: string) {
  return String(text ?? '').replace(/<[^>]+>/g, '');
}

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function loadCachedOpportunityItems(siteId: string, keywords: string[]) {
  const now = Date.now();
  const cutoff = new Date(now - CACHE_TTL_HOURS * 60 * 60 * 1000);
  return loadPersistedOpportunityItems(siteId, keywords, cutoff);
}

async function loadPersistedOpportunityItems(siteId: string, keywords: string[], cutoff?: Date) {
  const normalizedTerms = keywords.map((term) => buildNormalizedTerm(term));

  const cachedKeywords = await prisma.keyword.findMany({
    where: {
      siteId,
      normalizedTerm: { in: normalizedTerms },
      lastSignalAt: cutoff ? { gte: cutoff } : { not: null }
    },
    select: {
      id: true,
      term: true,
      volume: true,
      latestSerpAt: true
    }
  });

  if (cachedKeywords.length === 0) {
    return new Map<string, OpportunityItem>();
  }

  const serpRows = await prisma.serp.findMany({
    where: {
      siteId,
      keywordId: { in: cachedKeywords.map((row) => row.id) },
      ...(cutoff ? { fetchedAt: { gte: cutoff } } : {})
    },
    orderBy: [{ keywordId: 'asc' }, { fetchedAt: 'desc' }],
    select: {
      keywordId: true,
      resultCount: true
    }
  });

  const serpByKeywordId = new Map<string, number | null>();
  for (const serp of serpRows) {
    if (serpByKeywordId.has(serp.keywordId)) continue;
    serpByKeywordId.set(serp.keywordId, serp.resultCount ?? null);
  }

  const map = new Map<string, OpportunityItem>();
  for (const keyword of cachedKeywords) {
    const trendIndex =
      keyword.volume == null ? null : clamp(Math.round(keyword.volume / 120), 0, 100);
    const googleResult = {
      resultCount: serpByKeywordId.get(keyword.id) ?? null,
      resultStatsText: null,
      provider: 'missing' as const
    };
    const item = buildOpportunityItem(keyword.term, trendIndex, googleResult, {
      volumeSource: keyword.volume == null ? 'missing' : 'cache',
      competitionSource: googleResult.resultCount == null ? 'missing' : 'cache'
    });
    item.keywordId = keyword.id;
    map.set(normalizeTerm(keyword.term), item);
  }
  return map;
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
