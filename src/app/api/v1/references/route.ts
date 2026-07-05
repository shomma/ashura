import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';
import { encodeJsonArray } from '@/lib/json-fields';

export const runtime = 'nodejs';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((tag) => normalizeText(tag))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function jsonTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : [];
}

function matchesQuery(
  item: { title: string; note: string | null; url: string | null; tags: unknown },
  q: string
) {
  const needle = q.toLowerCase();
  return (
    item.title.toLowerCase().includes(needle) ||
    (item.note || '').toLowerCase().includes(needle) ||
    (item.url || '').toLowerCase().includes(needle) ||
    jsonTags(item.tags).some((tag) => tag.toLowerCase().includes(needle))
  );
}

async function validateLinks(siteId: string, taskId?: string, opportunityId?: string) {
  if (taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId, siteId }, select: { id: true } });
    if (!task) throw new Error('linked task not found');
  }
  if (opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({ where: { id: opportunityId, siteId }, select: { id: true } });
    if (!opportunity) throw new Error('linked opportunity not found');
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();

    const site = await requireSingleSite();

    const rows = await prisma.referenceItem.findMany({
      where: { siteId: site.id },
      include: {
        task: { select: { id: true, title: true } },
        opportunity: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: q ? 200 : 100
    });
    const items = (q ? rows.filter((item) => matchesQuery(item, q)) : rows).slice(0, 100);

    return ok(req, { siteId: site.id, items });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      siteId?: string;
      title?: string;
      url?: string;
      note?: string;
      tags?: string[] | string;
      taskId?: string | null;
      opportunityId?: string | null;
    };

    const title = normalizeText(body.title);
    const url = normalizeText(body.url);
    const note = normalizeText(body.note);
    const tags = normalizeTags(body.tags);
    const taskId = normalizeText(body.taskId);
    const opportunityId = normalizeText(body.opportunityId);

    if (!title) {
      return fail(req, 400, 'BAD_REQUEST', 'title is required');
    }

    const site = await requireSingleSite();

    await validateLinks(site.id, taskId || undefined, opportunityId || undefined);

    const created = await prisma.referenceItem.create({
      data: {
        siteId: site.id,
        title,
        url: url || null,
        note: note || null,
        tags: encodeJsonArray(tags),
        taskId: taskId || null,
        opportunityId: opportunityId || null
      },
      include: {
        task: { select: { id: true, title: true } },
        opportunity: { select: { id: true, title: true } }
      }
    });

    return ok(req, created, 201);
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
