import { fail, ok } from '@/lib/api-v1';
import { requireSingleSite } from '@/lib/single-site';

type SuggestBody = {
  siteId?: string;
  terms?: string[];
  perTerm?: number;
};

type SuggestItem = {
  seedTerm: string;
  suggestions: string[];
  error?: string;
};

const MAX_TERMS = 8;
const MAX_PER_TERM = 6;
const SUGGEST_CONCURRENCY = 2;
const SUGGEST_FETCH_TIMEOUT_MS = 6000;

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as SuggestBody;
    const terms = normalizeTerms(body.terms);
    const perTerm = clamp(Number(body.perTerm || 5), 1, MAX_PER_TERM);

    if (!terms.length) {
      return fail(req, 400, 'BAD_REQUEST', 'terms is required');
    }

    const site = await requireSingleSite();

    const items = await fetchSuggestions(terms.slice(0, MAX_TERMS), perTerm);
    const suggestionCount = items.reduce((acc, item) => acc + item.suggestions.length, 0);

    return ok(req, {
      siteId: site.id,
      seedCount: items.length,
      suggestionCount,
      note: 'Googleサジェスト候補を取得しています。安定性のため件数を制限しています。',
      items
    });
  } catch (error: any) {
    return fail(req, 500, 'INTERNAL_ERROR', String(error?.message || error));
  }
}

function normalizeTerms(raw?: string[]) {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((term) => normalizeTerm(term))
        .filter((term) => term.length > 0)
    )
  );
}

function normalizeTerm(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

async function fetchSuggestions(terms: string[], perTerm: number) {
  const results = new Map<string, SuggestItem>();
  let index = 0;

  const workers = Array.from({ length: Math.min(SUGGEST_CONCURRENCY, terms.length) }, async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= terms.length) break;
      const term = terms[current];
      const item = await fetchGoogleSuggest(term, perTerm);
      results.set(term, item);
    }
  });

  await Promise.all(workers);
  return terms.map((term) => results.get(term) ?? { seedTerm: term, suggestions: [] });
}

async function fetchGoogleSuggest(seedTerm: string, perTerm: number): Promise<SuggestItem> {
  const q = encodeURIComponent(seedTerm);
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=ja&gl=jp&q=${q}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUGGEST_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6'
      }
    });
    if (!response.ok) {
      return { seedTerm, suggestions: [], error: `HTTP ${response.status}` };
    }

    const text = await response.text();
    const payload = parseSuggestPayload(text);
    const list = Array.isArray(payload?.[1]) ? payload[1] : [];

    const suggestions = Array.from(
      new Set(
        list
          .map((value) => normalizeTerm(String(value || '')))
          .filter((value) => value.length > 0)
          .filter((value) => value.toLowerCase() !== seedTerm.toLowerCase())
      )
    ).slice(0, perTerm);

    return { seedTerm, suggestions };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { seedTerm, suggestions: [], error: 'suggest request timeout' };
    }
    return { seedTerm, suggestions: [], error: String(error?.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

function parseSuggestPayload(text: string): any[] | null {
  const normalized = text.trim().replace(/^\)\]\}'\s*/, '');
  try {
    const payload = JSON.parse(normalized);
    return Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
