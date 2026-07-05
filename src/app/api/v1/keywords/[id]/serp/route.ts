import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    id: string;
  };
};

export const runtime = 'nodejs';

export async function GET(req: Request, context: Context) {
  try {
    const { searchParams } = new URL(req.url);
    const limitRaw = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;
    const site = await requireSingleSite();

    const keyword = await prisma.keyword.findFirst({
      where: { id: context.params.id, siteId: site.id },
      include: {
        serps: {
          orderBy: { fetchedAt: 'desc' },
          take: limit
        }
      }
    });

    if (!keyword) {
      return fail(req, 404, 'NOT_FOUND', 'keyword not found');
    }

    return ok(req, {
      siteId: site.id,
      keywordId: keyword.id,
      term: keyword.term,
      serpCount: keyword.serps.length,
      serps: keyword.serps.map((serp) => ({
        id: serp.id,
        provider: serp.provider,
        locale: serp.locale,
        device: serp.device,
        rank: serp.rank,
        url: serp.url,
        title: serp.title,
        snippet: serp.snippet,
        resultCount: serp.resultCount,
        fetchedAt: serp.fetchedAt
      }))
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
