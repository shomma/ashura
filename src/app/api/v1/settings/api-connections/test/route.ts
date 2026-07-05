import { fail, ok } from '@/lib/api-v1';

type Body = {
  siteId?: string;
  checkId?: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const checkId = body.checkId?.trim();
    if (!checkId) {
      return fail(req, 400, 'BAD_REQUEST', 'checkId is required');
    }

    if (checkId === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return ok(req, {
          checkId,
          ready: false,
          detail: 'GEMINI_API_KEY is not configured.'
        });
      }

      try {
        const result = await pingGeminiApiKey(apiKey);
        return ok(req, {
          checkId,
          ready: true,
          detail: result.detail
        });
      } catch (error: any) {
        return ok(req, {
          checkId,
          ready: false,
          detail: `Gemini connection failed: ${String(error?.message || error)}`
        });
      }
    }

    if (checkId === 'serpapi') {
      return ok(req, {
        checkId,
        ready: Boolean(process.env.SERPAPI_KEY),
        detail: process.env.SERPAPI_KEY
          ? 'SERPAPI_KEY is configured.'
          : 'SERPAPI_KEY is not configured. Search checks will use fallback collection.'
      });
    }

    if (checkId === 'epg') {
      return ok(req, {
        checkId,
        ready: true,
        detail: 'Program table fetching is available without an additional API key.'
      });
    }

    return fail(req, 400, 'BAD_REQUEST', `unsupported checkId: ${checkId}`);
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

async function pingGeminiApiKey(apiKey: string) {
  const endpoints = [
    {
      version: 'v1beta',
      url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    },
    {
      version: 'v1',
      url: `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
    }
  ] as const;

  const errors: string[] = [];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(endpoint.url, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      const text = await res.text();
      let payload: any = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }

      if (!res.ok) {
        errors.push(
          `${endpoint.version}: ${res.status} ${payload?.error?.message || res.statusText}`
        );
        continue;
      }

      const modelCount = Array.isArray(payload?.models) ? payload.models.length : 0;
      return {
        detail: `Gemini API key verified (${endpoint.version}, models=${modelCount}).`
      };
    } catch (error: any) {
      errors.push(`${endpoint.version}: ${String(error?.message || error)}`);
    }
  }

  throw new Error(errors.join(' | ') || 'Gemini API connection failed');
}
