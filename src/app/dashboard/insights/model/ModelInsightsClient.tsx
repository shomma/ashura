'use client';

import { useEffect, useState } from 'react';

type ApiResponse = {
  summary?: {
    opportunityCount?: number;
    outcomeCount?: number;
    adoptionRate?: number;
    averageScore?: number;
    modelVersion?: string | null;
  };
  stats?: {
    pendingOpportunities?: number;
    doneOpportunities?: number;
    doneTasks?: number;
  };
};

type Props = {
  activeSiteId: string | null;
  sites: { id: string; name: string }[];
};

function toPercent(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0%';
  return `${Math.round(value * 100)}%`;
}

export default function ModelInsightsClient({ activeSiteId, sites }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApiResponse['summary']>({});
  const [stats, setStats] = useState<ApiResponse['stats']>({});
  const activeSiteName = sites.find((site) => site.id === activeSiteId)?.name;

  useEffect(() => {
    if (!activeSiteId) {
      setSummary({});
      setStats({});
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/insights/model?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; data?: ApiResponse; error?: { message?: string } };
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || 'モデル分析データの取得に失敗しました');
        if (cancelled) return;
        setSummary(json.data?.summary);
        setStats(json.data?.stats);
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

  const hasSite = Boolean(activeSiteId);

  return (
    <section className="page-shell" data-page="insights-model">
      <div className="page-header">
        <div>
          <p className="helper-text">モデル分析</p>
          <h1 className="page-title">モデル分析</h1>
          <p className="page-subtitle">
            {hasSite ? `モデルバージョン: ${summary?.modelVersion ?? '-'}` : 'サイトが未選択です。'}
          </p>
        </div>
      </div>

      <div className="card section-card">
        <div className="section-scroll stack">
          <p className="helper-text">
            {hasSite ? `対象サイト: ${activeSiteName ?? activeSiteId}` : '対象サイト: 未選択'}
          </p>
          <p className="helper-text">利用可能サイト数: {sites.length}</p>
        </div>
      </div>

      {loading && <p className="helper-text">読み込み中です...</p>}
      {error && <p className="pill danger">{error}</p>}
      {!hasSite && <p className="helper-text">サイドバーからサイトを選択してください。</p>}

      {hasSite && (
        <div className="card-grid">
          <article className="card">
            <h2>施策候補数</h2>
            <p>{summary?.opportunityCount ?? 0}</p>
          </article>
          <article className="card">
            <h2>完了した施策候補</h2>
            <p>{stats?.doneOpportunities ?? 0}</p>
          </article>
          <article className="card">
            <h2>完了したアウトカム</h2>
            <p>{stats?.doneTasks ?? 0}</p>
          </article>
          <article className="card">
            <h2>採用率</h2>
            <p>{toPercent(summary?.adoptionRate)}</p>
          </article>
          <article className="card">
            <h2>平均スコア</h2>
            <p>{summary?.averageScore ?? 0}</p>
          </article>
          <article className="card">
            <h2>総アウトカム数</h2>
            <p>{summary?.outcomeCount ?? 0}</p>
          </article>
        </div>
      )}
    </section>
  );
}
