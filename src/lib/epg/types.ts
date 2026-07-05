export type ChannelInfo = {
  id: string;
  name: string;
};

export type ParsedProgram = {
  stationId: string;
  stationName: string;
  start: Date;
  end: Date;
  title: string;
  summary: string;
  url: string;
  key: string;
  dateKey: string; // YYYY-MM-DD (bucketed to calendar day, 00:00-24:00)
};

export type ParsedEpg = {
  head: string;
  windowStart: Date;
  windowEnd: Date;
  channels: ChannelInfo[];
  programs: ParsedProgram[];
  sourceUrl?: string;
};

export type ProgramHit = {
  keywordId: string;
  keyword: string;
  programId: string;
  title: string;
  summary: string;
  start: string;
  end: string;
  channelName: string;
  dateKey: string;
  url?: string | null;
};

export type WatchKeywordDto = {
  id: string;
  keyword: string;
  active: boolean;
  createdAt: string;
};
