'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SiteSwitcher from '../../../../components/SiteSwitcher';

type HealthItem = {
  id: string;
  segment: string;
  postId: string;
  title: string;
  impact: number;
  reason: string;
  confidence: number;
};

type HealthSummary = {
  total: number;
  drop: number;
  rankDown: number;
  highBounce: number;
  lowRevenue: number;
};

type ApiHealthResponse = {
  segment: string;
  summary: HealthSummary;
  items: HealthItem[];
};

type Props = {
  sites: { id: string; name: string }[];
  activeSite: { id: string; name: string } | null;
  activeSiteId: string | null;
  setActiveSiteAction: (formData: FormData) => void;
};

const SEGMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全体' },
  { value: 'drop', label: '急落' },
  { value: 'rankDown', label: '順位下落' },
  { value: 'highBounce', label: '高直帰率' },
  { value: 'lowRevenue', label: '低収益' }
];

export default function ContentHealthClient({
  sites,
  activeSite,
  activeSiteId,
  setActiveSiteAction
}: Props) {
  const [segment, setSegment] = useState('all');
  const [items, setItems] = useState<HealthItem[]>([]);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSite = Boolean(activeSite?.id);

  useEffect(() => {
    if (!activeSite?.id) {
      setItems([]);
      setSummary(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const q = new URLSearchParams({ siteId: activeSite.id });
    if (segment !== 'all') q.set('segment', segment);

    fetch(`/api/v1/content/health?${q.toString()}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; data?: ApiHealthResponse; error?: { message?: string } };
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || 'コンテンツ健全性の取得に失敗しました');
        }
        if (cancelled) return;
        setItems(json.data?.items ?? []);
        setSummary(json.data?.summary ?? null);
      })
      .catch((err: any) => {
        if (!cancelled) setError(String(err?.message || err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSite?.id, segment]);

  const displaySummary: HealthSummary = summary ?? {
    total: 0,
    drop: 0,
    rankDown: 0,
    highBounce: 0,
    lowRevenue: 0
  };

  return (
    <section className="panel stack" data-page="content-health">
      <h1>コンテンツ健全性</h1>
      <p className="helper-text">劣化優先度の高い記事を見つけます。</p>

      <div className="card section-card">
        <div className="section-scroll stack">
          {sites.length === 0 ? (
            <p className="helper-text">サイトが未登録です。先にサイトを追加してください。</p>
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
            <p className="helper-text">健全性データを表示するにはサイトを選択してください。</p>
          )}
        </div>
      </div>

      {!hasSite && <p className="helper-text">内部設定を初期化しています。</p>}
      {loading && <p className="helper-text">読み込み中です...</p>}
      {error && <p className="pill danger">{error}</p>}

      {hasSite && (
        <>
          <div className="card-grid">
            <article className="card">
              <h2>総件数</h2>
              <p>{displaySummary.total}</p>
            </article>
            <article className="card">
              <h2>急落</h2>
              <p>{displaySummary.drop}</p>
            </article>
            <article className="card">
              <h2>順位下落</h2>
              <p>{displaySummary.rankDown}</p>
            </article>
            <article className="card">
              <h2>高直帰率</h2>
              <p>{displaySummary.highBounce}</p>
            </article>
            <article className="card">
              <h2>低収益</h2>
              <p>{displaySummary.lowRevenue}</p>
            </article>
          </div>

          <div className="card section-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>セグメント</h2>
              <div className="row">
                {SEGMENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={segment === opt.value ? 'primary-button' : 'secondary-button'}
                    type="button"
                    onClick={() => setSegment(opt.value)}
                    style={{ marginLeft: 8 }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card stack">
            <h2>健全性カード</h2>
            {items.length === 0 ? (
              <p className="helper-text">このセグメントに該当するデータはありません。</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>タイトル</th>
                      <th>セグメント</th>
                      <th style={{ minWidth: 140 }}>影響度</th>
                      <th style={{ minWidth: 140 }}>確度</th>
                      <th>理由</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.title}</td>
                        <td>{item.segment}</td>
                        <td>{item.impact.toFixed(2)}</td>
                        <td>{item.confidence.toFixed(2)}</td>
                        <td>{item.reason || '-'}</td>
                        <td>
                          <Link href={`/dashboard/tasks?siteId=${encodeURIComponent(activeSiteId ?? '')}`}>タスク一覧</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
