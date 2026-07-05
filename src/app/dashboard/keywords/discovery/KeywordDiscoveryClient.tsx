'use client';

import { useCallback, useEffect, useState } from 'react';
import OperationFlowGuide from '../../../../components/OperationFlowGuide';
import { buildProgramHitResearchQueries } from '@/lib/epg/research-queries';
import type { ProgramHit } from '@/lib/epg/types';

type Props = {
  activeSiteId: string | null;
  prefillStartDate?: string;
  prefillEndDate?: string;
  autoStart?: boolean;
};

type OpportunityItem = {
  term: string;
  trendIndex: number | null;
  estimatedMonthlySearches: number | null;
  googleResultCount: number | null;
  volumeSource?: 'trends' | 'cache' | 'missing';
  competitionSource?: 'google' | 'yahoo' | 'serpapi' | 'cache' | 'estimated' | 'missing';
  competitionStatus?: 'ok' | 'missing' | 'estimated';
  demandScore: number;
  competitionScore: number;
  opportunityScore: number;
  competitionLevel: string;
  note: string;
};

type QueryMeta = {
  term: string;
  patterns: Set<string>;
  hitKeys: Set<string>;
};

type RankingRow = OpportunityItem & {
  patternLabel: string;
  sourceHitCount: number;
};

const KEYWORD_CHUNK_SIZE = 10;
const CHUNK_RETRY_COUNT = 2;
const CHUNK_TIMEOUT_MS = 90_000;

