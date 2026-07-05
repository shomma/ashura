'use client';

import { useEffect, useMemo, useState } from 'react';
import OperationFlowGuide from '../../../../components/OperationFlowGuide';

type ApiSummary = Record<string, unknown>;

type SignalRow = {
  id: string;
  type?: string;
  source?: string;
  severity?: string;
  title?: string;
  summary?: string;
  observedAt?: string | null;
  score?: number;
};

type OpportunityRow = {
  id: string;
  title: string;
  score?: number;
  confidence?: number;
};

type ApiResponse = {
  summary?: ApiSummary;
  opportunities?: OpportunityRow[];
  recentSignals?: SignalRow[];
};

type Props = {
  activeSiteId: string | null;
  sites: { id: string; name: string }[];
};

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return 0;
}

function formatRate(value: unknown) {
  const raw = asNumber(value);
  const ratio = raw > 1 ? raw : raw * 100;
  return `${Math.round(ratio)}%`;
}

export default function SeoInsightsClient({ activeSiteId, sites }: Props) {
  const siteName = activeSiteId ? sites.find((site) => site.id === activeSiteId)?.name : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ApiSummary>({});
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);

  useEffect(() => {
    if (!activeSiteId) {
      setSummary({});
      setSignals([]);
      setOpportunities([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/insights/seo?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; data?: ApiResponse; error?: { message?: string } };
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || 'SEO分析データの取得に失敗しました');
        }
        if (cancelled) return;
        setSummary(json.data?.summary ?? {});
        setSignals(Array.isArray(json.data?.recentSignals) ? (json.data?.recentSignals as SignalRow[]) : []);
        setOpportunities(Array.isArray(json.data?.opportunities) ? (json.data?.opportunities as OpportunityRow[]) : []);
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

  const metricCards = useMemo(
    () => [
      { label: '改善機会', value: asNumber(summary.opportunities) },
      { label: 'タスク化済み', value: asNumber(summary.taskedOpportunities) },
      { label: '改善完了', value: asNumber(summary.completedOutcomes) },
      { label: '完了率', value: formatRate(summary.completionRate) }
    ],
    [summary]
  );

  return (
    <section className="page-shell" data-page="insights-seo">
      <div className="page-header">
        <div>
          <p className="helper-text">分析ステップ</p>
          <h1 className="page-title">検索最適化の結果確認</h1>
          <p className="page-subtitle">{siteName || 'サイト未選択'}</p>
        </div>
      </div>

      <OperationFlowGuide
        current="insights-seo"
        aiBusy={loading}
        aiLabel={loading ? 'AIが最新の分析データを集計中です。' : undefined}
      />

      {error && <p className="pill danger">{error}</p>}
      {!activeSiteId && <p className="helper-text">サイトを選択すると分析結果を表示します。</p>}

      {activeSiteId ? (
        <>
          <div className="card-grid compact-three-grid metric-grid-4">
            {metricCards.map((metric) => (
              <article className="card" key={metric.label}>
                <h2>{metric.label}</h2>
                <p>{metric.value}</p>
              </article>
            ))}
          </div>

          <section className="card stack" data-block="signals">
            <h2>直近シグナル（上位3件）</h2>
            {signals.length === 0 ? (
              <p className="helper-text">直近シグナルはありません。</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {signals.slice(0, 3).map((signal) => (
                  <article className="tile stack" key={signal.id} style={{ gap: 4 }}>
                    <strong>{signal.title || signal.summary || 'タイトルなし'}</strong>
                    <p className="helper-text">
                      {signal.type || '-'} / {signal.source || '-'} / 重要度: {signal.severity || '-'} / スコア:{' '}
                      {signal.score ?? '-'}
                    </p>
                    <p className="helper-text">観測日時: {formatDate(signal.observedAt ?? null)}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card stack" data-block="opportunities">
            <h2>改善候補（上位5件）</h2>
            {opportunities.length === 0 ? (
              <p className="helper-text">改善候補はありません。</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {opportunities.slice(0, 5).map((item, index) => (
                  <article className="tile stack" key={item.id} style={{ gap: 4 }}>
                    <strong>
                      {index + 1}. {item.title}
                    </strong>
                    <p className="helper-text">
                      スコア: {item.score ?? '-'} / 確度: {item.confidence ?? '-'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
