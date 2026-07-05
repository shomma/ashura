import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { upsertTaskFromRecommendation } from '@/lib/recommendations/taskify';
import { requireSingleSite } from '@/lib/single-site';

type CreateTaskBody = {
  action?: string;
  title?: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request, context: { params: { id: string } }) {
  try {
    const recommendationId = context.params.id;
    const body = (await req.json()) as CreateTaskBody;
    const site = await requireSingleSite();

    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
      include: {
        site: true,
        taskLinks: {
          include: {
            task: true
          }
        }
      }
    });
    if (!recommendation || recommendation.siteId !== site.id) {
      return NextResponse.json({ error: 'recommendation not found' }, { status: 404 });
    }

    const { task, action } = await upsertTaskFromRecommendation({
      prisma,
      recommendation,
      requestedAction: body.action,
      titleOverride: body.title
    });

    return NextResponse.json({
      ok: true,
      task,
      recommendationId: recommendation.id,
      mode: action === 'touch' ? 'touch' : 'write'
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
