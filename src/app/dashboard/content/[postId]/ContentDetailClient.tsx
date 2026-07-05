'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

type DetailSignal = {
  id: string;
  type?: string;
  source?: string;
  severity?: string;
  title?: string;
  summary?: string;
  observedAt?: string | null;
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  action: string;
  source: string;
  dueAt?: string | null;
  createdAt?: string;
};

type Candidate = {
  keywordId: string;
  keyword: string;
  reason?: string;
  suggestedUrl?: string;
};

function normalizeCandidates(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Partial<Candidate>;
      if (typeof source.keywordId !== 'string' || typeof source.keyword !== 'string') return null;
      return {
        keywordId: source.keywordId,
        keyword: source.keyword,
        reason: typeof source.reason === 'string' ? source.reason : undefined,
        suggestedUrl: typeof source.suggestedUrl === 'string' ? source.suggestedUrl : undefined
      } as Candidate;
    })
    .filter(Boolean) as Candidate[];
}

type DetailData = {
  postId: string;
  title: string;
  status: string;
  score: number;
  confidence: number;
  impact: string | null;
  summary: string | null;
  why: string | null;
  healthSignals: DetailSignal[];
  evidence: Array<{ id: string; kind: string; label: string; value: string | null; sourceUrl: string | null; observedAt: string | null }>;
  tasks: TaskRow[];
};

type ActiveSite = {
  id: string;
  name: string;
};

type Props = {
  postId: string;
  activeSite: ActiveSite | null;
  activeSiteId: string | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function ContentDetailClient({ postId, activeSite, activeSiteId }: Props) {
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [links, setLinks] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<'rewrite' | 'link' | null>(null);

  async function requestApiJson(url: string) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as { ok?: boolean; data?: unknown; error?: { message?: string } };
  }

  useEffect(() => {
    if (!activeSite?.id) {
      setDetail(null);
      setLinks([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      requestApiJson(`/api/v1/content/${encodeURIComponent(postId)}?siteId=${encodeURIComponent(activeSite.id)}`),
      requestApiJson(
        `/api/v1/content/${encodeURIComponent(postId)}/internal-links?siteId=${encodeURIComponent(activeSite.id)}`
      )
    ])
      .then(([detailJson, linksJson]) => {
        if (!detailJson?.ok) {
          throw new Error(detailJson?.error?.message || 'コンテンツ詳細の取得に失敗しました');
        }
        if (!linksJson?.ok) {
          throw new Error(linksJson?.error?.message || '内部リンク候補の取得に失敗しました');
        }
        if (cancelled) return;
        setDetail(detailJson.data as DetailData);
        const candidateData =
          linksJson?.data && typeof linksJson.data === 'object' && !Array.isArray(linksJson.data)
            ? (linksJson.data as { candidates?: unknown }).candidates
            : [];
        setLinks(normalizeCandidates(candidateData));
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
  }, [postId, activeSite?.id]);

  async function createRewriteTask(event: FormEvent) {
    event.preventDefault();
    if (!activeSite?.id) return;
    setBusy('rewrite');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/content/${encodeURIComponent(postId)}/rewrite-task?siteId=${encodeURIComponent(activeSite.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'リライトタスクの作成に失敗しました');
      }
      if (!json.data?.task?.id) throw new Error('タスクIDが取得できませんでした');
      window.location.href = `/dashboard/tasks/${json.data.task.id}`;
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  async function createLinkTask(event: FormEvent) {
    event.preventDefault();
    if (!activeSite?.id) return;
    setBusy('link');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/content/${encodeURIComponent(postId)}/link-task?siteId=${encodeURIComponent(activeSite.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || '内部リンクタスクの作成に失敗しました');
      }
      if (!json.data?.task?.id) throw new Error('タスクIDが取得できませんでした');
      window.location.href = `/dashboard/tasks/${json.data.task.id}`;
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="page-shell" data-page="content-detail">
      <div className="page-header">
        <div>
          <p className="helper-text">コンテンツ詳細</p>
          <h1 className="page-title">コンテンツ健全性 詳細</h1>
          <p className="page-subtitle">{postId}</p>
        </div>
        <div className="stack">
          {message && <span className="pill success">{message}</span>}
          {error && <span className="pill danger">{error}</span>}
        </div>
      </div>

      {loading && <p className="helper-text">読み込み中です...</p>}
      {activeSite ? (
        <p className="helper-text">対象サイト: {activeSite.name}</p>
      ) : (
        <p className="helper-text">内部設定を初期化しています。</p>
      )}

      {detail && (
        <div className="page-sections">
          <div className="card">
            <h2>{detail.title}</h2>
            <p className="helper-text">状態: {detail.status}</p>
            <p className="helper-text">スコア: {detail.score}</p>
            <p className="helper-text">確度: {detail.confidence}</p>
            <p className="helper-text">影響: {detail.impact ?? '-'}</p>
            <p className="helper-text">要約: {detail.summary ?? '-'}</p>
            <p className="helper-text">背景: {detail.why ?? '-'}</p>
          </div>

          <div className="card">
            <h2>健全性シグナル</h2>
            {detail.healthSignals.length === 0 ? (
              <p className="helper-text">健全性シグナルはありません。</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>種別</th>
                      <th>ソース</th>
                      <th>重要度</th>
                      <th>タイトル</th>
                      <th>観測日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.healthSignals.map((signal) => (
                      <tr key={signal.id}>
                        <td>{signal.type ?? '-'}</td>
                        <td>{signal.source ?? '-'}</td>
                        <td>{signal.severity ?? '-'}</td>
                        <td>{signal.title ?? '-'}</td>
                        <td>{formatDate(signal.observedAt ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>根拠データ</h2>
            {detail.evidence.length === 0 ? (
              <p className="helper-text">根拠データはありません。</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>種別</th>
                      <th>ラベル</th>
                      <th>値</th>
                      <th>観測日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.evidence.map((item) => (
                      <tr key={item.id}>
                        <td>{item.kind}</td>
                        <td>{item.label}</td>
                        <td>{item.value ?? '-'}</td>
                        <td>{formatDate(item.observedAt ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>関連タスク</h2>
            {detail.tasks.length === 0 ? (
              <p className="helper-text">関連タスクはありません。</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>タイトル</th>
                      <th>状態</th>
                      <th>種別</th>
                      <th>ソース</th>
                      <th>期限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.tasks.map((task) => (
                      <tr key={task.id}>
                        <td>
                          <Link href={`/dashboard/tasks/${task.id}`}>{task.title}</Link>
                        </td>
                        <td>{task.status}</td>
                        <td>{task.action}</td>
                        <td>{task.source}</td>
                        <td>{formatDate(task.dueAt ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2>内部リンク候補</h2>
            {links.length === 0 ? (
              <p className="helper-text">リンク候補はありません。</p>
            ) : (
              <ul className="stack">
                {links.map((item) => (
                  <li key={item.keywordId}>
                    <Link href={item.suggestedUrl || `/dashboard/keywords/${item.keywordId}`}>{item.keyword}</Link>
                    {item.reason ? <span className="helper-text"> - {item.reason}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2>タスク操作</h2>
            <div className="row">
              <form onSubmit={createRewriteTask}>
                <button className="primary-button" type="submit" disabled={busy === 'rewrite'}>
                  {busy === 'rewrite' ? '作成中...' : 'リライトタスクを作成'}
                </button>
              </form>
              <form onSubmit={createLinkTask}>
                <button className="secondary-button" type="submit" disabled={busy === 'link'}>
                  {busy === 'link' ? '作成中...' : '内部リンクタスクを作成'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
