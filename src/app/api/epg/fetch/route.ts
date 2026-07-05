import { NextResponse } from 'next/server';
import { fetchBangumiHtml, ingestBangumiHtml } from '@/lib/epg/ingest';
import { BangumiSource, BANGUMI_SOURCES, buildBangumiArea } from '@/lib/epg/bangumi';

export const runtime = 'nodejs';

const DEFAULT_GGM_GROUP_ID = 42;

type FetchBody = {
  startDate: string;
  endDate: string;
  ggmGroupId?: number;
  sources?: BangumiSource[];
};

type FetchWorkItem = {
  source: BangumiSource;
  groupId: number;
  area: number;
  dateKey: string;
};

type FetchOutcome =
  | ({ ok: true } & Awaited<ReturnType<typeof ingestBangumiHtml>> & {
      area: number;
      url: string;
      source: BangumiSource;
    })
  | {
      ok: false;
      area: number;
      dateKey: string;
      source: BangumiSource;
      error: string;
    };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FetchBody;
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return NextResponse.json({ error: 'invalid date' }, { status: 400 });
    }
    if (end < start) {
      return NextResponse.json({ error: 'endDate must be >= startDate' }, { status: 400 });
    }

    const ggmGroupId = Number(body.ggmGroupId ?? DEFAULT_GGM_GROUP_ID);
    if (!Number.isFinite(ggmGroupId) || ggmGroupId <= 0) {
      return NextResponse.json({ error: 'ggmGroupId must be a positive number' }, { status: 400 });
    }
    const sources = normalizeSources(body.sources);
    const jobs: FetchWorkItem[] = [];

    for (const source of sources) {
      const groupId = source === 'td' || source === 'radio' ? ggmGroupId : 0;
      const area = buildBangumiArea(source, groupId);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateKey = formatDateKey(d);
        jobs.push({ source, groupId, area, dateKey });
      }
    }

    const outcomes = await runPool(jobs, 4, async (job): Promise<FetchOutcome> => {
      try {
        const dateKeyCompact = job.dateKey.replace(/-/g, '');
        const { html, url } = await fetchBangumiHtml({
          source: job.source,
          dateKeyCompact,
          ggmGroupId: job.groupId || undefined
        });
        const summary = await ingestBangumiHtml({
          html,
          area: job.area,
          url,
          dateKey: job.dateKey,
          source: job.source,
          groupId: job.groupId || undefined
        });
        return { ok: true, ...summary, area: job.area, url, source: job.source };
      } catch (error: any) {
        return {
          ok: false,
          area: job.area,
          dateKey: job.dateKey,
          source: job.source,
          error: String(error?.message || error)
        };
      }
    });

    const results = outcomes.filter((item): item is Extract<FetchOutcome, { ok: true }> => item.ok);
    const failures = outcomes.filter((item): item is Extract<FetchOutcome, { ok: false }> => !item.ok);
    if (!results.length && failures.length) {
      return NextResponse.json({ error: 'all bangumi fetches failed', failures }, { status: 502 });
    }

    return NextResponse.json({ ok: true, results, failures });
  } catch (error: any) {
    console.error('epg fetch failed', error);
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function normalizeSources(value: unknown): BangumiSource[] {
  if (!Array.isArray(value)) return [...BANGUMI_SOURCES];
  const valid = value.filter((v): v is BangumiSource => BANGUMI_SOURCES.includes(v as BangumiSource));
  return valid.length ? Array.from(new Set(valid)) : [...BANGUMI_SOURCES];
}

function formatDateKey(d: Date) {
  const yyyy = d.getFullYear();
  const mm = ('0' + (d.getMonth() + 1)).slice(-2);
  const dd = ('0' + d.getDate()).slice(-2);
  return `${yyyy}-${mm}-${dd}`;
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let index = 0;
  const run = async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, run));
  return results;
}
