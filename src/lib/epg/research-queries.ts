import type { ProgramHit } from './types';

export type ProgramHitResearchQuery = {
  term: string;
  pattern: '登録キーワード' | '登録キーワード + 番組名' | '番組名';
  normalizedTerm: string;
};

export function buildProgramHitResearchQueries(hit: ProgramHit): ProgramHitResearchQuery[] {
  const keyword = normalizeActorQuery(hit.keyword);
  const title = normalizeProgramQuery(hit.title);
  const combined = normalizeResearchTerm([keyword, title].filter(Boolean).join(' '));

  return dedupeQueries([
    { term: keyword, pattern: '登録キーワード' },
    { term: combined, pattern: '登録キーワード + 番組名' },
    { term: title, pattern: '番組名' }
  ]);
}

export function buildResearchNormalizedTerm(term: string) {
  return `${normalizeResearchTerm(term).toLowerCase()}::ja:jp`;
}

export function normalizeResearchTerm(value: string) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function dedupeQueries(
  candidates: Array<Pick<ProgramHitResearchQuery, 'term' | 'pattern'>>
): ProgramHitResearchQuery[] {
  const map = new Map<string, ProgramHitResearchQuery>();

  for (const candidate of candidates) {
    const term = normalizeResearchTerm(candidate.term);
    if (!term) continue;
    const normalizedTerm = buildResearchNormalizedTerm(term);
    if (!map.has(normalizedTerm)) {
      map.set(normalizedTerm, {
        term,
        pattern: candidate.pattern,
        normalizedTerm
      });
    }
  }

  return Array.from(map.values());
}

function normalizeActorQuery(value: string) {
  return normalizeResearchTerm(stripBracketedSegments(toNfkc(value)));
}

function normalizeProgramQuery(value: string) {
  const stripped = stripBracketedSegments(toNfkc(value))
    .replace(/第\s*\d+\s*(話|回)/g, ' ')
    .replace(/[#＃]\s*\d+/g, ' ')
    .replace(/\b(?:ep|episode)\s*\d+\b/gi, ' ')
    .replace(/[!！?？・･~〜….,，、。:：;；]/g, ' ')
    .replace(/[「」『』【】\[\]（）()《》〈〉]/g, ' ');

  const compact = normalizeResearchTerm(stripped);
  return compact.length > 60 ? compact.slice(0, 60).trim() : compact;
}

function stripBracketedSegments(value: string) {
  return value
    .replace(/「[^」]*」/g, ' ')
    .replace(/『[^』]*』/g, ' ')
    .replace(/【[^】]*】/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/《[^》]*》/g, ' ')
    .replace(/〈[^〉]*〉/g, ' ');
}

function toNfkc(value: string) {
  return String(value || '').normalize('NFKC');
}
