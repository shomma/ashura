import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { decodeJsonField, encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

const DEFAULT_WEIGHTS = {
  demand: 1,
  competition: 1,
  achievability: 1,
  business: 1,
  freshness: 1
};

export const runtime = 'nodejs';

type Body = {
  opportunityWeights?: Record<string, number>;
  taskWeights?: Record<string, number>;
  decayDays?: number;
  isActive?: boolean;
};

export async function GET(req: Request) {
  try {
    const site = await requireSingleSite();

    let config = await prisma.scoringConfig.findFirst({
      where: { siteId: site.id, isActive: true },
      orderBy: { version: 'desc' }
    });
    if (!config) {
      config = await prisma.scoringConfig.create({
        data: {
          siteId: site.id,
          opportunityWeights: encodeJsonField(DEFAULT_WEIGHTS) || '{}',
          taskWeights: encodeJsonField({}),
          decayDays: 30,
          isActive: true
        }
      });
    }

    return ok(req, {
      siteId: site.id,
      config: {
        id: config.id,
        version: config.version,
        isActive: config.isActive,
        decayDays: config.decayDays,
        opportunityWeights: decodeJsonField(config.opportunityWeights, DEFAULT_WEIGHTS),
        taskWeights: decodeJsonField(config.taskWeights, {})
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const site = await requireSingleSite();

    let config = await prisma.scoringConfig.findFirst({
      where: { siteId: site.id, isActive: true },
      orderBy: { version: 'desc' }
    });
    if (!config) {
      config = await prisma.scoringConfig.create({
        data: {
          siteId: site.id,
          opportunityWeights: encodeJsonField(DEFAULT_WEIGHTS) || '{}',
          taskWeights: encodeJsonField({}),
          decayDays: 30,
          isActive: true
        }
      });
    }

    const currentTaskWeights = decodeJsonField<Record<string, unknown>>(config.taskWeights, {});
    const currentOpportunityWeights = decodeJsonField<Record<string, unknown>>(
      config.opportunityWeights,
      DEFAULT_WEIGHTS
    );

    const nextOpportunityWeights = body.opportunityWeights
      ? {
          ...currentOpportunityWeights,
          ...body.opportunityWeights
        }
      : currentOpportunityWeights;

    const nextTaskWeights = body.taskWeights
      ? {
          ...currentTaskWeights,
          ...body.taskWeights
        }
      : currentTaskWeights;

    const decayDays =
      typeof body.decayDays === 'number' && Number.isFinite(body.decayDays)
        ? Math.max(1, Math.min(90, Math.round(body.decayDays)))
        : config.decayDays;

    const nextIsActive =
      body.isActive === undefined ? config.isActive : !!body.isActive;

    const updated = await prisma.scoringConfig.update({
      where: { id: config.id },
      data: {
        opportunityWeights: encodeJsonField(nextOpportunityWeights) || '{}',
        taskWeights: encodeJsonField(nextTaskWeights),
        decayDays,
        isActive: nextIsActive,
        ...(nextIsActive ? {} : {})
      }
    });

    return ok(req, {
      siteId: site.id,
      config: {
        id: updated.id,
        version: updated.version,
        isActive: updated.isActive,
        decayDays: updated.decayDays,
        opportunityWeights: decodeJsonField(updated.opportunityWeights, DEFAULT_WEIGHTS),
        taskWeights: decodeJsonField(updated.taskWeights, {})
      }
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
