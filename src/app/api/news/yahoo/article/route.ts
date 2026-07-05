import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_HOSTS = new Set(['news.yahoo.co.jp', 'headlines.yahoo.co.jp']);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const target = searchParams.get('url');
    if (!target) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return NextResponse.json({ error: 'invalid url' }, { status: 400 });
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return NextResponse.json({ error: 'unsupported host' }, { status: 400 });
    }

    const res = await fetch(parsed.toString(), {
      cache: 'no-store',
      headers: { 'User-Agent': 'ashura-yahoo-fetcher/1.0' }
    });
    const html = await res.text();
    if (!res.ok) {
      return NextResponse.json(
        { error: `HTTP ${res.status} ${res.statusText}`, body: html.slice(0, 200) },
        { status: res.status }
      );
    }

    const title = extractTitle(html);
    const articleHtml = extractArticle(html) || html;
    const paragraphs = extractParagraphs(articleHtml);
    const bodyText = trimToMax(paragraphs.join('\n\n'), 5000);

    return NextResponse.json({
      title,
      body: bodyText,
      source: parsed.hostname,
      truncated: bodyText.length >= 5000
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

function extractTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeEntities(stripTags(m?.[1] ?? '')).trim();
}

function extractArticle(html: string) {
  const m = html.match(/<article[\s\S]*?<\/article>/i);
  if (m?.[0]) return m[0];
  const fallback = html.match(/<div[^>]+class="[^"]*article[^"]*"[\s\S]*?<\/div>/i);
  return fallback?.[0] ?? '';
}

function extractParagraphs(html: string) {
  const matches = Array.from(html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi));
  const textList = matches
    .map((m) => decodeEntities(stripTags(m[1] || '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return textList.length ? textList : [decodeEntities(stripTags(html)).trim()].filter(Boolean);
}

function stripTags(text: string) {
  return String(text ?? '').replace(/<[^>]+>/g, '');
}

function decodeEntities(text: string) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function trimToMax(text: string, max: number) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
}
