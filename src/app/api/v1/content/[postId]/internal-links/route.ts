import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

type Context = {
  params: {
    postId: string;
  };
};

export const runtime = 'nodejs';

export async function GET(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: context.params.postId, siteId: site.id },
      include: {
        tasks: {
          select: {
            id: true,
            title: true,
            action: true,
            status: true,
            recommendedDueAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!opportunity) {
      return fail(req, 404, 'NOT_FOUND', 'post not found');
    }

    const links = await prisma.keyword.findMany({
      where: { siteId: site.id },
      orderBy: { priority: 'desc' },
      take: 10
    });

    const items = links.map((keyword) => ({
      postId: context.params.postId,
      keywordId: keyword.id,
      keyword: keyword.term,
      suggestedUrl: `/dashboard/keywords/${keyword.id}`,
      reason: `Link to keyword asset: ${keyword.term}`
    }));

    return ok(req, {
      siteId: site.id,
      postId: opportunity.id,
      title: opportunity.title,
      tasks: opportunity.tasks,
      candidates: items
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
