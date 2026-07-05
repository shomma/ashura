export const BANGUMI_SOURCES = ['td', 'bs', 'cs', 'radio'] as const;

export type BangumiSource = (typeof BANGUMI_SOURCES)[number];

const AREA_BASE: Record<BangumiSource, number> = {
  td: 100000,
  bs: 200000,
  cs: 300000,
  radio: 400000
};

const SOURCE_PREFIX: Record<BangumiSource, string> = {
  td: 'TD',
  bs: 'BS',
  cs: 'CS',
  radio: 'RADIO'
};

export function buildBangumiArea(source: BangumiSource, groupId?: number) {
  return AREA_BASE[source] + (groupId ?? 0);
}

export function parseBangumiArea(area: number) {
  for (const source of BANGUMI_SOURCES) {
    const base = AREA_BASE[source];
    if (area >= base && area < base + 100000) {
      return { source, groupId: area - base };
    }
  }
  return null;
}

export function buildBangumiUrl(source: BangumiSource, dateKeyCompact: string, ggmGroupId?: number) {
  const params = new URLSearchParams({ broad_cast_date: dateKeyCompact });
  if (source === 'td' || source === 'radio') {
    if (ggmGroupId !== undefined) params.set('ggm_group_id', String(ggmGroupId));
  }
  return `https://bangumi.org/epg/${source}?${params.toString()}`;
}

export function buildBangumiHead(source: BangumiSource, dateKeyCompact: string, groupId?: number) {
  const group =
    (source === 'td' || source === 'radio') && groupId ? `-g${groupId}` : '';
  return `bangumi-${source}-${dateKeyCompact}${group}`;
}

export function buildBangumiChannelId(source: BangumiSource, groupId: number | undefined, lineIndex: number) {
  const group = groupId ? `g${groupId}` : 'g0';
  return `bangumi-${source}-${group}-${lineIndex}`;
}

export function formatBangumiChannelName(
  source: BangumiSource,
  name: string,
  groupId?: number
) {
  const group = groupId ? `-${groupId}` : '';
  const prefix = `${SOURCE_PREFIX[source]}${group}`;
  if (!name) return prefix;
  return `${prefix} ${name}`;
}
