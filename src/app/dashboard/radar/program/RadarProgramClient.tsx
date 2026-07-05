'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type RadarItem = {
  id: string;
  severity: string;
  score: number;
  title: string;
  summary: string | null;
  observedAt: string;
  actionLabel: string;
  actionHref: string;
};

type ApiReadinessCheck = {
  id: string;
  label: string;
  required: boolean;
  ready: boolean;
  detail?: string;
};

type Props = {
  activeSiteId: string | null;
};

const DEMO_ITEMS: RadarItem[] = [
  {
    id: 'radar-program-demo',
    severity: 'info',
    score: 0,
    title: 'デモ番組シグナル',
    summary: 'サイト未選択のため、番組表起点のデモ行を表示しています。',
    observedAt: new Date().toISOString(),
    actionLabel: '改善機会を見る',
    actionHref: '/dashboard/opportunities?source=radar-program-demo'
  }
];

export default function RadarProgramClient({ activeSiteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<RadarItem[]>([]);
  const [missingApis, setMissingApis] = useState<ApiReadinessCheck[]>([]);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [runBusy, setRunBusy] = useState(false);
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSiteId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/dashboard/radar/program?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || '番組表レーダーの取得に失敗しました');
        }
        if (!cancelled) setItems((json.data?.items || []) as RadarItem[]);
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e?.message || e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSiteId]);

  useEffect(() => {
    if (!activeSiteId) {
      setMissingApis([]);
      setReadinessError(null);
      return;
    }

    let cancelled = false;
    setReadinessError(null);

    fetch(`/api/v1/settings/api-readiness?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || '連携準備状況の取得に失敗しました');
        }
        const checks = (json.data?.checks || []) as ApiReadinessCheck[];
        if (!cancelled) {
          setMissingApis(checks.filter((item) => item.required && !item.ready));
        }
      })
      .catch((e: any) => {
        if (!cancelled) setReadinessError(String(e?.message || e));
      });

    return () => {
      cancelled = true;
    };
  }, [activeSiteId]);

  async function runProgramTaskCycle() {
    if (!activeSiteId) return;

    setRunBusy(true);
    setRunMessage(null);
    setRunError(null);

    try {
      const res = await fetch('/api/v1/jobs/full-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSiteId,
          collectEpg: true,
          epgDays: 1,
          autoCreateTasks: true,
          maxAutoTasks: 12,
          minTaskPriority: 55
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || '番組表起点の一括実行に失敗しました');
      }

      const collectStatus = String(json?.data?.summary?.collect?.status || 'unknown');
      const syncStatus = String(json?.data?.summary?.sync?.status || 'unknown');
      const generateStatus = String(json?.data?.summary?.generate?.status || 'unknown');
      const taskifyStatus = String(json?.data?.summary?.taskify?.status || 'unknown');
      const taskifyCount = Number(json?.data?.summary?.taskify?.summary?.processed || 0);

      setRunMessage(
        `一括実行完了: 収集=${collectStatus} / 同期=${syncStatus} / 提案=${generateStatus} / タスク化=${taskifyStatus}(${taskifyCount}件)`
      );

      const radarRes = await fetch(`/api/v1/dashboard/radar/program?siteId=${encodeURIComponent(activeSiteId)}`);
      const radarJson = await radarRes.json();
      if (radarRes.ok && radarJson?.ok) {
        setItems((radarJson.data?.items || []) as RadarItem[]);
      }
    } catch (e: any) {
      setRunError(String(e?.message || e));
    } finally {
      setRunBusy(false);
    }
  }

  const rows = activeSiteId ? items : DEMO_ITEMS;

  return (
    <section className="panel stack" data-page="radar-program">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div className="stack" style={{ gap: 4 }}>
          <h1>番組表レーダー</h1>
          <p className="helper-text">番組表取得から提案生成、タスク化までを一括実行できます。</p>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="primary-button"
            onClick={runProgramTaskCycle}
            disabled={!activeSiteId || runBusy}
          >
            {runBusy ? '実行中...' : '番組表→タスク化を実行'}
          </button>
          <Link className="secondary-button" href="/dashboard/tasks/board">
            タスクボードへ
          </Link>
        </div>
      </div>

      {!activeSiteId && <p className="helper-text">サイト未選択のためデモ表示です。</p>}
      {loading && <p className="helper-text">読み込み中です...</p>}
      {error && <p className="pill danger">{error}</p>}
      {runMessage && <p className="pill success">{runMessage}</p>}
      {runError && <p className="pill danger">{runError}</p>}
      {readinessError && <p className="pill warning">{readinessError}</p>}
      {missingApis.length > 0 && (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>実行前に必要な連携設定</h3>
          <ul className="stack">
            {missingApis.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                {item.detail ? <span className="helper-text"> - {item.detail}</span> : null}
              </li>
            ))}
          </ul>
          <p className="helper-text">不足設定は「設定 → サイト設定 / 連携設定」から入力してください。</p>
        </div>
      )}

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>優先度</th>
              <th>スコア</th>
              <th>観測日時</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.title}
                  {item.summary && <div className="helper-text">{item.summary}</div>}
                </td>
                <td>{item.severity}</td>
                <td>{item.score.toFixed(2)}</td>
                <td>{new Date(item.observedAt).toLocaleString('ja-JP')}</td>
                <td>
                  <Link href={item.actionHref}>{item.actionLabel}</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="helper-text">
                  番組表シグナルはまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
