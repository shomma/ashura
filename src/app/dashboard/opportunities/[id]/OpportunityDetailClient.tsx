'use client';

import { useEffect, useState } from 'react';

type Evidence = {
  id: string;
  kind: string;
  label: string;
  value: string | null;
};

type LinkedTask = {
  id: string;
  title: string;
  status: string;
  href: string;
};

type OpportunityDetail = {
  id: string;
  title: string;
  why: string;
  impact: string | null;
  confidence: number;
  score: number;
  status: string;
  evidence: Evidence[];
  linkedTasks: LinkedTask[];
};

const DEMO_ITEM: OpportunityDetail = {
  id: 'demo-opportunity',
  title: 'デモ施策候補',
  why: 'サイト未選択時の確認用データです。',
  impact: 'コンテンツ計画の改善による想定効果です。',
  confidence: 0.6,
  score: 0,
  status: 'open',
  evidence: [{ id: 'ev1', kind: 'demo', label: '根拠サンプル', value: 'なし' }],
  linkedTasks: [{ id: 'sample-task', title: 'サンプルタスク', status: 'pending', href: '/dashboard/tasks/sample-task' }]
};

export default function OpportunityDetailClient({
  opportunityId,
  activeSiteId
}: {
  opportunityId: string;
  activeSiteId: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<OpportunityDetail | null>(null);

  useEffect(() => {
    if (!activeSiteId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/opportunities/${encodeURIComponent(opportunityId)}?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || '詳細の取得に失敗しました');
        if (!cancelled) setItem(json.data as OpportunityDetail);
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
  }, [activeSiteId, opportunityId]);

  async function createTaskAndMove() {
    if (!activeSiteId) {
      window.location.href = '/dashboard/tasks/sample-task';
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/opportunities/${encodeURIComponent(opportunityId)}/tasks?siteId=${encodeURIComponent(activeSiteId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        }
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'タスク作成に失敗しました');
      const href: string | undefined = json?.data?.taskHref;
      window.location.href = href || '/dashboard/tasks';
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setCreating(false);
    }
  }

  const current = item ?? (!activeSiteId ? DEMO_ITEM : null);

  return (
    <section className="panel stack" data-page="opportunity-detail">
      <h1>施策候補の詳細</h1>
      {loading && <p className="helper-text">読み込み中です...</p>}
      {error && <p className="pill danger">{error}</p>}

      {current && (
        <>
          <div className="card stack">
            <h2>{current.title}</h2>
            <p className="helper-text">
              状態: {formatStatusLabel(current.status)} / スコア: {current.score.toFixed(2)}
            </p>
          </div>

          <div className="card-grid">
            <article className="card">
              <h2>理由</h2>
              <p>{current.why || '-'}</p>
            </article>
            <article className="card">
              <h2>根拠</h2>
              {current.evidence.length === 0 ? (
                <p>-</p>
              ) : (
                <ul className="stack">
                  {current.evidence.map((ev) => (
                    <li key={ev.id}>
                      {ev.label} ({ev.kind}) {ev.value ?? ''}
                    </li>
                  ))}
                </ul>
              )}
            </article>
            <article className="card">
              <h2>想定効果</h2>
              <p>{current.impact || '-'}</p>
            </article>
            <article className="card">
              <h2>確度</h2>
              <p>{current.confidence.toFixed(2)}</p>
            </article>
          </div>

          <div className="card stack">
            <h2>タスク</h2>
            <button className="primary-button" type="button" disabled={creating} onClick={createTaskAndMove}>
              {creating ? '作成中...' : 'タスクを作成して開く'}
            </button>
            {current.linkedTasks.length > 0 && (
              <div className="stack">
                {current.linkedTasks.map((task) => (
                  <a key={task.id} href={task.href}>
                    {task.title} ({formatStatusLabel(task.status)})
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function formatStatusLabel(status: string) {
  if (status === 'open') return '未対応';
  if (status === 'in_progress') return '進行中';
  if (status === 'pending') return '保留';
  if (status === 'done') return '完了';
  if (status === 'blocked') return '停止中';
  if (status === 'dismissed') return '見送り';
  return status || '-';
}
