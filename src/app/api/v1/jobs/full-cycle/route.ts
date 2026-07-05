import { Recommendation } from '@prisma/client';
import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { generateRecommendationsForSite } from '@/lib/recommendations/engine';
import { upsertTaskFromRecommendation } from '@/lib/recommendations/taskify';
import { ensureSingleSite } from '@/lib/single-site';
import { BANGUMI_SOURCES, BangumiSource, buildBangumiArea } from '@/lib/epg/bangumi';
import { fetchBangumiHtml, ingestBangumiHtml } from '@/lib/epg/ingest';

type Body = {
  siteId?: string;
  collectEpg?: boolean;
  epgDays?: number;
  ggmGroupId?: number;
  sources?: BangumiSource[];
  autoCreateTasks?: boolean;
  maxAutoTasks?: number;
  minTaskPriority?: number;
  taskAction?: string;
};

type TaskifyStats = {
  attempted: number;
  processed: number;
  created: number;
  updated: number;
  statusUpdated: number;
  failed: number;
  taskIds: string[];
  errors: string[];
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const site = await ensureSingleSite();

    const shouldCollectEpg = body.collectEpg !== false;
    const epgDays = normalizeEpgDays(body.epgDays);
    const ggmGroupId = normalizeGroupId(body.ggmGroupId);
    const sources = normalizeSources(body.sources);
    const shouldAutoCreateTasks = body.autoCreateTasks !== false;
    const maxAutoTasks = normalizeMaxAutoTasks(body.maxAutoTasks);
    const minTaskPriority = normalizeMinTaskPriority(body.minTaskPriority);

    let collectSummary: Record<string, unknown> = {
      status: 'skipped',
      reason: 'collectEpg is false'
    };

    if (shouldCollectEpg) {
      try {
        const collected = await collectEpg({
          days: epgDays,
          ggmGroupId,
          sources
        });

        collectSummary = {
          status: collected.results.length > 0 ? 'success' : 'skipped',
          summary: collected
        };
      } catch (error: any) {
        collectSummary = {
          status: 'error',
          message: String(error?.message || error),
          ggmGroupId,
          sources
        };
      }
    }

    const generateSummary = await generateRecommendationsForSite({
      prisma,
      siteId: site.id
    });

    let taskifySummary: Record<string, unknown> = {
      status: 'skipped',
      reason: 'autoCreateTasks is false'
    };

    if (shouldAutoCreateTasks) {
      const candidates = await pickTaskifyCandidates({
        siteId: site.id,
        maxAutoTasks,
        minTaskPriority
      });

      const stats = await taskifyRecommendations({
        candidates,
        taskAction: body.taskAction
      });

      taskifySummary = {
        status: resolveTaskifyStatus(stats),
        summary: stats
      };
    }

    return ok(req, {
      siteId: site.id,
      summary: {
        collect: collectSummary,
        generate: {
          status: generateSummary.generated > 0 ? 'success' : 'skipped',
          summary: generateSummary
        },
        taskify: taskifySummary
      },
      options: {
        collectEpg: shouldCollectEpg,
        epgDays,
        ggmGroupId,
        sources,
        autoCreateTasks: shouldAutoCreateTasks,
        maxAutoTasks,
        minTaskPriority,
        taskAction: body.taskAction || null
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

async function collectEpg(params: { days: number; ggmGroupId: number; sources: BangumiSource[] }) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const results: Array<Record<string, unknown>> = [];
  for (const source of params.sources) {
    const groupId = source === 'td' || source === 'radio' ? params.ggmGroupId : 0;
    const area = buildBangumiArea(source, groupId);

    for (let day = 0; day < params.days; day += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + day);
      const dateKey = formatDateKey(current);
      const dateKeyCompact = dateKey.replace(/-/g, '');

      const { html, url } = await fetchBangumiHtml({
        source,
        dateKeyCompact,
        ggmGroupId: groupId || undefined
      });
      const summary = await ingestBangumiHtml({
        html,
        area,
        url,
        dateKey,
        source,
        groupId: groupId || undefined
      });

      results.push({
        source,
        area,
        url,
        ...summary
      });
    }
  }

  return {
    days: params.days,
    ggmGroupId: params.ggmGroupId,
    sources: params.sources,
    results
  };
}

async function pickTaskifyCandidates(params: {
  siteId: string;
  maxAutoTasks: number;
  minTaskPriority: number;
}) {
  return prisma.recommendation.findMany({
    where: {
      siteId: params.siteId,
      status: { in: ['pending', 'in_progress'] },
      priority: { gte: params.minTaskPriority }
    },
    orderBy: [
      { priority: 'desc' },
      { dueAt: 'asc' },
      { createdAt: 'asc' },
      { title: 'asc' },
      { id: 'asc' }
    ],
    take: params.maxAutoTasks
  }) as Promise<Recommendation[]>;
}

async function taskifyRecommendations(params: {
  candidates: Recommendation[];
  taskAction?: string;
}): Promise<TaskifyStats> {
  const stats: TaskifyStats = {
    attempted: params.candidates.length,
    processed: 0,
    created: 0,
    updated: 0,
    statusUpdated: 0,
    failed: 0,
    taskIds: [],
    errors: []
  };

  for (const candidate of params.candidates) {
    try {
      const result = await upsertTaskFromRecommendation({
        prisma,
        recommendation: candidate,
        requestedAction: params.taskAction
      });
      stats.processed += 1;
      if (result.created) stats.created += 1;
      else stats.updated += 1;
      if (result.recommendationStatusUpdated) stats.statusUpdated += 1;
      if (stats.taskIds.length < 30) stats.taskIds.push(result.task.id);
    } catch (error: any) {
      stats.failed += 1;
      if (stats.errors.length < 10) {
        stats.errors.push(`${candidate.id}: ${String(error?.message || error)}`);
      }
    }
  }

  return stats;
}

function resolveTaskifyStatus(stats: TaskifyStats) {
  if (stats.attempted === 0) return 'skipped';
  if (stats.failed === 0) return 'success';
  if (stats.processed > 0) return 'partial';
  return 'error';
}

function normalizeSources(value: unknown): BangumiSource[] {
  if (!Array.isArray(value)) return [...BANGUMI_SOURCES];
  const valid = value.filter((v): v is BangumiSource => BANGUMI_SOURCES.includes(v as BangumiSource));
  return valid.length ? Array.from(new Set(valid)) : [...BANGUMI_SOURCES];
}

function normalizeEpgDays(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(3, Math.trunc(parsed)));
}

function normalizeGroupId(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 42;
  return Math.trunc(parsed);
}

function normalizeMaxAutoTasks(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 15;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

function normalizeMinTaskPriority(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(0, Math.min(100, Math.trunc(parsed)));
}

function formatDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
