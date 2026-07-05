import { NextResponse } from 'next/server';
import { callGeminiText } from '@/lib/ai/gemini';

type RequestBody = {
  prompt: string;
  titleHint?: string;
};

type GeminiResult = {
  title: string;
  excerpt: string;
  content: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const prompt = (body.prompt || '').trim();
    if (!prompt) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const titleHint = body.titleHint ? `タイトルのヒント: ${body.titleHint}` : '';
    const fullPrompt = [
      'あなたは日本語SEOメディアの編集者です。',
      'ASHURA画面上で使う記事下書きを作成してください。',
      '返答はJSONのみ。キーは {"title":"...","excerpt":"...","content":"..."} です。',
      'contentはMarkdownで、見出し、本文、箇条書き、公開前の確認事項を含めてください。',
      '未確認の人物情報、病気、死亡、炎上、結婚などは断定しないでください。',
      '',
      titleHint,
      `依頼内容: ${prompt}`
    ]
      .filter(Boolean)
      .join('\n');

    const { text } = await callGeminiText(apiKey, fullPrompt);

    let parsed: GeminiResult;
    try {
      const jsonPayload = extractJsonPayload(text) ?? text;
      parsed = JSON.parse(jsonPayload) as GeminiResult;
    } catch {
      return NextResponse.json({ error: 'Gemini JSON parse failed', raw: text }, { status: 500 });
    }

    if (!parsed?.title || !parsed?.content) {
      return NextResponse.json({ error: 'Gemini response is invalid' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, draft: parsed });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function extractJsonPayload(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  return null;
}
