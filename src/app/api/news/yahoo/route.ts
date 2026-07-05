import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

type NewsItem = {
  title: string;
  link: string;
  pubDate?: string;
};

export const runtime = 'nodejs';

const FEED_CANDIDATES = [
  // Yahoo!ニュース エンタメカテゴリ
  'https://news.yahoo.co.jp/rss/categories/entertainment.xml',
  // バックアップ: トピック系エンタメ
  'https://news.yahoo.co.jp/rss/topics/ent.xml',
  // バックアップ: トピック総合
  'https://news.yahoo.co.jp/rss/topics/top-picks.xml'
];

export async function GET() {
  try {
    const { xml, source } = await fetchFirstFeed();
    const items = parseRss(xml);

    const keywords = await prisma.watchKeyword.findMany({ where: { active: true } });
    const normalizedKw = keywords.map((k) => ({
      raw: k.keyword,
      norm: normalize(k.keyword)
    }));

    const matches = items.map((item) => {
      const hay = normalize(`${item.title} ${item.link}`);
      const hitKeywords = normalizedKw
        .filter((k) => hay.includes(k.norm))
        .map((k) => k.raw)
        .slice(0, 5);
      return { ...item, keywords: hitKeywords };
    });

    return NextResponse.json({
      items: matches,
      keywordCount: normalizedKw.length,
      fetchedAt: new Date().toISOString(),
      source
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}

async function fetchFirstFeed() {
  let lastError: string | null = null;
  for (const url of FEED_CANDIDATES) {
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'User-Agent': 'ashura-news-fetcher/1.0 (+https://example.com)' }
      });
      if (!res.ok) {
        lastError = `HTTP ${res.status} ${res.statusText} for ${url}`;
        continue;
      }
      const xml = await res.text();
      if (!xml.trim()) {
        lastError = `empty response from ${url}`;
        continue;
      }
      return { xml, source: url };
    } catch (e: any) {
      lastError = `fetch failed for ${url}: ${String(e?.message || e)}`;
    }
  }
  throw new Error(lastError || 'failed to fetch any feed');
}

function parseRss(xml: string): NewsItem[] {
  const blocks = Array.from(xml.matchAll(/<item>[\s\S]*?<\/item>/g)).map((m) => m[0]);
  return blocks.map((block) => ({
    title: extractTag(block, 'title'),
    link: extractTag(block, 'link'),
    pubDate: extractTag(block, 'pubDate')
  }));
}

function extractTag(block: string, tag: string) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(regex);
  const raw = m?.[1] ?? '';
  return raw.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
}

function normalize(text: string) {
  return (text || '').toLowerCase().replace(/\s+/g, '');
}
