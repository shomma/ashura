import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { decodeJsonField, encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

const DEFAULT_ALERTS = {
  positionDropRate: 0.2,
  trafficDropRate: 0.2,
  minConfidence: 0.55
};

export const runtime = 'nodejs';

type Body = {
  positionDropRate?: number;
  trafficDropRate?: number;
  minConfidence?: number;
  freshnessHours?: number;
};

function normalizeRate(value: unknown, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(1, value));
}

export async function GET(req: Request) {
  try {
    const site = await requireSingleSite();

    const config = await prisma.scoringConfig.findFirst({ where: { siteId: site.id, isActive: true } });
    const configWeights = config ? decodeJsonField<Record<string, unknown>>(config.taskWeights, {}) : {};

    const alerts = (configWeights.alerts && typeof configWeights.alerts === 'object'
      ? (configWeights.alerts as Record<string, unknown>)
      : {}) || {};

    return ok(req, {
      siteId: site.id,
      alerts: {
        positionDropRate: normalizeRate(alerts.positionDropRate, DEFAULT_ALERTS.positionDropRate),
        trafficDropRate: normalizeRate(alerts.trafficDropRate, DEFAULT_ALERTS.trafficDropRate),
        minConfidence: normalizeRate(alerts.minConfidence, DEFAULT_ALERTS.minConfidence),
        freshnessHours:
          typeof alerts.freshnessHours === 'number' && Number.isFinite(alerts.freshnessHours)
            ? Math.max(1, Math.min(24 * 7, alerts.freshnessHours))
            : 24
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

    const next = {
      positionDropRate: normalizeRate(body.positionDropRate, DEFAULT_ALERTS.positionDropRate),
      trafficDropRate: normalizeRate(body.trafficDropRate, DEFAULT_ALERTS.trafficDropRate),
      minConfidence: normalizeRate(body.minConfidence, DEFAULT_ALERTS.minConfidence),
      freshnessHours:
        typeof body.freshnessHours === 'number' && Number.isFinite(body.freshnessHours)
          ? Math.max(1, Math.min(24 * 7, body.freshnessHours))
          : 24
    };

    let config = await prisma.scoringConfig.findFirst({ where: { siteId: site.id, isActive: true } });
    if (!config) {
      config = await prisma.scoringConfig.create({
        data: {
          siteId: site.id,
          opportunityWeights:
            encodeJsonField({ demand: 1, competition: 1, achievability: 1, business: 1, freshness: 1 }) ||
            '{}',
          taskWeights: encodeJsonField({ alerts: next }),
          decayDays: 30,
          isActive: true
        }
      });
    } else {
      const current = decodeJsonField<Record<string, unknown>>(config.taskWeights, {});
      const updatedTaskWeights: Record<string, unknown> = {
        ...current,
        alerts: next
      };
      await prisma.scoringConfig.update({
        where: { id: config.id },
        data: { taskWeights: encodeJsonField(updatedTaskWeights) }
      });
      config = await prisma.scoringConfig.findUnique({ where: { id: config.id } });
    }

    return ok(req, {
      siteId: site.id,
      alerts: next,
      configId: config?.id || null
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
