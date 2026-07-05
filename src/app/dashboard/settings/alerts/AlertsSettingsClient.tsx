'use client';

import { FormEvent, useEffect, useState } from 'react';

type AlertsPayload = {
  positionDropRate?: number;
  trafficDropRate?: number;
  minConfidence?: number;
  freshnessHours?: number;
};

type ApiResponse = {
  alerts: {
    positionDropRate: number;
    trafficDropRate: number;
    minConfidence: number;
    freshnessHours: number;
  };
};

type Props = {
  activeSiteId: string | null;
};

export default function AlertsSettingsClient({ activeSiteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState({
    positionDropRate: 0.2,
    trafficDropRate: 0.2,
    minConfidence: 0.55,
    freshnessHours: 24
  });

  useEffect(() => {
    if (!activeSiteId) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/settings/alerts?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; data?: ApiResponse; error?: { message?: string } };
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || 'アラート設定の取得に失敗しました');
        }
        if (cancelled || !json.data?.alerts) return;
        setAlerts({
          positionDropRate: Number(json.data.alerts.positionDropRate ?? 0.2),
          trafficDropRate: Number(json.data.alerts.trafficDropRate ?? 0.2),
          minConfidence: Number(json.data.alerts.minConfidence ?? 0.55),
          freshnessHours: Number(json.data.alerts.freshnessHours ?? 24)
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

    const payload: AlertsPayload = {
      positionDropRate: alerts.positionDropRate,
      trafficDropRate: alerts.trafficDropRate,
      minConfidence: alerts.minConfidence,
      freshnessHours: alerts.freshnessHours
    };
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/v1/settings/alerts?siteId=${encodeURIComponent(activeSiteId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'アラート設定の保存に失敗しました');
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
    <section className="page-shell" data-page="settings-alerts">
      <div className="page-header">
        <div>
          <p className="helper-text">アラート設定</p>
          <h1 className="page-title">アラート設定</h1>
          <p className="page-subtitle">自動アラートのしきい値を設定します。</p>
        </div>
        <div className="stack">
          {saving && <span className="helper-text">保存中...</span>}
          {message && <span className="pill success">{message}</span>}
          {error && <span className="pill danger">{error}</span>}
        </div>
      </div>
      {loading && <p className="helper-text">読み込み中です...</p>}
      <form className="card section-card" onSubmit={onSubmit}>
        <div className="section-scroll stack">
          <label className="stack">
            順位下落率（positionDropRate）
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={alerts.positionDropRate}
              onChange={(event) =>
                setAlerts((prev) => ({ ...prev, positionDropRate: Number(event.target.value) || prev.positionDropRate }))
              }
            />
          </label>
          <label className="stack">
            流入下落率（trafficDropRate）
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={alerts.trafficDropRate}
              onChange={(event) =>
                setAlerts((prev) => ({ ...prev, trafficDropRate: Number(event.target.value) || prev.trafficDropRate }))
              }
            />
          </label>
          <label className="stack">
            最低確度（minConfidence）
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={alerts.minConfidence}
              onChange={(event) =>
                setAlerts((prev) => ({ ...prev, minConfidence: Number(event.target.value) || prev.minConfidence }))
              }
            />
          </label>
          <label className="stack">
            鮮度時間（freshnessHours）
            <input
              type="number"
              min="1"
              max="168"
              value={alerts.freshnessHours}
              onChange={(event) =>
                setAlerts((prev) => ({ ...prev, freshnessHours: Number(event.target.value) || prev.freshnessHours }))
              }
            />
          </label>
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </section>
  );
}
