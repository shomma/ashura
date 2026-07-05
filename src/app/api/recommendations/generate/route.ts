import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateRecommendationsForSite } from '@/lib/recommendations/engine';
import { ensureSingleSite } from '@/lib/single-site';

type GenerateBody = {
  siteId?: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await req.json().catch(() => ({} as GenerateBody));
    const site = await ensureSingleSite();

    const summary = await generateRecommendationsForSite({
      prisma,
      siteId: site.id
    });

    const status =
      summary.generated === 0
        ? 'skipped'
        : summary.created > 0 || summary.updated > 0
        ? 'success'
        : 'partial';

    return NextResponse.json({
      ok: true,
      status,
      summary
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

