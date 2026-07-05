'use client';

import { useCallback, useEffect, useState } from 'react';

type PromptPreset = {
  id: string;
  name: string;
  category: string;
  prompt: string;
  isDefault: boolean;
};

export default function PromptLibraryClient({ activeSiteId }: { activeSiteId: string | null }) {
  const [items, setItems] = useState<PromptPreset[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('general');
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeSiteId) return;
    const res = await fetch(`/api/v1/prompts?siteId=${encodeURIComponent(activeSiteId)}`);
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message || 'プロンプトの取得に失敗しました');
      return;
    }
    setItems(json.data?.items || []);
  }, [activeSiteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPrompt() {
    if (!activeSiteId || !name.trim() || !prompt.trim()) return;
    setError(null);
    const res = await fetch('/api/v1/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: activeSiteId, name, category, prompt })
    });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message || 'プロンプトの作成に失敗しました');
      return;
    }
    setName('');
    setPrompt('');
    await load();
  }

  async function removePrompt(id: string) {
    const res = await fetch(`/api/v1/prompts/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error?.message || 'プロンプトの削除に失敗しました');
      return;
    }
    await load();
  }

  return (
    <section className="page-shell" data-page="prompt-library">
      <div className="page-header">
        <div>
          <h1 className="page-title">プロンプトライブラリ</h1>
          <p className="page-subtitle">ジェミニプロンプトのテンプレートを作成・管理します。</p>
          <p className="helper-text">影響 : 工数 = 1.6 : 1</p>
        </div>
      </div>
      {!activeSiteId && <p className="helper-text">サイトを選択すると続行できます。</p>}
      {error && <p className="pill danger">{error}</p>}

      <div className="card stack">
        <h2>プリセットを作成</h2>
        <label>
          名前
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          種別
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="general">汎用</option>
            <option value="outline">構成案</option>
            <option value="rewrite">リライト</option>
            <option value="linking">内部リンク</option>
            <option value="seo">検索最適化</option>
          </select>
        </label>
        <label>
          プロンプト
          <textarea rows={8} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <button className="primary-button" type="button" disabled={!activeSiteId} onClick={createPrompt}>
          プリセットを保存
        </button>
      </div>

      <div className="card stack">
        <h2>登録済みプリセット</h2>
        {items.length === 0 ? (
          <p className="helper-text">プロンプトプリセットはまだありません。</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>名前</th>
                  <th>種別</th>
                  <th>標準</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>{formatCategoryLabel(item.category)}</td>
                    <td>{item.isDefault ? 'はい' : 'いいえ'}</td>
                    <td>
                      <button className="danger-button" type="button" onClick={() => removePrompt(item.id)}>
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

function formatCategoryLabel(category: string) {
  if (category === 'general') return '汎用';
  if (category === 'outline') return '構成案';
  if (category === 'rewrite') return 'リライト';
  if (category === 'linking') return '内部リンク';
  if (category === 'seo') return '検索最適化';
  return category || '-';
}
