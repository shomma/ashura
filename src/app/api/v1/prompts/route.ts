import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const category = searchParams.get('category')?.trim();

    const site = await requireSingleSite();

    const items = await prisma.promptPreset.findMany({
      where: {
        siteId: site.id,
        ...(category ? { category } : {}),
        ...(q
          ? {
              OR: [{ name: { contains: q } }, { prompt: { contains: q } }]
            }
          : {})
      },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }]
    });

    return ok(req, { siteId: site.id, items });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      siteId?: string;
      name?: string;
      category?: string;
      prompt?: string;
      isDefault?: boolean;
    };

    const name = normalizeText(body.name);
    const category = normalizeText(body.category) || 'general';
    const prompt = normalizeText(body.prompt);
    const isDefault = Boolean(body.isDefault);

    if (!name || !prompt) {
      return fail(req, 400, 'BAD_REQUEST', 'name and prompt are required');
    }

    const site = await requireSingleSite();

    const created = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.promptPreset.updateMany({
          where: { siteId: site.id, isDefault: true },
          data: { isDefault: false }
        });
      }
      return tx.promptPreset.create({
        data: {
          siteId: site.id,
          name,
          category,
          prompt,
          isDefault
        }
      });
    });

    return ok(req, created, 201);
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
