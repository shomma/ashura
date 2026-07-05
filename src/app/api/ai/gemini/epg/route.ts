import { NextResponse } from 'next/server';
import { callGeminiText } from '@/lib/ai/gemini';
import type { ProgramHit } from '@/lib/epg/types';

type EpgPlanCandidate = {
  id?: string;
  query?: string;
  score?: number;
  reasons?: string[];
  suggestions?: string[];
  demand?: {
    trendIndex?: number | null;
    estimatedMonthlySearches?: number | null;
  };
  competition?: {
    resultCount?: number | null;
    source?: string;
  };
  hit: ProgramHit;
};

type PlanResult = {
  articleIdea: string;
  aim: string;
  titleIdeas: string[];
  outline: Array<{ heading: string; points: string[] }>;
  keywords: string[];
  markdown: string;
  promptForReuse: string;
};

type EpgRequest = {
  action: 'plan';
  siteId?: string;
  candidate: EpgPlanCandidate;
};

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as EpgRequest;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    if (body.action !== 'plan') {
      return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }

    if (!body.candidate?.hit) {
      return NextResponse.json({ error: 'candidate.hit is required' }, { status: 400 });
    }

    const prompt = buildPlanningPrompt(body.candidate);
    const { text, model } = await callGeminiText(apiKey, prompt, {
      temperature: 0.35,
      maxOutputTokens: 8192
    });
    const parsed = parseJson<Partial<PlanResult>>(text);
    const plan = normalizePlanResult(parsed || {}, body.candidate, prompt);

    return NextResponse.json({
      ok: true,
      plan,
      model,
      warning: parsed ? undefined : 'Gemini response was not valid JSON; fallback plan was generated.'
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function buildPlanningPrompt(candidate: EpgPlanCandidate) {
  return [
    'あなたは日本語SEOメディアの編集者です。',
    '番組表から検出した出演者、番組、話題語を、検索需要と競合状況を踏まえた記事下書きに変換してください。',
    '目的は、ASHURA画面上で使う記事タイトル案、構成案、本文下書き、Markdownを作ることです。',
    '',
    '制約:',
    '- 返答はJSONのみ。説明文、Markdownフェンス、余計な前置きは禁止。',
    '- titleIdeasは必ず10件。検索意図が違う切り口を混ぜる。',
    '- outlineは5〜7見出し。各見出しにpointsを2〜4件入れる。',
    '- markdownは日本語Markdown。番組情報、狙い、見出し案、本文下書き、注意点を含める。',
    '- 本文下書きは、検索者が知りたい事実、確認方法、未確認情報の扱いが分かるようにする。',
    '- 再放送、映画、名作劇場、総集編、通販番組など新規記事価値が低い可能性があるものは注意点として明記する。',
    '- 未確認のプロフィール、出演事実、年齢、結婚、病気、死亡、炎上情報を断定しない。',
    '- 人名や番組名の漢字表記ゆれは、本文内で確認タスクとして残す。',
    '',
    '返すJSON形式:',
    '{"articleIdea":"...","aim":"...","titleIdeas":["..."],"outline":[{"heading":"...","points":["..."]}],"keywords":["..."],"markdown":"..."}',
    '',
    '候補データ:',
    JSON.stringify(
      {
        id: candidate.id,
        query: candidate.query,
        score: candidate.score,
        reasons: candidate.reasons,
        suggestions: candidate.suggestions,
        demand: candidate.demand,
        competition: candidate.competition,
        hit: candidate.hit
      },
      null,
      2
    ),
    '',
    '番組情報:',
    formatHit(candidate.hit)
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizePlanResult(
  parsed: Partial<PlanResult>,
  candidate: EpgPlanCandidate,
  promptForReuse: string
): PlanResult {
  const fallbackTitle = `${candidate.hit.keyword} ${candidate.hit.title}の出演情報と見どころ`;
  const titleIdeas = normalizeStringList(parsed.titleIdeas, 10, fallbackTitle);
  const outline = normalizeOutline(parsed.outline);
  const keywords = normalizeStringList(parsed.keywords, 12, candidate.hit.keyword);
  const articleIdea =
    normalizeOneLine(parsed.articleIdea) ||
    `${candidate.hit.keyword}が出演する番組情報を起点に、検索需要が出やすい人物、番組、話題を整理する。`;
  const aim =
    normalizeOneLine(parsed.aim) ||
    '放送前後に検索する読者へ、番組情報、出演者、確認ポイント、関連記事化の判断材料を短時間で提示する。';
  const markdown =
    typeof parsed.markdown === 'string' && parsed.markdown.trim()
      ? parsed.markdown.trim()
      : buildFallbackMarkdown(candidate, {
          articleIdea,
          aim,
          titleIdeas,
          outline,
          keywords
        });

  return {
    articleIdea,
    aim,
    titleIdeas,
    outline,
    keywords,
    markdown,
    promptForReuse
  };
}

function normalizeStringList(value: unknown, limit: number, fallback: string) {
  const items = Array.isArray(value)
    ? value.map((item) => normalizeOneLine(item)).filter(Boolean)
    : [];
  let index = 1;
  while (items.length < limit) {
    items.push(`${fallback}・記事案${index}`);
    index += 1;
  }
  return Array.from(new Set(items)).slice(0, limit);
}

function normalizeOutline(value: unknown): PlanResult['outline'] {
  const items = Array.isArray(value)
    ? value
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const heading = normalizeOneLine(record.heading);
          const points = Array.isArray(record.points)
            ? record.points.map((point) => normalizeOneLine(point)).filter(Boolean).slice(0, 4)
            : [];
          if (!heading) return null;
          return {
            heading,
            points: points.length ? points : ['番組表情報と事実確認をもとに追記する。']
          };
        })
        .filter((item): item is { heading: string; points: string[] } => Boolean(item))
    : [];

  if (items.length) return items.slice(0, 7);
  return [
    {
      heading: '番組表から見える注目ポイント',
      points: ['放送日時、局名、番組概要を確認する。', '検索されそうな人物名や話題語を整理する。']
    },
    {
      heading: '出演者とキーワードの検索意図',
      points: ['読者が調べる理由を人物名と番組名の両面で整理する。', '関連する検索語を本文内に自然に入れる。']
    },
    {
      heading: '需要と競合の見立て',
      points: ['推定需要と競合件数から記事化優先度を判断する。', '強い競合が多い場合は切り口を狭める。']
    },
    {
      heading: '本文で確認すべき事実',
      points: ['プロフィール、出演履歴、表記ゆれを公開前に確認する。', '未確認情報は断定せず注意書きにする。']
    },
    {
      heading: '記事下書きの公開前チェック',
      points: ['再放送や総集編の場合は新規記事価値を再評価する。', 'タイトルと見出しが検索意図に合っているか確認する。']
    }
  ];
}

function normalizeOneLine(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function buildFallbackMarkdown(
  candidate: EpgPlanCandidate,
  input: Pick<PlanResult, 'articleIdea' | 'aim' | 'titleIdeas' | 'outline' | 'keywords'>
) {
  return [
    `# ${input.titleIdeas[0]}`,
    '',
    '## 記事下書きの狙い',
    input.articleIdea,
    '',
    '## 読者に届ける内容',
    input.aim,
    '',
    '## 番組情報',
    `- キーワード: ${candidate.hit.keyword}`,
    `- 番組タイトル: ${candidate.hit.title}`,
    `- 放送日時: ${formatDateTime(candidate.hit.start)} - ${formatTime(candidate.hit.end)}`,
    `- チャンネル: ${candidate.hit.channelName}`,
    candidate.hit.summary ? `- 概要: ${candidate.hit.summary}` : '',
    candidate.hit.url ? `- 番組URL: ${candidate.hit.url}` : '',
    '',
    '## タイトル案',
    ...input.titleIdeas.map((title, index) => `${index + 1}. ${title}`),
    '',
    '## 構成案',
    ...input.outline.flatMap((item) => [
      `### ${item.heading}`,
      ...item.points.map((point) => `- ${point}`)
    ]),
    '',
    '## 本文下書き',
    `${candidate.hit.keyword}さん、または関連する話題は、${candidate.hit.title}の放送前後に検索需要が高まる可能性があります。この記事では番組表で確認できる情報をもとに、放送日時、出演者、見どころ、公開前に確認すべき事実を整理します。`,
    '',
    '公開前には、出演者名の表記、プロフィール、番組公式情報、再放送かどうかを確認します。未確認の噂や個人情報は断定せず、確認できた事実だけで本文を組み立てます。',
    '',
    '## 主なキーワード',
    input.keywords.join(' / '),
    '',
    '## 注意点',
    '- 再放送、映画、総集編、通販番組の場合は新規記事価値を下げて判断する。',
    '- 未確認の人物情報は断定せず、公開前に一次情報で確認する。'
  ]
    .filter(Boolean)
    .join('\n');
}

function formatHit(hit: ProgramHit) {
  return [
    `キーワード: ${hit.keyword}`,
    `番組タイトル: ${hit.title}`,
    hit.summary ? `概要: ${hit.summary}` : '',
    `放送時間: ${formatDateTime(hit.start)} - ${formatTime(hit.end)}`,
    `チャンネル: ${hit.channelName}`,
    hit.url ? `番組URL: ${hit.url}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mi}`;
}

function parseJson<T>(text: string): T | null {
  const jsonText = extractJson(text);
  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}
