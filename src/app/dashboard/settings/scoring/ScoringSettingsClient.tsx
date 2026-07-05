'use client';

import { FormEvent, useEffect, useState } from 'react';

type ConfigPayload = {
  isActive?: boolean;
  opportunityWeights?: {
    demand?: number;
    competition?: number;
    achievability?: number;
    business?: number;
    freshness?: number;
  };
  decayDays?: number;
};

type ConfigResponse = {
  config: {
    id: string;
    isActive: boolean;
    decayDays: number;
    opportunityWeights: Record<string, number>;
  };
};

type Props = {
  activeSiteId: string | null;
};

export default function ScoringSettingsClient({ activeSiteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [config, setConfig] = useState({
    isActive: true,
    decayDays: 30,
    demand: 1,
    competition: 1,
    achievability: 1,
    business: 1,
    freshness: 1
  });

  useEffect(() => {
    if (!activeSiteId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/settings/scoring?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; data?: { config: ConfigResponse['config'] }; error?: { message?: string } };
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || 'スコア設定の取得に失敗しました');
        }
        const raw = json.data?.config;
        if (cancelled || !raw) return;
        setConfig({
          isActive: raw.isActive,
          decayDays: raw.decayDays,
          demand: Number(raw.opportunityWeights?.demand ?? 1),
          competition: Number(raw.opportunityWeights?.competition ?? 1),
          achievability: Number(raw.opportunityWeights?.achievability ?? 1),
          business: Number(raw.opportunityWeights?.business ?? 1),
          freshness: Number(raw.opportunityWeights?.freshness ?? 1)
        });
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

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeSiteId) return;

    const payload: ConfigPayload = {
      isActive: config.isActive,
      decayDays: config.decayDays,
      opportunityWeights: {
        demand: config.demand,
        competition: config.competition,
        achievability: config.achievability,
        business: config.business,
        freshness: config.freshness
      }
    };

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/settings/scoring?siteId=${encodeURIComponent(activeSiteId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'スコア設定の保存に失敗しました');
      }
      setMessage('保存しました');
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!activeSiteId) {
    return <p className="helper-text">先にサイトを選択してください。</p>;
  }

  return (
    <section className="page-shell" data-page="settings-scoring">
      <div className="page-header">
        <div>
          <p className="helper-text">スコア設定</p>
          <h1 className="page-title">スコア設定</h1>
          <p className="page-subtitle">施策候補スコアの重みとモデル設定を調整します。</p>
        </div>
        <div className="stack">
          {saving && <span className="helper-text">保存中...</span>}
          {message && <span className="pill success">{message}</span>}
          {error && <span className="pill danger">{error}</span>}
        </div>
      </div>

      {loading && <p className="helper-text">設定を読み込み中です...</p>}

      <form className="card section-card" onSubmit={onSubmit}>
        <div className="section-scroll stack">
          <label className="stack">
            <span>減衰日数</span>
            <input
              type="number"
              min={1}
              max={365}
              value={config.decayDays}
              onChange={(event) =>
                setConfig((prev) => ({ ...prev, decayDays: Number(event.target.value) || prev.decayDays }))
              }
            />
          </label>

          <label className="stack">
            <span>需要</span>
            <input
              type="number"
              step="0.1"
              value={config.demand}
              onChange={(event) => setConfig((prev) => ({ ...prev, demand: Number(event.target.value) || 0 }))}
            />
          </label>
          <label className="stack">
            <span>競合</span>
            <input
              type="number"
              step="0.1"
              value={config.competition}
              onChange={(event) => setConfig((prev) => ({ ...prev, competition: Number(event.target.value) || 0 }))}
            />
          </label>
          <label className="stack">
            <span>実現性</span>
            <input
              type="number"
              step="0.1"
              value={config.achievability}
              onChange={(event) => setConfig((prev) => ({ ...prev, achievability: Number(event.target.value) || 0 }))}
            />
          </label>
          <label className="stack">
            <span>事業性</span>
            <input
              type="number"
              step="0.1"
              value={config.business}
              onChange={(event) => setConfig((prev) => ({ ...prev, business: Number(event.target.value) || 0 }))}
            />
          </label>
          <label className="stack">
            <span>鮮度</span>
            <input
              type="number"
              step="0.1"
              value={config.freshness}
              onChange={(event) => setConfig((prev) => ({ ...prev, freshness: Number(event.target.value) || 0 }))}
            />
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={config.isActive}
              onChange={(event) => setConfig((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            このスコア設定を有効化
          </label>

          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </section>
  );
}
