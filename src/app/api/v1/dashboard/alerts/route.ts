import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

const MAX_LIMIT = 100;

type AlertSeverity = 'critical' | 'warning' | 'info';

function normalizeSeverity(value: string | null) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'warning' || normalized === 'critical' || normalized === 'info') {
    return normalized as AlertSeverity;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const severity = normalizeSeverity(searchParams.get('severity'));
    const channel = searchParams.get('channel')?.trim() || '';
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(MAX_LIMIT, limitRaw)) : 50;
    const site = await requireSingleSite();

    const where: Record<string, unknown> = {
      siteId: site.id,
      status: 'open'
    };
    if (severity) where.severity = severity;
    if (channel) where.channel = channel;

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: [{ detectedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });

    const [criticalCount, warningCount, infoCount] = await Promise.all([
      prisma.alert.count({ where: { siteId: site.id, status: 'open', severity: 'critical' } }),
      prisma.alert.count({ where: { siteId: site.id, status: 'open', severity: 'warning' } }),
      prisma.alert.count({ where: { siteId: site.id, status: 'open', severity: 'info' } })
    ]);

    return ok(req, {
      siteId: site.id,
      summary: {
        total: alerts.length,
        critical: criticalCount,
        warning: warningCount,
        info: infoCount
      },
      items: alerts.map((alert) => ({
        id: alert.id,
        siteId: alert.siteId,
        opportunityId: alert.opportunityId,
        taskId: alert.taskId,
        severity: alert.severity,
        channel: alert.channel,
        message: alert.message,
        status: alert.status,
        detectedAt: alert.detectedAt,
        resolvedAt: alert.resolvedAt
      })),
      generatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

