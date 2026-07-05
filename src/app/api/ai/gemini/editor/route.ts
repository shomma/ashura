import { NextResponse } from 'next/server';
import { callGeminiText } from '@/lib/ai/gemini';
import prisma from '@/lib/prisma';
import { requireSingleSite } from '@/lib/single-site';

type EditorMode = 'outline' | 'rewrite' | 'linking';

type EditorBody = {
  mode?: EditorMode;
  title?: string;
  excerpt?: string;
  content?: string;
  context?: string;
  requirement?: string;
  siteId?: string;
  promptPresetId?: string;
};

type EditorResult = {
  mode: EditorMode;
  summary: string;
  draft?: {
    title?: string;
    excerpt?: string;
    content?: string;
  };
  outline?: string[];
  diffSuggestion?: string;
  linkingSuggestions?: Array<{
    anchor: string;
    target: string;
    reason: string;
  }>;
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EditorBody;
    const mode = body.mode;
    if (!mode || !['outline', 'rewrite', 'linking'].includes(mode)) {
      return NextResponse.json({ error: 'mode is invalid' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    let presetPrompt = '';
    try {
      const site = await requireSingleSite();
      const preset = await prisma.promptPreset.findFirst({
        where: {
          siteId: site.id,
          ...(body.promptPresetId ? { id: body.promptPresetId } : { isDefault: true })
        },
        select: { prompt: true }
      });
      presetPrompt = preset?.prompt?.trim() || '';
    } catch {
      presetPrompt = '';
    }

    const prompt = buildPrompt({
      mode,
      title: body.title || '',
      excerpt: body.excerpt || '',
      content: body.content || '',
      context: body.context || '',
      requirement: body.requirement || '',
      presetPrompt
    });

    const { text, model } = await callGeminiText(apiKey, prompt);
    const parsed = parseJson<EditorResult>(text);
    if (!parsed?.mode || !parsed?.summary) {
      return NextResponse.json(
        { error: 'Gemini JSON parse failed', raw: text, model },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: parsed,
      model
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function buildPrompt(params: {
  mode: EditorMode;
  title: string;
  excerpt: string;
  content: string;
  context: string;
  requirement: string;
  presetPrompt: string;
}) {
  const instruction =
    params.mode === 'outline'
      ? [
          'あなたはSEO編集者です。',
          '記事のアウトラインを提案し、必要ならドラフトを補強してください。',
          'JSON形式: {"mode":"outline","summary":"...","outline":["..."],"draft":{"title":"...","excerpt":"...","content":"..."}}'
        ]
      : params.mode === 'rewrite'
      ? [
          'あなたはSEO編集者です。',
          '既存記事をリライトし、改善点の説明を添えてください。',
          'JSON形式: {"mode":"rewrite","summary":"...","diffSuggestion":"...","draft":{"title":"...","excerpt":"...","content":"..."}}'
        ]
      : [
          'あなたはSEO編集者です。',
          '内部リンク候補を提案し、必要なら本文へ反映してください。',
          'JSON形式: {"mode":"linking","summary":"...","linkingSuggestions":[{"anchor":"...","target":"...","reason":"..."}],"draft":{"title":"...","excerpt":"...","content":"..."}}'
        ];

  return [
    ...instruction,
    '必ずJSONのみを返してください。',
    params.presetPrompt ? `### Prompt Preset\n${params.presetPrompt}` : '',
    params.context ? `### コンテキスト\n${params.context}` : '',
    params.requirement ? `### 追加要件\n${params.requirement}` : '',
    `### 現在タイトル\n${params.title}`,
    `### 現在抜粋\n${params.excerpt}`,
    `### 現在本文\n${params.content || '(本文なし)'}`,
    `### 実行モード\n${params.mode}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

function parseJson<T>(text: string): T | null {
  const payload = extractJson(text);
  try {
    return JSON.parse(payload) as T;
  } catch {
    return null;
  }
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1).trim();
  return text.trim();
}
