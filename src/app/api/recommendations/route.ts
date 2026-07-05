import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  compareRecommendationsForDisplay,
  getRecommendationDisplayPriority
} from '@/lib/recommendations/priority';
import { ensureSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const site = await ensureSingleSite();

    const recommendations = await prisma.recommendation.findMany({
      where: {
        siteId: site.id,
        ...(status ? { status } : {})
      },
      include: {
        taskLinks: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                action: true,
                createdAt: true
              }
            }
          }
        }
      },
      orderBy: [
        { priority: 'desc' },
        { dueAt: 'asc' },
        { createdAt: 'asc' },
        { title: 'asc' },
        { id: 'asc' }
      ]
    });

    const items = [...recommendations].sort(compareRecommendationsForDisplay).map((item) => ({
      ...item,
      priority: getRecommendationDisplayPriority(item)
    }));

    return NextResponse.json({
      ok: true,
      items
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