export default function KeywordDiscoveryClient({
  activeSiteId,
  prefillStartDate = '',
  prefillEndDate = '',
  autoStart = false
}: Props) {
  const targetStartDate = prefillStartDate || '';
  const targetEndDate = prefillEndDate || '';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('準備完了');
  const [hitCount, setHitCount] = useState(0);
  const [queryCount, setQueryCount] = useState(0);
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [autoStarted, setAutoStarted] = useState(false);
  const [savedLoaded, setSavedLoaded] = useState(false);

  const runBulkResearch = useCallback(async () => {
    if (!activeSiteId) {
      setError('先に設定状態を確認してください。');
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    setRows([]);
    setHitCount(0);
    setQueryCount(0);
    setProgress('取得済み番組表のキーワードヒットを確認中...');

    try {
      const hitParams = new URLSearchParams({ limit: '50' });
      if (targetStartDate && targetEndDate) {
        hitParams.set('start', targetStartDate);
        hitParams.set('end', targetEndDate);
      }

      const hitRes = await fetch(`/api/epg/hits?${hitParams.toString()}`, {
        cache: 'no-store'
      });
      const hitJson = await hitRes.json();
      if (!hitRes.ok) {
        throw new Error(hitJson?.error || '番組表のキーワードヒット取得に失敗しました。');
      }

      const hits = Array.isArray(hitJson?.items) ? (hitJson.items as ProgramHit[]) : [];
      setHitCount(hits.length);
      if (hits.length === 0) {
        setProgress('取得済み番組表に、登録キーワードのヒットがありません。');
        setMessage('完了: 番組表ヒット 0 件');
        return;
      }

      const queryMetaMap = buildQueryMetaMap(hits);
      const terms = Array.from(queryMetaMap.values()).map((meta) => meta.term);
      setQueryCount(terms.length);
      if (terms.length === 0) {
        setProgress('調査対象キーワードが生成できませんでした。');
        setMessage('完了: 調査キーワード 0 件');
        return;
      }

      const chunks = chunkArray(terms, KEYWORD_CHUNK_SIZE);
      const allItems: OpportunityItem[] = [];
      let processedTerms = 0;

      for (let i = 0; i < chunks.length; i += 1) {
        const currentChunk = chunks[i];
        setProgress(
          `検索結果件数と検索ボリュームを確認中... (${i + 1}/${chunks.length}) / ${processedTerms}/${terms.length}件`
        );

        const chunkResult = await requestOpportunityChunk({
          siteId: activeSiteId,
          keywords: currentChunk,
          months: 1
        });

        allItems.push(...chunkResult.items);
        processedTerms += currentChunk.length;
      }

      const ranking = allItems
        .map((item) => toRankingRow(item, queryMetaMap))
        .sort((a, b) => {
          const aMeasured = hasMeasuredCompetition(a);
          const bMeasured = hasMeasuredCompetition(b);
          if (aMeasured !== bMeasured) {
            return bMeasured ? 1 : -1;
          }
          if (b.opportunityScore !== a.opportunityScore) {
            return b.opportunityScore - a.opportunityScore;
          }
          const bDemand = b.estimatedMonthlySearches || 0;
          const aDemand = a.estimatedMonthlySearches || 0;
          if (bDemand !== aDemand) {
            return bDemand - aDemand;
          }
          return a.term.localeCompare(b.term, 'ja');
        });

      setRows(ranking);
      setProgress('調査が完了しました。');
      setMessage(
        `完了: 番組表ヒット ${hits.length} 件 / 調査キーワード ${terms.length} 件 / ランキング ${ranking.length} 件`
      );
    } catch (err: any) {
      setError(String(err?.message || err));
      setProgress('エラーが発生しました。');
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, targetStartDate, targetEndDate]);

  const loadSavedResearch = useCallback(async () => {
    if (!activeSiteId) return;

    setLoading(true);
    setError(null);
    setMessage(null);
    setProgress('保存済みの需要競合調査結果を読み込み中...');

    try {
      const hitParams = new URLSearchParams({ limit: '50' });
      if (targetStartDate && targetEndDate) {
        hitParams.set('start', targetStartDate);
        hitParams.set('end', targetEndDate);
      }

      const hitRes = await fetch(`/api/epg/hits?${hitParams.toString()}`, {
        cache: 'no-store'
      });
      const hitJson = await hitRes.json();
      if (!hitRes.ok) {
        throw new Error(hitJson?.error || '番組表ヒットの読み込みに失敗しました');
      }

      const hits = Array.isArray(hitJson?.items) ? (hitJson.items as ProgramHit[]) : [];
      setHitCount(hits.length);
      if (hits.length === 0) {
        setRows([]);
        setQueryCount(0);
        setProgress('保存済み番組表ヒットはありません');
        return;
      }

      const queryMetaMap = buildQueryMetaMap(hits);
      const terms = Array.from(queryMetaMap.values()).map((meta) => meta.term);
      setQueryCount(terms.length);
      if (terms.length === 0) {
        setRows([]);
        setProgress('保存済み調査キーワードはありません');
        return;
      }

      const chunks = chunkArray(terms, KEYWORD_CHUNK_SIZE);
      const allItems: OpportunityItem[] = [];

      for (const currentChunk of chunks) {
        const chunkResult = await requestOpportunityChunk({
          siteId: activeSiteId,
          keywords: currentChunk,
          months: 1,
          cacheOnly: true
        });
        allItems.push(...chunkResult.items);
      }

      const ranking = allItems
        .map((item) => toRankingRow(item, queryMetaMap))
        .sort((a, b) => {
          const aMeasured = hasMeasuredCompetition(a);
          const bMeasured = hasMeasuredCompetition(b);
          if (aMeasured !== bMeasured) {
            return bMeasured ? 1 : -1;
          }
          if (b.opportunityScore !== a.opportunityScore) {
            return b.opportunityScore - a.opportunityScore;
          }
          const bDemand = b.estimatedMonthlySearches || 0;
          const aDemand = a.estimatedMonthlySearches || 0;
          if (bDemand !== aDemand) {
            return bDemand - aDemand;
          }
          return a.term.localeCompare(b.term, 'ja');
        });

      setRows(ranking);
      setProgress(
        ranking.length > 0
          ? '保存済みの需要競合調査結果を表示中'
          : '保存済みの需要競合調査結果はありません'
      );
      if (ranking.length > 0) {
        setMessage(`保存済み調査結果 ${ranking.length.toLocaleString()} 件を表示しています`);
      }
    } catch (err: any) {
      setError(String(err?.message || err));
      setProgress('保存済み調査結果の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [activeSiteId, targetStartDate, targetEndDate]);

  useEffect(() => {
    if (!autoStart || autoStarted || !activeSiteId) return;
    setAutoStarted(true);
    void runBulkResearch();
  }, [autoStart, autoStarted, activeSiteId, runBulkResearch]);

  useEffect(() => {
    if (autoStart || savedLoaded || !activeSiteId) return;
    setSavedLoaded(true);
    void loadSavedResearch();
  }, [autoStart, savedLoaded, activeSiteId, loadSavedResearch]);

  return (
    <section className="page-shell" data-page="keywords-discovery-minimal">
      <header className="stack" style={{ gap: 6 }}>
        <p className="helper-text">ASHURA FLOW</p>
        <h1 className="page-title">需要・競合調査</h1>
        <p className="page-subtitle">
          番組表取得で保存したデータに登録キーワードがヒットしているかを確認し、ヒットした番組名・登録キーワードから検索需要と競合件数を調査します。
        </p>
      </header>

      <OperationFlowGuide
        current="keywords-discovery"
        aiBusy={loading}
        aiLabel={loading ? progress : '準備完了'}
        hideStepDetails
        hideStepLinks
      />

      <section className="card stack simple-step-card">
        <h2 style={{ margin: 0 }}>1. 取得済み番組表を調査</h2>
        <p className="helper-text">
          日付はここでは指定しません。番組表取得から進んだ場合はその取得範囲を引き継ぎ、直接開いた場合は直近の取得済み番組表を対象にします。
        </p>
        <button
          className="primary-button operation-big-action simple-primary-button"
          type="button"
          onClick={runBulkResearch}
          disabled={loading || !activeSiteId}
        >
          {loading ? '需要・競合調査中...' : '番組表ヒットを需要・競合調査'}
        </button>
        <p className="pill">{progress}</p>
        {message ? <p className="pill success">{message}</p> : null}
        {error ? <p className="pill danger">{error}</p> : null}
      </section>

      <section className="card stack simple-step-card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>2. 有望度ランキング</h2>
          <span className="pill">
            番組表ヒット {hitCount} 件 / 調査語 {queryCount} 件 / ランキング {rows.length} 件
          </span>
        </div>

        <div className="tile stack">
          <strong>判定の見方</strong>
          <p className="helper-text">
            競合件数は、キーワードごとに SerpAPI（設定時）→ Google → Yahoo の順で検索結果件数を取りに行きます。12時間以内の取得済み結果はキャッシュとして表示し、どれも取れない場合だけ推定になります。
          </p>
          <p className="helper-text">
            検索ボリュームは Google Trends の指数を比較用の月間目安に換算しています。広告APIの厳密な月間検索数ではないため、最終判断では「競合根拠」と合わせて見てください。
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="helper-text">まだ結果がありません。先に番組表を取得し、この画面で需要・競合調査を実行してください。</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>順位</th>
                  <th>キーワード</th>
                  <th>生成元</th>
                  <th>有望度</th>
                  <th>検索ボリューム目安</th>
                  <th>ボリューム根拠</th>
                  <th>競合件数</th>
                  <th>競合根拠</th>
                  <th>競合判定</th>
                  <th>番組表ヒット</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.term}-${index}`}>
                    <td>{index + 1}</td>
                    <td style={{ fontWeight: 700 }}>{row.term}</td>
                    <td>{row.patternLabel}</td>
                    <td>{opportunityScoreLabel(row)}</td>
                    <td>{row.estimatedMonthlySearches?.toLocaleString() ?? '-'}</td>
                    <td>{volumeSourceLabel(row.volumeSource)}</td>
                    <td>{row.googleResultCount?.toLocaleString() ?? '未取得'}</td>
                    <td>{competitionSourceLabel(row)}</td>
                    <td>{competitionLevelLabel(row.competitionLevel)}</td>
                    <td>{row.sourceHitCount}</td>
                    <td>{sourceNote(row)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function normalizeTerm(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeActorQuery(value: string) {
  return normalizeTerm(stripBracketedSegments(toNfkc(value)));
}

function normalizeProgramQuery(value: string) {
  const stripped = stripBracketedSegments(toNfkc(value))
    .replace(/第\s*\d+\s*(話|回)/g, ' ')
    .replace(/[#＃]\s*\d+/g, ' ')
    .replace(/\b(?:ep|episode)\s*\d+\b/gi, ' ')
    .replace(/[!！?？★☆◆◇■□●○◎♪♯♭…・~〜]/g, ' ')
    .replace(/[「」『』【】［］\[\]（）()〈〉《》]/g, ' ');

  const compact = normalizeTerm(stripped);
  return compact.length > 60 ? compact.slice(0, 60).trim() : compact;
}

function stripBracketedSegments(value: string) {
  return value
    .replace(/【[^】]*】/g, ' ')
    .replace(/［[^］]*］/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/「[^」]*」/g, ' ')
    .replace(/『[^』]*』/g, ' ')
    .replace(/〈[^〉]*〉/g, ' ')
    .replace(/《[^》]*》/g, ' ');
}

function toNfkc(value: string) {
  return String(value || '').normalize('NFKC');
}

function buildQueryMetaMap(hits: ProgramHit[]) {
  const map = new Map<string, QueryMeta>();

  for (const hit of hits) {
    const hitKey = `${hit.programId}-${hit.keyword}`;
    const candidates = buildProgramHitResearchQueries(hit);

    for (const candidate of candidates) {
      const normalized = normalizeTerm(candidate.term);
      if (!normalized) continue;
      const existing = map.get(normalized);
      if (existing) {
        existing.patterns.add(candidate.pattern);
        existing.hitKeys.add(hitKey);
        continue;
      }
      map.set(normalized, {
        term: normalized,
        patterns: new Set([candidate.pattern]),
        hitKeys: new Set([hitKey])
      });
    }
  }

  return map;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toRankingRow(item: OpportunityItem, queryMetaMap: Map<string, QueryMeta>): RankingRow {
  const meta = queryMetaMap.get(normalizeTerm(item.term));
  return {
    ...item,
    patternLabel: meta ? Array.from(meta.patterns).join(' / ') : '-',
    sourceHitCount: meta ? meta.hitKeys.size : 0
  };
}

function hasMeasuredCompetition(item: OpportunityItem) {
  return (
    item.competitionStatus === 'ok' &&
    (item.competitionSource === 'serpapi' ||
      item.competitionSource === 'google' ||
      item.competitionSource === 'yahoo' ||
      item.competitionSource === 'cache')
  );
}

function opportunityScoreLabel(item: OpportunityItem) {
  if (hasMeasuredCompetition(item)) {
    return item.opportunityScore;
  }
  if (item.competitionSource === 'estimated' || item.competitionStatus === 'estimated') {
    return '要実測';
  }
  return '未取得';
}

async function requestOpportunityChunk(params: {
  siteId: string;
  keywords: string[];
  months: number;
  cacheOnly?: boolean;
  depth?: number;
}): Promise<{ items: OpportunityItem[] }> {
  const { siteId, keywords, months, cacheOnly = false } = params;
  const depth = params.depth ?? 0;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= CHUNK_RETRY_COUNT; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

    try {
      const response = await fetch('/api/v1/keywords/opportunity-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          siteId,
          keywords,
          months,
          persist: !cacheOnly,
          cacheOnly
        })
      });

      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'キーワード調査に失敗しました。');
      }

      const items = Array.isArray(json?.data?.items) ? (json.data.items as OpportunityItem[]) : [];
      return { items };
    } catch (error: any) {
      lastError = error;
      const timeoutError = error?.name === 'AbortError';
      const canSplit = keywords.length > 1 && depth < 2;

      if (timeoutError && canSplit) {
        const middle = Math.ceil(keywords.length / 2);
        const left = await requestOpportunityChunk({
          siteId,
          keywords: keywords.slice(0, middle),
          months,
          cacheOnly,
          depth: depth + 1
        });
        const right = await requestOpportunityChunk({
          siteId,
          keywords: keywords.slice(middle),
          months,
          cacheOnly,
          depth: depth + 1
        });
        return { items: [...left.items, ...right.items] };
      }

      if (attempt < CHUNK_RETRY_COUNT) {
        await delay(1000 * attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(String((lastError as any)?.message || lastError || 'キーワード調査がタイムアウトしました。'));
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function volumeSourceLabel(source?: OpportunityItem['volumeSource']) {
  if (source === 'trends') return 'Google Trends';
  if (source === 'cache') return 'キャッシュ';
  return '未取得';
}

function competitionSourceLabel(item: OpportunityItem) {
  if (item.competitionSource === 'serpapi') return 'SerpAPI実測';
  if (item.competitionSource === 'google') return 'Google実測';
  if (item.competitionSource === 'yahoo') return 'Yahoo実測';
  if (item.competitionSource === 'cache') return 'キャッシュ';
  if (item.competitionSource === 'estimated') return '推定';
  if (item.competitionStatus === 'missing') return '未取得';
  return '-';
}

function competitionLevelLabel(value: string) {
  if (value === '低' || value.includes('低')) return '低い';
  if (value === '中' || value.includes('中')) return '普通';
  if (value === '高' || value.includes('高')) return '強い';
  if (value.includes('菴')) return '低い';
  if (value.includes('荳ｭ')) return '普通';
  if (value.includes('鬮')) return '強い';
  return value || '不明';
}

function sourceNote(item: OpportunityItem) {
  if (item.competitionSource === 'estimated') {
    return '検索結果件数を取得できなかったため推定';
  }
  if (item.competitionSource === 'cache' || item.volumeSource === 'cache') {
    return '12時間以内の取得済み結果を再利用';
  }
  if (item.competitionSource === 'google' || item.competitionSource === 'yahoo' || item.competitionSource === 'serpapi') {
    return '検索結果件数を取得';
  }
  return '検索結果の根拠が不足';
}
