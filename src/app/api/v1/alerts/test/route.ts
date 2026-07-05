import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

type Body = {
  siteId?: string;
  severity?: 'critical' | 'warning' | 'info';
  message?: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const severity = body.severity?.trim() || 'info';
    const message = (body.message || 'manual test alert').trim();
    const site = await requireSingleSite();

    const allowed = new Set(['critical', 'warning', 'info']);
    if (!allowed.has(severity)) {
      return fail(req, 400, 'BAD_REQUEST', 'severity must be critical, warning, or info');
    }

    const alert = await prisma.alert.create({
      data: {
        siteId: site.id,
        status: 'open',
        severity,
        message,
        channel: 'system',
        detectedAt: new Date()
      }
    });

    return ok(req, {
      siteId: site.id,
      alertId: alert.id,
      severity: alert.severity,
      message: alert.message,
      detectedAt: alert.detectedAt
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
