'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type RadarItem = {
  id: string;
  severity: string;
  score: number;
  title: string;
  summary: string | null;
  observedAt: string;
  actionLabel: string;
  actionHref: string;
};

type Props = {
  activeSiteId: string | null;
};

const DEMO_ITEMS: RadarItem[] = [
  {
    id: 'radar-news-demo',
    severity: 'info',
    score: 0,
    title: 'デモニュースシグナル',
    summary: 'サイト未選択のため、導線検証用のデモ行を表示しています。',
    observedAt: new Date().toISOString(),
    actionLabel: '施策候補を見る',
    actionHref: '/dashboard/opportunities?source=radar-news-demo'
  }
];

export default function RadarNewsClient({ activeSiteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<RadarItem[]>([]);

  useEffect(() => {
    if (!activeSiteId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/dashboard/radar/news?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || 'ニュースレーダーの取得に失敗しました');
        }
        if (!cancelled) setItems((json.data?.items || []) as RadarItem[]);
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

  const rows = activeSiteId ? items : DEMO_ITEMS;

  return (
    <section className="panel stack" data-page="radar-news">
      <h1>ニュースレーダー</h1>
      {!activeSiteId && <p className="helper-text">サイト未選択のためデモ表示です。</p>}
      {loading && <p className="helper-text">読み込み中です...</p>}
      {error && <p className="pill danger">{error}</p>}
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>タイトル</th>
              <th>重要度</th>
              <th>スコア</th>
              <th>観測日時</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.title}
                  {item.summary && <div className="helper-text">{item.summary}</div>}
                </td>
                <td>{formatSeverity(item.severity)}</td>
                <td>{item.score.toFixed(2)}</td>
                <td>{new Date(item.observedAt).toLocaleString('ja-JP')}</td>
                <td>
                  <Link href={item.actionHref}>{item.actionLabel}</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="helper-text">
                  ニュースシグナルはまだありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatSeverity(value: string) {
  if (value === 'critical') return '緊急';
  if (value === 'warning') return '注意';
  if (value === 'info') return '情報';
  return value;
}
