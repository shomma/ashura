import * as googleTrends from 'google-trends-api';

type TimelinePoint = {
  date: string;
  value: number;
  isPartial: boolean;
};

type ParsedTimelinePoint = {
  time?: string;
  formattedTime?: string;
  value?: number[];
  isPartial?: boolean;
};

type ParsedInterestOverTimeResponse = {
  default?: {
    timelineData?: ParsedTimelinePoint[];
  };
};

export type KeywordTrendIndex = {
  keyword: string;
  monthlyTrendIndex: number | null;
  latestTrendIndex: number | null;
  points: TimelinePoint[];
  error?: string;
};

type FetchMonthlyTrendIndexParams = {
  keywords: string[];
  months?: number;
  geo?: string;
  hl?: string;
  concurrency?: number;
};

export async function fetchKeywordMonthlyTrendIndices(
  params: FetchMonthlyTrendIndexParams
): Promise<KeywordTrendIndex[]> {
  const keywords = Array.from(
    new Set(params.keywords.map((keyword) => keyword.trim()).filter(Boolean))
  );
  if (keywords.length === 0) return [];

  const months = Math.max(1, Math.min(12, params.months ?? 1));
  const endTime = new Date();
  const startTime = new Date(
    Date.UTC(endTime.getUTCFullYear(), endTime.getUTCMonth() - (months - 1), 1, 0, 0, 0)
  );
  const workerCount = Math.max(1, Math.min(5, params.concurrency ?? 3, keywords.length));
  const geo = (params.geo || process.env.GOOGLE_TRENDS_GEO || 'JP').trim();
  const hl = (params.hl || process.env.GOOGLE_TRENDS_LANG || 'ja').trim();

  const results: KeywordTrendIndex[] = new Array(keywords.length);
  let index = 0;

  const runWorker = async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= keywords.length) break;
      const keyword = keywords[currentIndex];
      results[currentIndex] = await fetchSingleKeywordTrendIndex({
        keyword,
        startTime,
        endTime,
        geo,
        hl
      });
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function fetchSingleKeywordTrendIndex(params: {
  keyword: string;
  startTime: Date;
  endTime: Date;
  geo: string;
  hl: string;
}): Promise<KeywordTrendIndex> {
  try {
    const raw = await googleTrends.interestOverTime({
      keyword: params.keyword,
      startTime: params.startTime,
      endTime: params.endTime,
      geo: params.geo,
      hl: params.hl
    });
    const parsed = JSON.parse(raw) as ParsedInterestOverTimeResponse;
    const timeline = Array.isArray(parsed.default?.timelineData)
      ? parsed.default?.timelineData
      : [];
    const points = timeline
      .map((point) => normalizeTimelinePoint(point))
      .filter((point): point is TimelinePoint => point !== null);

    if (points.length === 0) {
      return {
        keyword: params.keyword,
        monthlyTrendIndex: null,
        latestTrendIndex: null,
        points: []
      };
    }

    const total = points.reduce((sum, point) => sum + point.value, 0);
    const monthlyTrendIndex = Math.round(total / points.length);
    const latestTrendIndex = points[points.length - 1]?.value ?? null;

    return {
      keyword: params.keyword,
      monthlyTrendIndex,
      latestTrendIndex,
      points
    };
  } catch (error: any) {
    return {
      keyword: params.keyword,
      monthlyTrendIndex: null,
      latestTrendIndex: null,
      points: [],
      error: error?.message ? String(error.message) : 'trend fetch failed'
    };
  }
}

function normalizeTimelinePoint(point: ParsedTimelinePoint): TimelinePoint | null {
  const value = Number(Array.isArray(point.value) ? point.value[0] : NaN);
  if (Number.isNaN(value)) return null;
  const date = formatTimelineDate(point);
  if (!date) return null;
  return {
    date,
    value,
    isPartial: Boolean(point.isPartial)
  };
}

function formatTimelineDate(point: ParsedTimelinePoint) {
  if (point.formattedTime && point.formattedTime.trim()) {
    return point.formattedTime.trim();
  }
  if (!point.time) return '';
  const timeNumber = Number(point.time);
  if (Number.isNaN(timeNumber)) return '';
  const d = new Date(timeNumber * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = `${d.getUTCMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getUTCDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
