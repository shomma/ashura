type GeminiCandidate = {
  version: 'v1' | 'v1beta';
  model: string;
};

type GeminiOptions = {
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
  useFallbacks?: boolean;
};

export async function callGeminiText(apiKey: string, prompt: string, options?: GeminiOptions) {
  const candidates = buildModelCandidates(options?.model, options?.useFallbacks);
  const errors: string[] = [];
  const generationConfig = buildGenerationConfig(options);

  for (const candidate of candidates) {
    const url = buildUrl(candidate.version, candidate.model, apiKey);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          ...(generationConfig ? { generationConfig } : {})
        })
      });
      const json = await res.json();
      if (!res.ok) {
        errors.push(`${candidate.version}/${candidate.model}: ${res.status} ${json?.error?.message || res.statusText}`);
        continue;
      }
      const text = extractText(json);
      if (!text) {
        errors.push(`${candidate.version}/${candidate.model}: empty response`);
        continue;
      }
      return { text, model: candidate.model, version: candidate.version };
    } catch (error: any) {
      errors.push(
        `${candidate.version}/${candidate.model}: ${String(error?.message || error)}`
      );
    }
  }

  throw new Error(`Gemini request failed: ${errors.join(' | ')}`);
}

function buildModelCandidates(preferredOverride?: string, useFallbacks = true): GeminiCandidate[] {
  const preferred = (preferredOverride || process.env.GEMINI_MODEL || 'models/gemini-3-pro').trim();
  const normalized = normalizeModelName(preferred);
  const fallbackModels = useFallbacks
    ? [
    'models/gemini-3-pro-preview',
    'models/gemini-2.5-flash',
    'models/gemini-2.5-pro',
    'models/gemini-2.0-flash',
    'models/gemini-2.0-flash-001',
    'models/gemini-flash-latest',
    'models/gemini-pro-latest'
      ]
    : [];

  const pairs: GeminiCandidate[] = [];
  const addPair = (version: GeminiCandidate['version'], model: string) => {
    pairs.push({ version, model });
  };

  addPair('v1beta', normalized);
  addPair('v1', normalized);

  for (const model of fallbackModels) {
    addPair('v1beta', model);
    addPair('v1', model);
  }

  const seen = new Set<string>();
  const deduped: GeminiCandidate[] = [];
  for (const pair of pairs) {
    const key = `${pair.version}:${pair.model}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(pair);
    }
  }

  return deduped;
}

function normalizeModelName(model: string) {
  return model.startsWith('models/') ? model : `models/${model}`;
}

function buildUrl(version: GeminiCandidate['version'], model: string, apiKey: string) {
  return `https://generativelanguage.googleapis.com/${version}/${model}:generateContent?key=${apiKey}`;
}

function extractText(payload: any) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const texts = parts.map((part: any) => part?.text).filter(Boolean);
  return texts.join('\n').trim();
}

function buildGenerationConfig(options?: GeminiOptions) {
  const temperature = pickNumber(options?.temperature, process.env.GEMINI_TEMPERATURE);
  const maxOutputTokens = pickInt(options?.maxOutputTokens, process.env.GEMINI_MAX_TOKENS);

  const config: Record<string, number> = {};
  if (temperature !== undefined) config.temperature = temperature;
  if (maxOutputTokens !== undefined) config.maxOutputTokens = maxOutputTokens;
  return Object.keys(config).length ? config : null;
}

function pickNumber(value?: number, envValue?: string) {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (!envValue) return undefined;
  const parsed = Number(envValue);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function pickInt(value?: number, envValue?: string) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (!envValue) return undefined;
  const parsed = Number(envValue);
  return Number.isNaN(parsed) ? undefined : Math.floor(parsed);
}
