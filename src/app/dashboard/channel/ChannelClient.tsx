'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { BangumiSource } from '@/lib/epg/bangumi';
import { BANGUMI_SOURCES } from '@/lib/epg/bangumi';

type Props = {
  defaultStart: string;
  defaultEnd: string;
  activeSiteId: string | null;
};

type ReadinessCheck = {
  id: string;
  label: string;
  required: boolean;
  ready: boolean;
  detail?: string;
};

type ReadinessPayload = {
  summary: {
    requiredTotal: number;
    requiredReady: number;
    optionalTotal: number;
    optionalReady: number;
    allRequiredReady: boolean;
  };
  checks: ReadinessCheck[];
  pipelineContext: {
    activeWatchKeywords: number;
    upcomingPrograms7d: number;
    pendingRecommendations: number;
    openTasks: number;
  };
};

type SourceState = Record<BangumiSource, boolean>;

type FetchSummary = {
  successCount: number;
  failureCount: number;
};

type ProgramRow = {
  id: string;
  channelName: string;
  title: string;
  summary: string | null;
  start: string;
  end: string;
  url?: string | null;
};

const PROGRAM_PAGE_SIZE = 300;

const SOURCE_LABELS: Record<BangumiSource, string> = {
  td: '地上波',
  bs: 'BS',
  cs: 'CS',
  radio: 'ラジオ'
};

