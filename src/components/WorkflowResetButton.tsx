'use client';

import { useState } from 'react';

export default function WorkflowResetButton() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resetData() {
    const confirmed = window.confirm(
      '取得済み番組表、需要競合調査結果、記事提案、旧タスクなどの作業データを削除します。登録キーワードは残ります。実行しますか？'
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/workflow/reset', {
        method: 'DELETE',
        cache: 'no-store'
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'データリセットに失敗しました');
      }
      setMessage('作業データをリセットしました');
      window.location.reload();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sidebar-reset-panel">
      <button
        className="danger-button sidebar-reset-button"
        type="button"
        onClick={resetData}
        disabled={busy}
      >
        {busy ? 'リセット中...' : 'データリセット'}
      </button>
      {message ? <p className="sidebar-reset-message success">{message}</p> : null}
      {error ? <p className="sidebar-reset-message danger">{error}</p> : null}
    </div>
  );
}
