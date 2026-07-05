import { ChannelInfo, ParsedEpg, ParsedProgram } from './types';
import {
  BangumiSource,
  buildBangumiChannelId,
  buildBangumiHead,
  formatBangumiChannelName
} from './bangumi';

type ParseOptions = {
  sourceType: BangumiSource;
  groupId?: number;
  dateKey: string;
  sourceUrl?: string;
};

export function parseBangumiHtml(html: string, opts: ParseOptions): ParsedEpg {
  const channelNames = extractChannelNames(html);
  const channelsByIndex = new Map<number, ChannelInfo>();
  channelNames.forEach((name, idx) => {
    const lineIndex = idx + 1;
    channelsByIndex.set(lineIndex, {
      id: buildBangumiChannelId(opts.sourceType, opts.groupId, lineIndex),
      name: formatBangumiChannelName(opts.sourceType, name, opts.groupId)
    });
  });

  const programs: ParsedProgram[] = [];
  let windowStart: Date | null = null;
  let windowEnd: Date | null = null;

  const lineRe = /<ul id="program_line_(\d+)">([\s\S]*?)<\/ul>/g;
  let lineMatch;
  while ((lineMatch = lineRe.exec(html)) !== null) {
    const lineIndex = Number(lineMatch[1]);
    const block = lineMatch[2];
    const fallbackName = formatBangumiChannelName(opts.sourceType, `CH-${lineIndex}`, opts.groupId);
    const channel =
      channelsByIndex.get(lineIndex) ??
      ({
        id: buildBangumiChannelId(opts.sourceType, opts.groupId, lineIndex),
        name: fallbackName
      } as ChannelInfo);

    if (!channelsByIndex.has(lineIndex)) {
      channelsByIndex.set(lineIndex, channel);
    }

    const itemRe = /<li[^>]*\ss="(\d{12})"[^>]*\se="(\d{12})"[^>]*>([\s\S]*?)<\/li>/g;
    let itemMatch;
    while ((itemMatch = itemRe.exec(block)) !== null) {
      const full = itemMatch[0];
      const startKey = itemMatch[1];
      const endKey = itemMatch[2];
      const inner = itemMatch[3];
      const pid = matchAttr(full, 'pid');
      const title = cleanText(matchOne(inner, /<p class="program_title">([\s\S]*?)<\/p>/i) || '');
      const summary = cleanText(matchOne(inner, /<p class="program_detail">([\s\S]*?)<\/p>/i) || '');
      const href = matchOne(inner, /href="([^"]+)"/i) || '';
      const url = normalizeUrl(href);
      const start = toDateYYYYMMDDHHmm(startKey);
      const end = toDateYYYYMMDDHHmm(endKey);
      if (!start || !end) continue;
      const startTime = start.getTime();
      const endTime = end.getTime();
      if (endTime <= startTime) continue;

      if (!windowStart || startTime < windowStart.getTime()) {
        windowStart = start;
      }
      if (!windowEnd || endTime > windowEnd.getTime()) {
        windowEnd = end;
      }

      const key = pid && pid !== '-1' ? pid : `${startKey}-${title}`;
      const segments = splitByDay(start, end);
      segments.forEach((segment) => {
        programs.push({
          stationId: channel.id,
          stationName: channel.name,
          start: segment.start,
          end: segment.end,
          title,
          summary,
          url,
          key,
          dateKey: segment.dateKey
        });
      });
    }
  }

  const channels = Array.from(channelsByIndex.values());
  const compact = opts.dateKey.replace(/-/g, '');
  const head = buildBangumiHead(opts.sourceType, compact, opts.groupId);
  const fallbackStart = windowStart ?? new Date(`${opts.dateKey}T00:00:00`);
  const fallbackEnd = windowEnd ?? new Date(fallbackStart.getTime() + 24 * 60 * 60 * 1000);

  return {
    head,
    windowStart: fallbackStart,
    windowEnd: fallbackEnd,
    channels,
    programs,
    sourceUrl: opts.sourceUrl
  };
}

function matchOne(text: string, re: RegExp) {
  const m = (text || '').match(re);
  return m ? m[1] : null;
}

function cleanText(s: string) {
  return decodeHtml(String(s || '').replace(/<\s*wbr\s*\/?>/gi, '').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(s: string) {
  return s
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractChannelNames(html: string) {
  const names: string[] = [];
  const re = /<li class="js_channel[^"]*">([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    names.push(cleanText(m[1]));
  }
  while (names.length && !names[0]) names.shift();
  return names;
}

function splitByDay(start: Date, end: Date) {
  const segments: Array<{ start: Date; end: Date; dateKey: string }> = [];
  let cursor = new Date(start.getTime());
  while (cursor < end) {
    const dayEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const segEnd = end < dayEnd ? end : dayEnd;
    if (segEnd <= cursor) break;
    segments.push({
      start: new Date(cursor.getTime()),
      end: new Date(segEnd.getTime()),
      dateKey: ymd(cursor)
    });
    cursor = new Date(segEnd.getTime());
  }
  return segments;
}

function normalizeUrl(href: string) {
  if (!href) return '';
  if (href.startsWith('http://') || href.startsWith('https://')) return href;
  if (href.startsWith('//')) return `https:${href}`;
  if (href.startsWith('/')) return `https://bangumi.org${href}`;
  return href;
}

function matchAttr(tag: string, attr: string) {
  const re = new RegExp(`${attr}\\s*=\\s*([\"'])(.*?)\\1`, 'i');
  const m = tag.match(re);
  return m ? m[2] : null;
}

function ymd(d: Date) {
  return [d.getFullYear(), pad2(d.getMonth() + 1), pad2(d.getDate())].join('-');
}

function pad2(n: number) {
  return ('0' + n).slice(-2);
}

function toDateYYYYMMDDHHmm(s: string) {
  if (!s || s.length < 12) return null;
  return new Date(
    Number(s.slice(0, 4)),
    Number(s.slice(4, 6)) - 1,
    Number(s.slice(6, 8)),
    Number(s.slice(8, 10)),
    Number(s.slice(10, 12)),
    0,
    0
  );
}