export default function ChannelClient({
  defaultStart,
  defaultEnd,
  activeSiteId
}: Props) {
  const [startDate, setStartDate] = useState(toDateInput(defaultStart));
  const [endDate, setEndDate] = useState(toDateInput(defaultEnd));
  const [sources, setSources] = useState<SourceState>(() =>
    BANGUMI_SOURCES.reduce(
      (acc, source) => ({ ...acc, [source]: true }),
      {} as SourceState
    )
  );
  const [readiness, setReadiness] = useState<ReadinessPayload | null>(null);
  const [readinessError, setReadinessError] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState('待機中');
  const [error, setError] = useState('');
  const [fetchedPrograms, setFetchedPrograms] = useState(0);
  const [fetchSummary, setFetchSummary] = useState<FetchSummary | null>(null);
  const [message, setMessage] = useState('');
  const [programRows, setProgramRows] = useState<ProgramRow[]>([]);
  const [programTotal, setProgramTotal] = useState(0);
  const [programOffset, setProgramOffset] = useState(0);
  const [programLoading, setProgramLoading] = useState(false);

  const selectedSources = useMemo(
    () => BANGUMI_SOURCES.filter((source) => sources[source]),
    [sources]
  );
  const activeWatchwordCount = readiness?.pipelineContext.activeWatchKeywords ?? 0;
  const flowReady = Boolean(activeSiteId && selectedSources.length);
  const discoveryHref = `/dashboard/keywords/discovery?start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}`;

  useEffect(() => {
    loadReadiness();
    // The readiness loader intentionally runs only when the active site changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSiteId]);

  useEffect(() => {
    setProgramRows([]);
    setProgramTotal(0);
    setProgramOffset(0);
    void loadProgramRows(true);
    // Program rows are scoped by the date range; source toggles apply only to the next fetch request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  async function loadReadiness() {
    setReadiness(null);
    setReadinessError('');
    if (!activeSiteId) {
      setReadinessError('内部設定が選択されていません。左側の設定を確認してください。');
      return;
    }
    try {
      const res = await fetch(`/api/v1/settings/api-readiness?siteId=${encodeURIComponent(activeSiteId)}`, {
        cache: 'no-store'
      });
      const json = await readJsonSafe(res);
      if (!res.ok || !json?.ok) {
        throw new Error(apiErrorMessage(json, '準備状態を取得できませんでした。', res.status));
      }
      setReadiness(json.data as ReadinessPayload);
    } catch (readinessFetchError: any) {
      setReadinessError(humanizeError(readinessFetchError));
    }
  }

  async function loadProgramRows(reset = false) {
    if (!startDate || !endDate) return;
    const offset = reset ? 0 : programOffset;
    setProgramLoading(true);
    try {
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
        limit: String(PROGRAM_PAGE_SIZE),
        offset: String(offset)
      });
      const res = await fetch(`/api/epg/programs?${params.toString()}`, {
        cache: 'no-store'
      });
      const json = await readJsonSafe(res);
      if (!res.ok) {
        throw new Error(apiErrorMessage(json, '番組一覧を取得できませんでした。', res.status));
      }
      const rows = Array.isArray(json?.programs) ? (json.programs as ProgramRow[]) : [];
      const total = Number(json?.total || 0);
      setProgramRows((current) => (reset ? rows : [...current, ...rows]));
      setProgramTotal(total);
      if (reset) {
        setFetchedPrograms(total);
      }
      setProgramOffset(offset + rows.length);
    } catch (programError: any) {
      setError(humanizeError(programError));
    } finally {
      setProgramLoading(false);
    }
  }

  async function runCollection() {
    setError('');
    setMessage('');
    if (!activeSiteId) {
      setError('内部設定が未選択です。左側の設定を確認してください。');
      return;
    }
    if (!startDate || !endDate) {
      setError('取得期間を入力してください。');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('終了日は開始日以降にしてください。');
      return;
    }
    if (!selectedSources.length) {
      setError('取得対象の放送種別を1つ以上選んでください。');
      return;
    }

    setLoading(true);
    setPhase('番組表を取得中');
    setFetchedPrograms(0);
    setFetchSummary(null);
    setProgramRows([]);
    setProgramTotal(0);
    setProgramOffset(0);

    try {
      const fetchRes = await fetch('/api/epg/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          ggmGroupId: 42,
          sources: selectedSources
        })
      });
      const fetchJson = await readJsonSafe(fetchRes);
      if (!fetchRes.ok) {
        throw new Error(apiErrorMessage(fetchJson, '番組表の取得に失敗しました。', fetchRes.status));
      }

      const results = Array.isArray(fetchJson?.results) ? fetchJson.results : [];
      const failures = Array.isArray(fetchJson?.failures) ? fetchJson.failures : [];
      const totalPrograms = results.reduce(
        (sum: number, item: { programCount?: number }) => sum + Number(item.programCount || 0),
        0
      );

      setFetchedPrograms(totalPrograms);
      setFetchSummary({
        successCount: results.length,
        failureCount: failures.length
      });
      setPhase('番組一覧を読み込み中');
      await loadProgramRows(true);
      setPhase(failures.length ? '一部取得済み' : '取得済み');
      setMessage(
        `番組表を${totalPrograms.toLocaleString()}件取得しました。下に実際の番組表データを表示しています。`
      );
      await loadReadiness();
    } catch (collectionError: any) {
      setPhase('エラー');
      setError(humanizeError(collectionError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="page-shell channel-planner" data-page="channel-fetcher">
      <header className="page-header channel-planner-header">
        <div className="stack" style={{ gap: 6 }}>
          <p className="helper-text">ASHURA FLOW</p>
          <h1 className="page-title">番組表取得</h1>
          <p className="page-subtitle">
            番組表データを取得して保存し、取得した番組をその場で一覧表示します。登録キーワードのヒット確認と需要・競合評価は次の工程で行います。
          </p>
        </div>
        <div className="channel-site-panel">
          <span className={`pill ${flowReady ? 'success' : 'warning'}`}>
            {flowReady ? '取得準備OK' : '設定確認'}
          </span>
        </div>
      </header>

      <section className="channel-summary-grid">
        <MetricTile label="API準備" value={readiness ? `${readiness.summary.requiredReady}/${readiness.summary.requiredTotal}` : '-'} />
        <MetricTile label="登録キーワード" value={activeWatchwordCount.toLocaleString()} />
        <MetricTile label="取得番組" value={fetchedPrograms.toLocaleString()} />
        <MetricTile label="状態" value={phase} />
      </section>

      {message ? <p className="pill success">{message}</p> : null}
      {error ? <p className="pill danger">{error}</p> : null}

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 className="channel-section-title">準備状態</h2>
            <p className="helper-text">
              {readinessError || (readiness?.summary.allRequiredReady ? '必要な設定は揃っています。' : '不足している設定があります。')}
            </p>
          </div>
          <button className="secondary-button" type="button" onClick={loadReadiness} disabled={!activeSiteId}>
            再確認
          </button>
        </div>
        <div className="readiness-grid">
          {(readiness?.checks || []).map((check) => (
            <article key={check.id} className={`readiness-item ${check.ready ? 'ready' : 'missing'}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{check.label}</strong>
                <span className={`pill ${check.ready ? 'success' : check.required ? 'danger' : 'warning'}`}>
                  {check.ready ? 'OK' : check.required ? '必須' : '任意'}
                </span>
              </div>
              {check.detail ? <p className="helper-text">{check.detail}</p> : null}
            </article>
          ))}
          {!readiness?.checks?.length ? (
            <div className="tile">
              <p className="helper-text">{readinessError || '準備状態を読み込み中です。'}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card stack">
        <div>
          <h2 className="channel-section-title">番組表取得</h2>
          <p className="helper-text">現在の状態: {phase}</p>
        </div>
        <div className="field-row">
          <label>
            開始日
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            終了日
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <div className="source-toggle-grid">
          {BANGUMI_SOURCES.map((source) => (
            <label key={source} className={`source-toggle ${sources[source] ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={sources[source]}
                onChange={(event) =>
                  setSources((current) => ({ ...current, [source]: event.target.checked }))
                }
              />
              <span>{SOURCE_LABELS[source]}</span>
            </label>
          ))}
        </div>
        <button
          className="primary-button operation-big-action"
          type="button"
          onClick={runCollection}
          disabled={loading || !activeSiteId || !selectedSources.length}
        >
          {loading ? '番組表を取得中...' : '番組表を取得する'}
        </button>
        <div className="channel-run-stats">
          <MetricTile label="取得番組" value={fetchedPrograms.toLocaleString()} />
          <MetricTile label="取得成功" value={(fetchSummary?.successCount ?? 0).toLocaleString()} />
          <MetricTile label="取得失敗" value={(fetchSummary?.failureCount ?? 0).toLocaleString()} />
        </div>
      </section>

      <section className="card stack">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h2 className="channel-section-title">取得した番組表データ</h2>
            <p className="helper-text">
              取得後、実際に保存された番組を放送時刻順に表示します。件数が多いので300件ずつ追加表示します。
            </p>
          </div>
          <span className="pill">
            表示 {programRows.length.toLocaleString()} / 全 {programTotal.toLocaleString()} 件
          </span>
        </div>

        {programRows.length ? (
          <>
            <div className="table-wrapper program-table-wrapper">
              <table className="table program-table">
                <thead>
                  <tr>
                    <th>放送日時</th>
                    <th>チャンネル</th>
                    <th>番組名</th>
                    <th>概要</th>
                  </tr>
                </thead>
                <tbody>
                  {programRows.map((program) => (
                    <tr key={program.id}>
                      <td>{formatProgramRange(program.start, program.end)}</td>
                      <td>{program.channelName || '-'}</td>
                      <td className="program-title-cell">
                        {program.url ? (
                          <a href={program.url} target="_blank" rel="noreferrer">
                            {program.title || '-'}
                          </a>
                        ) : (
                          program.title || '-'
                        )}
                      </td>
                      <td className="program-summary-cell">{program.summary || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row plan-actions">
              {programRows.length < programTotal ? (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => loadProgramRows(false)}
                  disabled={programLoading}
                >
                  {programLoading ? '読み込み中...' : `さらに${PROGRAM_PAGE_SIZE}件表示`}
                </button>
              ) : null}
              <Link className="primary-button" href={discoveryHref}>
                この番組表で需要・競合調査へ進む
              </Link>
            </div>
          </>
        ) : (
          <div className="tile">
            <p className="helper-text">
              まだ表示できる番組表データがありません。上の「番組表を取得する」を実行すると、ここに番組一覧が表示されます。
            </p>
          </div>
        )}
      </section>
    </section>
  );
}

async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiErrorMessage(json: any, fallback: string, status?: number) {
  const message = json?.error?.message || json?.error || json?.message || fallback;
  return humanizeError(status ? `${message} HTTP ${status}` : message);
}

function humanizeError(error: unknown) {
  const message = String((error as any)?.message || error || '');
  if (/DATABASE_URL|Environment variable not found|PrismaClientInitialization|Invalid `prisma/i.test(message)) {
    return 'データベース接続が未設定です。Renderの環境変数、またはローカルのDATABASE_URLを確認してください。';
  }
  if (/Unexpected end of JSON input|Failed to execute 'json' on 'Response'/i.test(message)) {
    return 'APIから空の応答が返りました。ページを再読み込みして、解消しない場合はサーバーログを確認してください。';
  }
  if (/siteId is required|site not found/i.test(message)) {
    return '内部設定を読み込めませんでした。設定状態を確認してください。';
  }
  if (/fetch failed|network|ECONNRESET|ETIMEDOUT|timeout/i.test(message)) {
    return '外部サービスとの通信に失敗しました。ネットワーク状態を確認し、少し時間を置いて再実行してください。';
  }
  return message || '処理に失敗しました。入力内容と接続設定を確認して再実行してください。';
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

function formatProgramRange(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startIso} - ${endIso}`;
  }
  const startText = start.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const endText = end.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  return `${startText} - ${endText}`;
}
