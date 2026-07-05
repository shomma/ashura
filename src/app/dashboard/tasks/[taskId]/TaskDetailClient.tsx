'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SiteSwitcher from '../../../../components/SiteSwitcher';
import GeminiContextSetter from '@/components/gemini/GeminiContextSetter';
import { buildContextString } from '@/lib/ai/context';

type TaskOutcome = {
  id: string;
  status: string;
  outcome: string | null;
  scoreDelta: number;
  executedAt: string | null;
  createdAt: string;
};

type TaskPayload = {
  channelName?: string;
  keyword?: string;
  action?: string;
  dateKey?: string;
  angle?: string;
  keywords?: string[];
  reason?: string;
  expectedImpact?: string;
  [key: string]: unknown;
};

type OpportunityLink = {
  id: string;
  title: string;
  status: string;
};

type TaskDetail = {
  id: string;
  siteId: string;
  opportunityId: string | null;
  action: string;
  status: string;
  title: string;
  source: string;
  dueAt: string | null;
  payload: TaskPayload | null;
  recommendation: Record<string, unknown> | null;
  recommendationSourceId: string | null;
  recommendationType: string | null;
  recommendationReason: string | null;
  opportunity: OpportunityLink | null;
  outcomes: TaskOutcome[];
  createdAt: string;
  updatedAt: string;
};

type ActiveSite = {
  id: string;
  name: string;
};

type Props = {
  taskId: string;
  activeSite: ActiveSite | null;
  activeSiteId: string | null;
  sites: { id: string; name: string }[];
  setActiveSiteAction: (formData: FormData) => void;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending', label: '未着手' },
  { value: 'in_progress', label: '進行中' },
  { value: 'blocked', label: '保留' },
  { value: 'done', label: '完了' }
];

