import prisma from '@/lib/prisma';
import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

export const runtime = 'nodejs';

type Context = {
  params: {
    id: string;
  };
};

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function ensurePrompt(promptId: string, siteId: string) {
  return prisma.promptPreset.findFirst({
    where: {
      id: promptId,
      siteId
    }
  });
}

export async function PATCH(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();
    const prompt = await ensurePrompt(context.params.id, site.id);
    if (!prompt) {
      return fail(req, 404, 'NOT_FOUND', 'prompt preset not found');
    }

    const body = (await req.json()) as {
      name?: string;
      category?: string;
      prompt?: string;
      isDefault?: boolean;
    };

    const name = normalizeText(body.name);
    const category = normalizeText(body.category);
    const promptText = normalizeText(body.prompt);
    const isDefault = typeof body.isDefault === 'boolean' ? body.isDefault : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.promptPreset.updateMany({
          where: { siteId: prompt.siteId, isDefault: true, id: { not: prompt.id } },
          data: { isDefault: false }
        });
      }

      return tx.promptPreset.update({
        where: { id: prompt.id },
        data: {
          ...(name ? { name } : {}),
          ...(category ? { category } : {}),
          ...(promptText ? { prompt: promptText } : {}),
          ...(typeof isDefault === 'boolean' ? { isDefault } : {})
        }
      });
    });

    return ok(req, updated);
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

export async function DELETE(req: Request, context: Context) {
  try {
    const site = await requireSingleSite();
    const prompt = await ensurePrompt(context.params.id, site.id);
    if (!prompt) {
      return fail(req, 404, 'NOT_FOUND', 'prompt preset not found');
    }

    await prisma.promptPreset.delete({ where: { id: prompt.id } });
    return ok(req, { id: prompt.id, deleted: true });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}
