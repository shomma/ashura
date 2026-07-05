import { NextResponse } from 'next/server';
import { callGeminiText } from '@/lib/ai/gemini';
import prisma from '@/lib/prisma';
import { requireSingleSite } from '@/lib/single-site';

type RequestBody = {
  message: string;
  context?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  customPrompt?: string;
  siteId?: string;
  promptPresetId?: string;
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const message = (body.message || '').trim();
    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    const context = (body.context || '').trim();
    const historyLimit = Math.max(0, Number(process.env.GEMINI_HISTORY_LIMIT || 12));
    const history = Array.isArray(body.history) ? body.history : [];
    const trimmedHistory = historyLimit > 0 ? history.slice(-historyLimit) : [];
    const historyText = trimmedHistory
      .map((item) => `${item.role === 'assistant' ? 'AI' : 'User'}: ${item.content}`)
      .join('\n');

    const basePrompt = [
      'あなたは長年のSEO経験を持ち、アフィリエイター/マーケターとしても実務経験があるSEOディレクターです。',
      '回答は日本語で、結論→理由→具体アクションの順で簡潔にまとめてください。',
      '不明点は合理的に仮定し、その旨を明記してください。',
      '与えられたコンテキスト（現在ページ＋全ページに蓄積した情報）を最優先で参照してください。'
    ].join('\n');

    const systemPrompt = (process.env.GEMINI_CHAT_SYSTEM_PROMPT || '').trim();
    const customPrompt = (body.customPrompt || '').trim();
    let promptPresetText = '';

    try {
      const site = await requireSingleSite();
      const preset = await prisma.promptPreset.findFirst({
        where: {
          siteId: site.id,
          ...(body.promptPresetId ? { id: body.promptPresetId } : { isDefault: true })
        },
        select: { prompt: true }
      });
      promptPresetText = preset?.prompt?.trim() || '';
    } catch {
      promptPresetText = '';
    }

    const prompt = [
      basePrompt,
      systemPrompt,
      customPrompt,
      promptPresetText,
      context ? `### コンテキスト\n${context}` : '',
      historyText ? `### 会話履歴\n${historyText}` : '',
      `### ユーザーの依頼\n${message}`
    ]
      .filter(Boolean)
      .join('\n\n');

    const { text } = await callGeminiText(apiKey, prompt);
    return NextResponse.json({ ok: true, reply: text });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
