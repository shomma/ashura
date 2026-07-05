import prisma from '@/lib/prisma';
import { parseBangumiHtml } from './parser';
import { BangumiSource, buildBangumiUrl } from './bangumi';
import { ParsedProgram, ProgramHit, WatchKeywordDto } from './types';

type IngestResult = {
  dateKey: string;
  programCount: number;
  channelCount: number;
};

const BANGUMI_FETCH_TIMEOUT_MS = 10000;

export async function fetchBangumiHtml(params: {
  source: BangumiSource;
  dateKeyCompact: string;
  ggmGroupId?: number;
}) {
  const { source, dateKeyCompact, ggmGroupId } = params;
  const url = buildBangumiUrl(source, dateKeyCompact, ggmGroupId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BANGUMI_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ashura-bangumi-fetcher/1.0 (+https://example.com)'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`bangumi fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    return { html, url };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`bangumi fetch timeout: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function ingestBangumiHtml(params: {
  html: string;
  area: number;
  url?: string;
  dateKey: string;
  source: BangumiSource;
  groupId?: number;
}): Promise<IngestResult> {
  const { html, area, url, dateKey, source, groupId } = params;
  const parsed = parseBangumiHtml(html, { sourceType: source, groupId, dateKey, sourceUrl: url });
  const date = dateKeyToDate(dateKey);

  await Promise.all(
    parsed.channels.map((c) =>
      prisma.channel.upsert({
        where: { id: c.id },
        update: { name: c.name, area },
        create: {
          id: c.id,
          name: c.name,
          area
        }
      })
    )
  );

  const epg = await prisma.epgHtml.upsert({
    where: { area_date: { area, date } },
    update: {
      head: parsed.head,
      url: url ?? '',
      html,
      size: html.length
    },
    create: {
      area,
      head: parsed.head,
      url: url ?? '',
      html,
      size: html.length,
      date
    }
  });

  await prisma.program.deleteMany({ where: { epgId: epg.id } });

  const programRows = parsed.programs.map((p) => ({
    epgId: epg.id,
    channelId: p.stationId,
    date: dateKeyToDate(p.dateKey),
    start: p.start,
    end: p.end,
    title: p.title || '',
    summary: p.summary || null,
    url: p.url || null,
    key: p.key,
    searchText: toSearchText(p)
  }));

  if (programRows.length) {
    const uniqMap = new Map<string, (typeof programRows)[number]>();
    programRows.forEach((row) => {
      const k = `${row.channelId}|${row.start.toISOString()}|${row.key}`;
      if (!uniqMap.has(k)) uniqMap.set(k, row);
    });
    const uniqRows = Array.from(uniqMap.values());
    for (const chunk of chunkArray(uniqRows, 100)) {
      await prisma.program.deleteMany({
        where: {
          OR: chunk.map((row) => ({
            channelId: row.channelId,
            start: row.start,
            key: row.key
          }))
        }
      });
    }
    await prisma.program.createMany({ data: uniqRows });
  }

  return {
    dateKey,
    programCount: programRows.length,
    channelCount: parsed.channels.length
  };
}

export const DEFAULT_WATCHWORDS = [
  '3時のヒロイン',
  'CANDY TUNE',
  'King & Prince',
  'May J.',
  'Novelbright',
  'Rainy。',
  'SAY MY NAME',
  'SixTONES',
  'timelesz',
  'おじゃす',
  'くっきー!',
  'サンドウィッチマン',
  'ジェシー',
  '塩崎 智弘',
  '加藤 渉',
  '柿原 徹也',
  '梶原 岳人',
  '菊池 風磨',
  '吉村 崇',
  '郷田 ほづみ',
  '近藤 春菜',
  '熊谷 健太郎',
  '後藤 真希',
  '高橋 海人',
  '高橋 茂雄',
  '高嶋 ちさ子',
  '今井 翔馬',
  '佐倉 綾音',
  '佐藤 拓也',
  '坂上 忍',
  '三宅 健太',
  '山下 大輝',
  '山里 亮太',
  '志田 有彩',
  '寺崎 裕香',
  '塾 一久',
  '小西 克幸',
  '松丸 亮吾',
  '城田 優',
  '新井 里美',
  '森下 絵理香',
  '真田 ナオキ',
  '真堂 圭',
  '水森 かおり',
  '晴山 紋音',
  '青山 吉能',
  '石井 マーク',
  '石原 良純',
  '村上 弘明',
  '村川 緋杏',
  '大谷 育江',
  '谷山 紀章',
  '知英',
  '竹中 雄大',
  '中 庸助',
  '中江 真司',
  '中村 大志',
  '朝日 奈央',
  '長嶋 一茂',
  '塚本 信夫',
  '田中 樹',
  '田畑 孝',
  '田邊 幸輔',
  '土岐 隼一',
  '東山 奈央',
  '藤原 夏海',
  '二宮 和也',
  '日比 麻音子',
  '浜田 雅功',
  '風間 俊介',
  '福西 勝也',
  '片平 なぎさ',
  '豊原 江理佳',
  '堀江 瞬',
  '堀田 真由',
  '堀田 眞三',
  '堀内 孝雄',
  '本田 仁美',
  '木村 良平',
  '野上 翔',
  '野性爆弾',
  '与田 祐希',
  '立花 琴未',
  '林原 めぐみ',
  '鈴木 みのり',
  '浪川 大輔'
];

export async function listWatchKeywords(): Promise<WatchKeywordDto[]> {
  const rows = await prisma.watchKeyword.findMany({
    orderBy: { createdAt: 'asc' }
  });
  return rows.map((r) => ({
    id: r.id,
    keyword: r.keyword,
    active: r.active,
    createdAt: r.createdAt.toISOString()
  }));
}

export async function seedWatchKeywords(keywords: string[]) {
  const normalized = Array.from(new Set(keywords.map((k) => k.trim()).filter(Boolean)));
  if (!normalized.length) return;

  for (const keyword of normalized) {
    await prisma.watchKeyword.upsert({
      where: { keyword },
      update: {},
      create: { keyword, active: true }
    });
  }
}

export async function ensureWatchKeyword(keyword: string) {
  const trimmed = keyword.trim();
  if (!trimmed) throw new Error('keyword is empty');
  return prisma.watchKeyword.upsert({
    where: { keyword: trimmed },
    update: { keyword: trimmed, active: true },
    create: { keyword: trimmed, active: true }
  });
}

export async function toggleWatchKeyword(id: string, active: boolean) {
  return prisma.watchKeyword.update({
    where: { id },
    data: { active }
  });
}

export async function deleteWatchKeyword(id: string) {
  return prisma.watchKeyword.delete({
    where: { id }
  });
}

export async function findProgramHits(params: {
  start: Date;
  end: Date;
  limitPerKeyword?: number;
}): Promise<ProgramHit[]> {
  const { start, end, limitPerKeyword = 5 } = params;
  const keywords = await prisma.watchKeyword.findMany({
    where: { active: true },
    orderBy: [{ createdAt: 'asc' }, { keyword: 'asc' }, { id: 'asc' }]
  });
  if (!keywords.length) return [];

  const programs = await prisma.program.findMany({
    where: {
      start: { gte: start },
      end: { lte: end }
    },
    include: { channel: true },
    orderBy: [{ start: 'asc' }, { channelId: 'asc' }, { title: 'asc' }, { id: 'asc' }]
  });

  const hits: ProgramHit[] = [];
  const programHaystack = programs.map((p) => ({
    program: p,
    hay: normalizeForSearch(
      [
        p.title,
        p.summary ?? '',
        p.url ?? '',
        p.searchText ?? '',
        p.channel?.name ?? ''
      ]
        .filter(Boolean)
        .join(' ')
    )
  }));

  for (const kw of keywords) {
    const variants = expandKeywordVariants(kw.keyword);
    const normalizedVariants = variants.map(normalizeForSearch);

    const matches = programHaystack
      .filter(({ hay }) => normalizedVariants.some((v) => hayIncludesVariant(hay, v)))
      .map((entry) => entry.program)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, limitPerKeyword);

    matches.forEach((p) => {
      hits.push({
        keywordId: kw.id,
        keyword: kw.keyword,
        programId: p.id,
        title: p.title,
        summary: p.summary ?? '',
        start: p.start.toISOString(),
        end: p.end.toISOString(),
        channelName: p.channel?.name ?? '',
        dateKey: formatDateKey(p.date),
        url: p.url
      });
    });
  }
  return dedupeProgramHits(hits);
}

