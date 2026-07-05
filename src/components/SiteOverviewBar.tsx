'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type SiteOverviewResponse = {
  siteId: string;
  siteName: string;
  refreshedAt: string;
  stages: {
    collection: {
      signals24h: number;
      epgDays: number;
      epgUpcomingPrograms: number;
      epgHitCandidates: number;
      watchwordCount: number;
    };
    planning: {
      openOpportunities: number;
      pendingRecommendations: number;
      openAlerts: number;
      draftPlans7d: number;
    };
    execution: {
      tasksOpen: number;
      tasksDone7d: number;
      outcomes7d: number;
    };
    analysis: {
      scoreDelta7d: number;
    };
  };
};

type Props = {
  activeSiteId: string | null;
};

export default function SiteOverviewBar({ activeSiteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [cycleBusy, setCycleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<SiteOverviewResponse | null>(null);

  const fetchOverview = useCallback(async () => {
    if (!activeSiteId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/dashboard/site-overview?siteId=${encodeURIComponent(activeSiteId)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || '運用サマリーの取得に失敗しました');
      }
      setData(json.data as SiteOverviewResponse);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : '運用サマリーの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [activeSiteId]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  async function runFullCycle() {
    if (!activeSiteId || cycleBusy) return;
    setCycleBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/jobs/full-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeSiteId })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || 'フルサイクル実行に失敗しました');
      }
      setMessage('収集と判定のフルサイクルを実行しました');
      await fetchOverview();
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'フルサイクル実行に失敗しました');
    } finally {
      setCycleBusy(false);
    }
  }

  const cards = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: '番組表候補',
        value: `${data.stages.collection.epgHitCandidates} 件`,
        detail: `今後7日 ${data.stages.collection.epgUpcomingPrograms.toLocaleString()}番組 / 監視語 ${data.stages.collection.watchwordCount}`
      },
      {
        title: '記事下書き生成',
        value: `${data.stages.planning.draftPlans7d} 件`,
        detail: `直近7日のGemini生成履歴`
      },
      {
        title: '進行中タスク',
        value: `${data.stages.execution.tasksOpen} 件`,
        detail: `7日完了 ${data.stages.execution.tasksDone7d} / 成果 ${data.stages.execution.outcomes7d}`
      },
      {
        title: '改善スコア',
        value: `${data.stages.analysis.scoreDelta7d.toLocaleString()}`,
        detail: `提案 ${data.stages.planning.pendingRecommendations} / アラート ${data.stages.planning.openAlerts}`
      }
    ];
  }, [data]);

  return (
    <section className="site-overview">
      <div className="site-overview-header">
        <div>
          <p className="helper-text">今日のダッシュボード</p>
          <h2 className="site-overview-title">今の状況</h2>
          {data && (
            <p className="helper-text">
              最終更新: {formatDateTime(data.refreshedAt)}
            </p>
          )}
        </div>
        <div className="row">
          <button className="secondary-button" type="button" onClick={fetchOverview} disabled={loading}>
            {loading ? '更新中...' : '数値を更新'}
          </button>
          <button className="primary-button" type="button" onClick={runFullCycle} disabled={!activeSiteId || cycleBusy}>
            {cycleBusy ? '実行中...' : 'フルサイクル実行'}
          </button>
          <Link className="secondary-button" href="/dashboard/command-center">
            ダッシュボード
          </Link>
          <Link className="secondary-button" href="/dashboard/keywords/discovery">
            キーワード調査
          </Link>
        </div>
      </div>

      {!activeSiteId && <p className="helper-text">設定を初期化しています。</p>}
      {message && <p className="pill success">{message}</p>}
      {error && <p className="pill danger">{error}</p>}

      {data && (
        <div className="site-overview-grid">
          {cards.map((card) => (
            <article key={card.title} className="site-overview-card">
              <p className="site-overview-card-title">{card.title}</p>
              <p className="site-overview-card-value">{card.value}</p>
              <p className="helper-text">{card.detail}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  const hh = `${d.getHours()}`.padStart(2, '0');
  const mi = `${d.getMinutes()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}
