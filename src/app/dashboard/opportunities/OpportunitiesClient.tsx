'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import OperationFlowGuide from '../../../components/OperationFlowGuide';

type OpportunityRow = {
  id: string;
  title: string;
  why: string;
  status: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  task: { id: string; href: string; status: string } | null;
};

const DEMO_ROWS: OpportunityRow[] = [
  {
    id: 'demo-opportunity',
    title: 'デモ改善機会',
    why: 'サイト未選択時の導線確認用データです。',
    status: 'open',
    score: 0,
    confidence: 0,
    evidenceCount: 0,
    task: { id: 'sample-task', href: '/dashboard/tasks/sample-task', status: 'pending' }
  }
];

export default function OpportunitiesClient({ activeSiteId }: { activeSiteId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [runBusy, setRunBusy] = useState(false);
  const [taskifyBusy, setTaskifyBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshRows = useCallback(async () => {
    if (!activeSiteId) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/opportunities?siteId=${encodeURIComponent(activeSiteId)}&limit=50`);
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || '改善機会の取得に失敗しました。');
      }
      setRows((json.data?.items || []) as OpportunityRow[]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [activeSiteId]);

  useEffect(() => {
    void refreshRows();
  }, [refreshRows]);

  const sourceRows = activeSiteId ? rows : DEMO_ROWS;
  const topRows = useMemo(() => sourceRows.slice(0, 10), [sourceRows]);
  const openRows = useMemo(
    () => sourceRows.filter((row) => row.status === 'open' || row.status === 'pending'),
    [sourceRows]
  );
  const taskedRows = useMemo(() => sourceRows.filter((row) => Boolean(row.task)), [sourceRows]);
  const taskifyCandidates = useMemo(
    () => sourceRows.filter((row) => !row.task && row.status !== 'done' && row.status !== 'dismissed').slice(0, 3),
    [sourceRows]
  );

  async function runAiResearch() {
    if (!activeSiteId) return;

    setRunBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/v1/jobs/full-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSiteId,
          collectEpg: false,
          autoCreateTasks: true,
          maxAutoTasks: 12,
          minTaskPriority: 35,
          taskAction: 'write'
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'AIリサーチの実行に失敗しました。');
      }

      const generated = Number(json?.data?.summary?.generate?.summary?.generated || 0);
      const taskified = Number(json?.data?.summary?.taskify?.summary?.processed || 0);
      setActionMessage(`AIリサーチを実行しました（提案 ${generated}件 / タスク化 ${taskified}件）`);
      await refreshRows();
    } catch (e: any) {
      setActionError(String(e?.message || e));
    } finally {
      setRunBusy(false);
    }
  }

  async function taskifyTopOpportunities() {
    if (!activeSiteId) return;
    const ids = taskifyCandidates.map((row) => row.id);
    if (ids.length === 0) {
      setActionError('タスク化できる改善機会がありません。');
      return;
    }

    setTaskifyBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/v1/opportunities/bulk-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSiteId,
          ids,
          action: 'write'
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'タスク化に失敗しました。');
      }
      const createdCount = Number(json?.data?.createdCount || 0);
      const updatedCount = Number(json?.data?.updatedCount || 0);
      setActionMessage(`タスク化完了（新規 ${createdCount}件 / 更新 ${updatedCount}件）`);
      await refreshRows();
    } catch (e: any) {
      setActionError(String(e?.message || e));
    } finally {
      setTaskifyBusy(false);
    }
  }

  const aiBusy = loading || runBusy || taskifyBusy;
  const aiLabel = runBusy
    ? 'AIリサーチを実行中です。完了までお待ちください。'
    : taskifyBusy
      ? '改善機会をタスク化しています。'
      : loading
        ? '改善機会を読み込み中です。'
        : undefined;

  const nextAction = (() => {
    if (!activeSiteId) {
      return {
        title: 'まずサイトを選択',
        description: '設定状態が整うと、次の操作が有効になります。',
        label: '番組表取得へ移動',
        href: '/dashboard/channel',
        disabled: false
      };
    }
    if (sourceRows.length === 0) {
      return {
        title: 'AIリサーチを実行',
        description: '改善機会が0件です。まずAIリサーチを1回実行してください。',
        label: runBusy ? '実行中...' : 'AIリサーチを実行',
        onClick: runAiResearch,
        disabled: runBusy
      };
    }
    if (taskifyCandidates.length > 0) {
      return {
        title: '次はタスク化',
        description: '上位3件を一括でタスク化できます。',
        label: taskifyBusy ? 'タスク化中...' : '上位3件をタスク化',
        onClick: taskifyTopOpportunities,
        disabled: taskifyBusy
      };
    }
    return {
      title: 'タスク確認へ進む',
      description: 'タスク化済みです。次はタスク一覧で実行対象を開いてください。',
      label: 'タスク一覧を開く',
      href: '/dashboard/tasks',
      disabled: false
    };
  })();

  return (
    <section className="page-shell" data-page="opportunities">
      <div className="page-header">
        <div>
          <p className="helper-text">AIリサーチ</p>
          <h1 className="page-title">改善機会一覧</h1>
          <p className="page-subtitle">迷ったら「次にやること」カードのボタンだけ押してください。</p>
        </div>
      </div>

      <OperationFlowGuide current="opportunities" aiBusy={aiBusy} aiLabel={aiLabel} />

      <section className="card stack opportunity-next-card" data-block="opportunity-next-action">
        <h2 style={{ margin: 0 }}>次にやること</h2>
        <p className="helper-text">{nextAction.description}</p>
        {nextAction.href ? (
          <Link className="primary-button operation-big-action" href={nextAction.href}>
            {nextAction.label}
          </Link>
        ) : (
          <button
            className="primary-button operation-big-action"
            type="button"
            onClick={nextAction.onClick}
            disabled={nextAction.disabled}
          >
            {nextAction.label}
          </button>
        )}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link className="secondary-button" href="/dashboard/channel">
            番組表取得へ
          </Link>
          <Link className="secondary-button" href="/dashboard/tasks">
            タスク一覧へ
          </Link>
        </div>
      </section>

      {error && <p className="pill danger">{error}</p>}
      {actionError && <p className="pill danger">{actionError}</p>}
      {actionMessage && <p className="pill success">{actionMessage}</p>}

      <div className="card-grid compact-three-grid">
        <article className="card">
          <h2>改善機会</h2>
          <p>{sourceRows.length}</p>
        </article>
        <article className="card">
          <h2>未対応</h2>
          <p>{openRows.length}</p>
        </article>
        <article className="card">
          <h2>タスク化済み</h2>
          <p>{taskedRows.length}</p>
        </article>
      </div>

      <section className="card stack" data-block="opportunity-top10">
        <h2 style={{ margin: 0 }}>改善機会上位10件</h2>
        {topRows.length === 0 ? (
          <p className="helper-text">まだ改善機会がありません。AIリサーチを実行してください。</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>タイトル</th>
                  <th>状態</th>
                  <th>スコア</th>
                  <th>確度</th>
                  <th>タスク</th>
                  <th>詳細</th>
                </tr>
              </thead>
              <tbody>
                {topRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{row.title}</div>
                      {row.why ? <div className="helper-text">{row.why}</div> : null}
                    </td>
                    <td>{formatStatusLabel(row.status)}</td>
                    <td>{row.score.toFixed(2)}</td>
                    <td>{row.confidence.toFixed(2)}</td>
                    <td>
                      {row.task ? (
                        <Link className="secondary-button" href={row.task.href}>
                          タスクを開く
                        </Link>
                      ) : (
                        <span className="helper-text">未作成</span>
                      )}
                    </td>
                    <td>
                      <Link
                        className="secondary-button"
                        href={`/dashboard/opportunities/${row.id}${activeSiteId ? `?siteId=${encodeURIComponent(activeSiteId)}` : ''}`}
                      >
                        詳細
                      </Link>
                    </td>
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

function formatStatusLabel(status: string) {
  if (status === 'open') return '未対応';
  if (status === 'in_progress') return '対応中';
  if (status === 'pending') return '待機';
  if (status === 'done') return '完了';
  if (status === 'blocked') return '保留';
  if (status === 'dismissed') return '対象外';
  return status || '-';
}
