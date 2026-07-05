import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import {
  buildOpportunityExpected,
  buildOpportunityEvidenceItems,
  buildOpportunityScoreBreakdown,
  mapOpportunityType,
  mapOpportunityStatusDbToApi,
  buildOpportunityActions,
  normalizeConfidence01,
  normalizeScore
} from '@/lib/api-mapping';
import { decodeJsonArray, decodeJsonField } from '@/lib/json-fields';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

type Context = {
  params: {
    opportunityId: string;
  };
};

type PatchOpportunityBody = {
  status?: string;
  priority?: number;
  note?: string;
  why?: string;
};

const ALLOWED_STATUSES = new Set(['open', 'saved', 'dismissed', 'tasked', 'done']);

export async function GET(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: context.params.opportunityId, siteId: site.id },
      include: {
        evidences: {
          orderBy: { createdAt: 'desc' }
        },
        tasks: {
          select: { id: true, title: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' }
        },
        signals: {
          select: {
            id: true,
            type: true,
            source: true,
            severity: true,
            score: true,
            title: true,
            summary: true,
            observedAt: true
          },
          orderBy: { observedAt: 'desc' },
          take: 20
        },
        taskOutcomes: {
          orderBy: { createdAt: 'desc' },
          include: {
            task: {
              select: { id: true }
            }
          },
          take: 20
        }
      }
    });

    if (!opportunity) {
      return fail(req, 404, 'NOT_FOUND', 'opportunity not found');
    }

    const type = mapOpportunityType({
      source: opportunity.source,
      category: opportunity.category,
      tags: decodeJsonArray(opportunity.tags),
      title: opportunity.title
    });
    const score = buildOpportunityScoreBreakdown({
      score: opportunity.score,
      impactScore: opportunity.impactScore,
      confidence: opportunity.confidence,
      observedAt: opportunity.observedAt,
      createdAt: opportunity.createdAt
    });
    const expected = buildOpportunityExpected({
      score,
      confidence: normalizeConfidence01(opportunity.confidence)
    });
    const confidence = normalizeConfidence01(opportunity.confidence);
    const evidences = buildOpportunityEvidenceItems(
      opportunity.evidences.map((item) => ({
        kind: item.kind,
        label: item.label,
        value: item.value,
        sourceUrl: item.sourceUrl,
        observedAt: item.observedAt,
        payload: decodeJsonField(item.payload, null)
      }))
    );

    const legacyEvidence = opportunity.evidences.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      value: item.value,
      sourceUrl: item.sourceUrl,
      observedAt: item.observedAt ? item.observedAt.toISOString() : null
    }));

    const actions = buildOpportunityActions({
      title: opportunity.title,
      type
    });

    const linkedTasks = opportunity.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      href: `/dashboard/tasks/${task.id}`,
      createdAt: task.createdAt.toISOString()
    }));

    return ok(req, {
      id: opportunity.id,
      siteId: opportunity.siteId,
      type,
      title: opportunity.title,
      why: opportunity.why || opportunity.summary || '',
      impact: opportunity.impact || null,
      status: mapOpportunityStatusDbToApi(opportunity.status),
      source: opportunity.source,
      score: normalizeScore(score.total, 0, 100),
      scoreBreakdown: score,
      expected,
      confidence,
      evidence: evidences,
      evidences: legacyEvidence,
      evidenceCount: legacyEvidence.length,
      actions,
      signals: opportunity.signals,
      linkedTasks,
      history: opportunity.taskOutcomes.map((item) => ({
        id: item.id,
        taskId: item.task?.id ?? null,
        status: item.status,
        outcome: item.outcome ?? null,
        measuredAt: item.updatedAt ? item.updatedAt.toISOString() : item.createdAt.toISOString(),
        createdAt: item.createdAt.toISOString()
      })),
      createdAt: opportunity.createdAt.toISOString(),
      updatedAt: opportunity.updatedAt.toISOString(),
      dueAt: opportunity.resolvedAt ? opportunity.resolvedAt.toISOString() : null
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function PATCH(req: Request, context: Context) {
  try {
    const body = (await req.json().catch(() => ({}))) as PatchOpportunityBody;
    const site = await requireSingleSite();

    const existing = await prisma.opportunity.findFirst({
      where: { id: context.params.opportunityId, siteId: site.id }
    });
    if (!existing) {
      return fail(req, 404, 'NOT_FOUND', 'opportunity not found');
    }

    const nextStatus =
      typeof body.status === 'string' && ALLOWED_STATUSES.has(body.status)
        ? body.status
        : undefined;

    const data: Record<string, unknown> = {
      updatedAt: new Date()
    };
    if (nextStatus) data.status = nextStatus;
    if (typeof body.why === 'string' && body.why.trim().length > 0) data.why = body.why.trim();
    if (typeof body.note === 'string' && body.note.trim().length > 0) data.summary = body.note.trim();
    if (typeof body.priority === 'number' && Number.isFinite(body.priority)) {
      const note = `${body.priority}`;
      data.summary = note;
    }
    if (nextStatus === 'done' && existing.status !== 'done') {
      data.resolvedAt = new Date();
    }
    if (nextStatus && nextStatus !== 'done') {
      data.resolvedAt = null;
    }

    const updated = await prisma.opportunity.update({
      where: { id: existing.id },
      data
    });

    return ok(req, {
      id: updated.id,
      siteId: updated.siteId,
      title: updated.title,
      status: mapOpportunityStatusDbToApi(updated.status),
      why: updated.why || updated.summary || '',
      impact: updated.impact,
      confidence: normalizeConfidence01(updated.confidence),
      score: normalizeScore(updated.score, 0, 100),
      source: updated.source,
      updatedAt: updated.updatedAt.toISOString(),
      note: typeof data.summary === 'string' ? data.summary : null
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