function dedupeProgramHits(hits: ProgramHit[]) {
  const map = new Map<string, { hit: ProgramHit; channels: Set<string> }>();
  hits.forEach((hit) => {
    const titleKey = normalizeProgramTitleKey(hit.title);
    const key = `${hit.keywordId}|${hit.start}|${hit.end}|${titleKey}`;
    const existing = map.get(key);
    if (existing) {
      if (hit.channelName) existing.channels.add(hit.channelName);
      return;
    }
    map.set(key, { hit: { ...hit }, channels: new Set(hit.channelName ? [hit.channelName] : []) });
  });
  return Array.from(map.values()).map(({ hit, channels }) => ({
    ...hit,
    channelName: Array.from(channels).filter(Boolean).join(' / ')
  }));
}

function normalizeProgramTitleKey(title: string) {
  const stripped = stripProgramTitle(title || '');
  return normalizeForSearch(stripped).noSpace;
}

function stripProgramTitle(title: string) {
  return title
    .replace(/【[^】]*】/g, '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/〈[^〉]*〉/g, '')
    .replace(/《[^》]*》/g, '')
    .trim();
}

function toSearchText(p: ParsedProgram) {
  return `${p.title || ''} ${p.summary || ''} ${p.stationName || ''} ${p.url || ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function dateKeyToDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function pad2(n: number) {
  return ('0' + n).slice(-2);
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function formatDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function normalizeKeyword(k: string) {
  return k.trim().toLowerCase();
}

type Normalized = {
  raw: string;
  noSpace: string;
  hira: string;
  hiraNoSpace: string;
};

function expandKeywordVariants(keyword: string): string[] {
  const parts = keyword
    .split(/[\r\n,、;／/|]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [keyword];
}

function hayIncludesVariant(hay: Normalized, variant: Normalized) {
  return (
    hay.raw.includes(variant.raw) ||
    hay.noSpace.includes(variant.noSpace) ||
    hay.hira.includes(variant.hira) ||
    hay.hiraNoSpace.includes(variant.hiraNoSpace)
  );
}

function normalizeForSearch(text: string): Normalized {
  const raw = (text || '').normalize('NFKC').toLowerCase();
  const hira = toHiragana(raw);
  const noSpace = raw.replace(/\s+/g, '');
  const hiraNoSpace = hira.replace(/\s+/g, '');
  return { raw, noSpace, hira, hiraNoSpace };
}

function toHiragana(input: string) {
  return input.replace(/[ァ-ン]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
