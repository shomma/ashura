import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

const ALLOWED_ACTIONS = new Set(['write', 'rewrite', 'linking', 'research']);

type Context = {
  params: {
    id: string;
  };
};

type Body = {
  siteId?: string;
  ids?: unknown;
  action?: string;
  dueAt?: string;
  payload?: unknown;
};

function normalizeAction(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : 'write';
  return ALLOWED_ACTIONS.has(value) ? value : 'write';
}

function parseIds(raw: unknown) {
  if (!Array.isArray(raw)) return null;
  const ids = Array.from(
    new Set(
      raw.map((item) => {
        return typeof item === 'string' ? item.trim() : '';
      })
    )
  ).filter((value) => value.length > 0);
  return ids.length ? ids : null;
}

function dedupeKey(opportunityId: string, action: string) {
  return `opportunity:${opportunityId}:action:${action}`;
}

export async function POST(req: Request) {
  try {
    const body = ((await req.json().catch(() => ({}))) || {}) as Body;
    const ids = parseIds(body.ids);
    const action = normalizeAction(body.action);

    if (!ids) {
      return fail(req, 400, 'BAD_REQUEST', 'ids must be a non-empty array');
    }

    const site = await requireSingleSite();

    const opportunities = await prisma.opportunity.findMany({
      where: { siteId: site.id, id: { in: ids } },
      select: {
        id: true,
        title: true,
        score: true,
        why: true,
        impact: true,
        confidence: true
      }
    });

    if (opportunities.length === 0) {
      return ok(req, {
        siteId: site.id,
        requestedCount: ids.length,
        foundCount: 0,
        createdCount: 0,
        updatedCount: 0,
        skipped: ids,
        results: []
      });
    }

    const dueAt =
      typeof body.dueAt === 'string' && body.dueAt.trim().length > 0
        ? new Date(body.dueAt)
        : null;
    const payloadBase: Record<string, unknown> =
      body.payload && typeof body.payload === 'object' && body.payload !== null
        ? (body.payload as Record<string, unknown>)
        : { source: 'opportunities-bulk-task' };

    const requestedIds = new Set(opportunities.map((item) => item.id));
    const dedupeKeys = opportunities.map((opportunity) => dedupeKey(opportunity.id, action));

    const existingTasks = await prisma.task.findMany({
      where: {
        siteId: site.id,
        dedupeKey: { in: dedupeKeys }
      },
      select: { id: true, dedupeKey: true, opportunityId: true, status: true }
    });
    const existingByKey = new Map(existingTasks.map((task) => [task.dedupeKey, task]));

    const results: Array<{
      opportunityId: string;
      title: string;
      taskId: string;
      action: string;
      status: string;
      created: boolean;
    }> = [];
    let createdCount = 0;
    let updatedCount = 0;

    for (const opportunity of opportunities) {
      const key = dedupeKey(opportunity.id, action);
      const payload = {
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        opportunityScore: opportunity.score,
        opportunityConfidence: opportunity.confidence,
        reason: 'bulk task from opportunities list',
        ...payloadBase
      };
      const payloadForDb = encodeJsonField(payload);

      const existing = existingByKey.get(key);
      const task = existing
        ? await prisma.task.update({
            where: { id: existing.id },
            data: {
              title: `Opportunity: ${opportunity.title}`,
              action,
              source: 'opportunity',
              recommendedDueAt: dueAt,
              payload: payloadForDb
            }
          })
        : await prisma.task.create({
            data: {
              siteId: site.id,
              opportunityId: opportunity.id,
              title: `Opportunity: ${opportunity.title}`,
              action,
              source: 'opportunity',
              dedupeKey: key,
              status: 'pending',
              recommendedDueAt: dueAt,
              payload: payloadForDb
            }
          });

      if (existing) {
        updatedCount += 1;
      } else {
        createdCount += 1;
      }

      results.push({
        opportunityId: opportunity.id,
        title: opportunity.title,
        taskId: task.id,
        action,
        status: task.status,
        created: !existing
      });
    }

    return ok(req, {
      siteId: site.id,
      requestedCount: ids.length,
      foundCount: opportunities.length,
      createdCount,
      updatedCount,
      skipped: ids.filter((id) => !requestedIds.has(id)),
      results
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
