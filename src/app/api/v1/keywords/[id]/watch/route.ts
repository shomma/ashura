import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { encodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    id: string;
  };
};

type WatchBody = {
  reason?: string;
  source?: string;
  locale?: string;
  device?: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request, context: Context) {
  try {
    const body = (await req.json().catch(() => ({}))) as WatchBody;
    const site = await requireSingleSite();

    const keyword = await prisma.keyword.findFirst({
      where: { id: context.params.id, siteId: site.id }
    });
    if (!keyword) {
      return fail(req, 404, 'NOT_FOUND', 'keyword not found');
    }

    const signal = await prisma.signal.create({
      data: {
        siteId: site.id,
        keywordId: keyword.id,
        type: 'trend',
        source: 'manual',
        severity: 'info',
        score: 0,
        title: `watch:${keyword.term}`,
        summary: body.reason || `watch keyword=${keyword.term}`,
        observedAt: new Date(),
        actionLabel: 'open',
        actionHref: `/dashboard/keywords/${keyword.id}`,
        payload: encodeJsonField({
          source: body.source || null,
          locale: body.locale || null,
          device: body.device || null
        })
      }
    });

    return ok(req, {
      siteId: site.id,
      keywordId: keyword.id,
      signalId: signal.id,
      action: `/api/v1/keywords/${encodeURIComponent(keyword.id)}/watch`
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
