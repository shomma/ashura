'use client';

import { useCallback, useEffect, useState } from 'react';

type RefItem = {
  id: string;
  title: string;
  url: string | null;
  note: string | null;
  task?: { id: string; title: string } | null;
  opportunity?: { id: string; title: string } | null;
};

export default function ReferenceStoreClient({ activeSiteId }: { activeSiteId: string | null }) {
  const [items, setItems] = useState<RefItem[]>([]);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [taskId, setTaskId] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeSiteId) return;
    const res = await fetch(`/api/v1/references?siteId=${encodeURIComponent(activeSiteId)}`);
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message || '参照情報の取得に失敗しました');
      return;
    }
    setItems(json.data?.items || []);
  }, [activeSiteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createReference() {
    if (!activeSiteId || !title.trim()) return;
    const res = await fetch('/api/v1/references', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: activeSiteId,
        title,
        url,
        note,
        taskId: taskId || null,
        opportunityId: opportunityId || null
      })
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message || '参照情報の作成に失敗しました');
      return;
    }
    setTitle('');
    setUrl('');
    setNote('');
    setTaskId('');
    setOpportunityId('');
    await load();
  }

  async function removeReference(id: string) {
    const res = await fetch(`/api/v1/references/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message || '参照情報の削除に失敗しました');
      return;
    }
    await load();
  }

  return (
    <section className="page-shell" data-page="reference-store">
      <div className="page-header">
        <div>
          <h1 className="page-title">参照情報ストア</h1>
          <p className="page-subtitle">リンクやメモを保存し、タスクや施策候補に紐づけます。</p>
        </div>
      </div>
      {!activeSiteId && <p className="helper-text">サイトを選択すると続行できます。</p>}
      {error && <p className="pill danger">{error}</p>}

      <div className="card stack">
        <h2>参照情報を追加</h2>
        <label>
          タイトル
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          リンク
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          メモ
          <textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label>
          タスクID（任意）
          <input value={taskId} onChange={(e) => setTaskId(e.target.value)} />
        </label>
        <label>
          施策候補ID（任意）
          <input value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} />
        </label>
        <button className="primary-button" type="button" disabled={!activeSiteId} onClick={createReference}>
          参照情報を保存
        </button>
      </div>

      <div className="card stack">
        <h2>登録済み参照情報</h2>
        {items.length === 0 ? (
          <p className="helper-text">参照情報はまだありません。</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>タイトル</th>
                  <th>リンク</th>
                  <th>タスク</th>
                  <th>施策候補</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div>{item.title}</div>
                      {item.note && <div className="helper-text">{item.note}</div>}
                    </td>
                    <td>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.url}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>{item.task?.title ?? '-'}</td>
                    <td>{item.opportunity?.title ?? '-'}</td>
                    <td>
                      <button className="danger-button" type="button" onClick={() => removeReference(item.id)}>
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
