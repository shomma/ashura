import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { ensureSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

export async function DELETE() {
  try {
    const site = await ensureSingleSite();

    const counts = await prisma.$transaction(async (tx) => {
      const taskOutcomes = await tx.taskOutcome.deleteMany({ where: { siteId: site.id } });
      const alerts = await tx.alert.deleteMany({ where: { siteId: site.id } });
      const referenceItems = await tx.referenceItem.deleteMany({ where: { siteId: site.id } });
      const recommendations = await tx.recommendation.deleteMany({ where: { siteId: site.id } });
      const tasks = await tx.task.deleteMany({ where: { siteId: site.id } });
      const signals = await tx.signal.deleteMany({ where: { siteId: site.id } });
      const opportunities = await tx.opportunity.deleteMany({ where: { siteId: site.id } });
      const serps = await tx.serp.deleteMany({ where: { siteId: site.id } });
      const keywordSnapshots = await tx.keywordSnapshot.deleteMany({ where: { siteId: site.id } });
      const keywords = await tx.keyword.deleteMany({ where: { siteId: site.id } });
      const programs = await tx.program.deleteMany({});
      const epgHtml = await tx.epgHtml.deleteMany({});
      const channels = await tx.channel.deleteMany({});

      return {
        taskOutcomes: taskOutcomes.count,
        alerts: alerts.count,
        referenceItems: referenceItems.count,
        recommendations: recommendations.count,
        tasks: tasks.count,
        signals: signals.count,
        opportunities: opportunities.count,
        serps: serps.count,
        keywordSnapshots: keywordSnapshots.count,
        keywords: keywords.count,
        programs: programs.count,
        epgHtml: epgHtml.count,
        channels: channels.count
      };
    });

    return NextResponse.json({
      ok: true,
      siteId: site.id,
      counts
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