function formatDate(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function toInputDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function isTaskOutcome(value: unknown): value is TaskOutcome {
  return (
    !!value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof (value as { id: unknown }).id === 'string'
  );
}

export default function TaskDetailClient({
  taskId,
  activeSite,
  activeSiteId,
  sites,
  setActiveSiteAction
}: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [resultSummary, setResultSummary] = useState('');
  const [outputPostId, setOutputPostId] = useState('');
  const [busy, setBusy] = useState<'status' | 'start' | 'complete' | 'delete' | null>(null);
  const hasSite = Boolean(activeSite?.id);

  useEffect(() => {
    if (!activeSite?.id) {
      setTask(null);
      setStatus('');
      setDueAt('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}?siteId=${encodeURIComponent(activeSite.id)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || 'タスク取得に失敗しました');
        }
        const sourceTask = json.data as TaskDetail;
        if (!cancelled) {
          setTask(sourceTask);
          setStatus(sourceTask.status);
          setDueAt(toInputDate(sourceTask.dueAt));
        }
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
  }, [activeSite?.id, taskId]);

  const geminiContext = useMemo(() => {
    return buildContextString({
      page: 'task-detail',
      activeSite,
      tasks: task ? [{ id: task.id, title: task.title, status: task.status }] : []
    });
  }, [activeSite, task]);

  const latestOutcomes = useMemo(() => {
    return task?.outcomes?.filter(isTaskOutcome).slice(0, 10) ?? [];
  }, [task]);

  async function reloadTask() {
    if (!activeSite?.id) return;
    const res = await fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}?siteId=${encodeURIComponent(activeSite.id)}`);
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error?.message || 'タスク再取得に失敗しました');
    }
    const sourceTask = json.data as TaskDetail;
    setTask(sourceTask);
    setStatus(sourceTask.status);
    setDueAt(toInputDate(sourceTask.dueAt));
    setError(null);
  }

  async function patchTask(update: Partial<{ status: string; title: string; dueAt: string | null }>) {
    if (!activeSite?.id) {
      setError('サイトを選択してください');
      return;
    }
    if (!task) return;
    setBusy('status');
    setError(null);
    setMessage(null);
    try {
      const body = {
        ...update,
        dueAt: update.dueAt === '' ? null : update.dueAt
      };
      const res = await fetch(`/api/v1/tasks/${encodeURIComponent(task.id)}?siteId=${encodeURIComponent(activeSite.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'タスク更新に失敗しました');
      }
      await reloadTask();
      setMessage('タスクを更新しました');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  async function startTask() {
    if (!activeSite?.id || !task) return;
    setBusy('start');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tasks/${encodeURIComponent(task.id)}/start?siteId=${encodeURIComponent(activeSite.id)}`, {
        method: 'POST'
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'タスク開始に失敗しました');
      }
      await reloadTask();
      setMessage('タスクを開始しました');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  async function completeTask(e: FormEvent) {
    e.preventDefault();
    if (!activeSite?.id || !task) return;
    setBusy('complete');
    setMessage(null);
    setError(null);
    try {
      const payload: { resultSummary?: string; outputPostId?: string } = {};
      if (resultSummary.trim()) payload.resultSummary = resultSummary.trim();
      if (outputPostId.trim()) payload.outputPostId = outputPostId.trim();

      const res = await fetch(`/api/v1/tasks/${encodeURIComponent(task.id)}/complete?siteId=${encodeURIComponent(activeSite.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'タスク完了処理に失敗しました');
      }
      await reloadTask();
      setMessage('タスクを完了しました');
      setResultSummary('');
      setOutputPostId('');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  async function deleteTask() {
    if (!activeSite?.id || !task) return;
    if (!confirm('このタスクを削除しますか？')) return;
    setBusy('delete');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tasks/${encodeURIComponent(task.id)}?siteId=${encodeURIComponent(activeSite.id)}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'タスク削除に失敗しました');
      }
      window.location.href = '/dashboard/tasks';
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="page-shell" data-page="task-detail">
      <GeminiContextSetter contextKey="task-detail" contextLabel="タスク詳細" context={geminiContext} />
      <div className="page-header">
        <div>
          <p className="helper-text">タスク詳細</p>
          <h1 className="page-title">タスク</h1>
          <p className="page-subtitle">タスクID: {taskId}</p>
        </div>
        <div className="stack">
          {message && <div className="pill success">{message}</div>}
          {error && <div className="pill danger">{error}</div>}
        </div>
      </div>

      <div className="card section-card">
        <div className="section-scroll stack">
          {sites.length === 0 ? (
            <p className="helper-text">サイトが登録されていません。</p>
          ) : (
            <SiteSwitcher
              sites={sites}
              activeSiteId={activeSiteId}
              setActiveSiteAction={setActiveSiteAction}
            />
          )}
          {activeSite ? (
            <div className="tile">
              <div style={{ fontWeight: 700 }}>{activeSite.name}</div>
            </div>
          ) : (
            <p className="helper-text">タスクデータを表示するにはサイトを選択してください。</p>
          )}
        </div>
      </div>

      {loading && <p className="helper-text">読み込み中です...</p>}
      {!hasSite && <p className="helper-text">内部設定を初期化しています。</p>}

      {task && (
        <div className="page-sections">
          <div className="card">
            <h2>{task.title}</h2>
            <p className="helper-text">種別: {task.action}</p>
            <p className="helper-text">ソース: {task.source}</p>
            <p className="helper-text">状態: {task.status}</p>
            <p className="helper-text">期限: {formatDate(task.dueAt)}</p>
            <p className="helper-text">更新日時: {formatDate(task.updatedAt)}</p>
            <div className="row" style={{ marginTop: 12 }}>
              <label className="stack" style={{ flex: 1 }}>
                <span className="helper-text">状態</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy === 'status'}>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stack" style={{ flex: 1 }}>
                <span className="helper-text">期限（ローカル時間）</span>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  disabled={busy === 'status'}
                />
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="secondary-button"
                type="button"
                disabled={busy === 'status'}
                onClick={() => patchTask({ status, dueAt: dueAt || null })}
              >
                保存
              </button>
              <button className="primary-button" type="button" disabled={busy === 'start'} onClick={startTask}>
                開始
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={busy === 'delete'}
                onClick={deleteTask}
              >
                削除
              </button>
              {task.opportunityId && (
                <Link className="secondary-button" href={`/dashboard/opportunities/${task.opportunityId}`}>
                  施策候補を見る
                </Link>
              )}
            </div>
          </div>

          <div className="card">
            <h2>実行結果</h2>
            {latestOutcomes.length === 0 ? (
              <p className="helper-text">実行結果はまだありません。</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>状態</th>
                      <th>スコア差分</th>
                      <th>実行日時</th>
                      <th>結果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestOutcomes.map((outcome) => (
                      <tr key={outcome.id}>
                        <td>{outcome.status}</td>
                        <td>{outcome.scoreDelta}</td>
                        <td>{formatDate(outcome.executedAt)}</td>
                        <td className="cell-ellipsis" style={{ maxWidth: 480 }}>
                          {outcome.outcome || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>タスク完了</h2>
            <form className="stack" onSubmit={completeTask}>
              <label>
                結果サマリ
                <textarea
                  rows={4}
                  value={resultSummary}
                  onChange={(e) => setResultSummary(e.target.value)}
                  placeholder="実施内容・結果・差分を入力"
                />
              </label>
              <label>
                出力記事ID（任意）
                <input
                  type="text"
                  value={outputPostId}
                  onChange={(e) => setOutputPostId(e.target.value)}
                  placeholder="ワードプレス記事ID"
                />
              </label>
              <button className="primary-button" type="submit" disabled={busy === 'complete'}>
                完了登録
              </button>
            </form>
          </div>

          <div className="card">
            <h2>ペイロード</h2>
            <pre className="code-block">{JSON.stringify(task.payload || task.recommendation || {}, null, 2)}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
