'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type KeywordDetail = {
  id: string;
  term: string;
  intent: string | null;
  status: string;
  priority: number;
  volume: number | null;
  difficulty: number | null;
  serps: Array<{
    id: string;
    provider: string;
    rank: number | null;
    title: string | null;
    url: string | null;
    fetchedAt: string;
  }>;
  signals: Array<{
    id: string;
    type: string;
    source: string;
    severity: string;
    score: number;
    title: string;
    observedAt: string;
  }>;
  opportunities: Array<{
    id: string;
    title: string;
    status: string;
    href: string;
  }>;
  opportunitiesCtaHref: string;
  keywordGraph?: {
    nodes: Array<{ id: string; label: string; type: string; score: number }>;
    edges: Array<{ from: string; to: string; relation: string; weight: number }>;
    clusters: Array<{ id: string; label: string; count: number }>;
  };
};

type Props = {
  keywordId: string;
  activeSiteId: string | null;
};

const DEMO_DETAIL: KeywordDetail = {
  id: 'demo-keyword',
  term: 'デモキーワード',
  intent: 'informational',
  status: 'active',
  priority: 50,
  volume: null,
  difficulty: null,
  serps: [],
  signals: [],
  opportunities: [],
  opportunitiesCtaHref: '/dashboard/opportunities?keywordId=demo-keyword',
  keywordGraph: {
    nodes: [{ id: 'kw:demo-keyword', label: 'デモキーワード', type: 'keyword', score: 50 }],
    edges: [],
    clusters: [{ id: 'keyword', label: 'キーワード', count: 1 }]
  }
};

export default function KeywordDetailClient({ keywordId, activeSiteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<KeywordDetail | null>(null);

  useEffect(() => {
    if (!activeSiteId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/keywords/${encodeURIComponent(keywordId)}?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          throw new Error(json?.error?.message || 'キーワード詳細の取得に失敗しました');
        }
        if (!cancelled) setDetail(json.data as KeywordDetail);
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
  }, [activeSiteId, keywordId]);

  const current = detail ?? (!activeSiteId ? DEMO_DETAIL : null);

  return (
    <section className="panel stack" data-page="keyword-detail">
      <h1>キーワード詳細</h1>
      {!activeSiteId && <p className="helper-text">サイトを選択すると実データを表示します。</p>}
      {loading && <p className="helper-text">読み込み中です...</p>}
      {error && <p className="pill danger">{error}</p>}

      {current && (
        <>
          <div className="card stack">
            <h2>{current.term}</h2>
            <p className="helper-text">
              意図: {formatIntent(current.intent)} / 状態: {formatStatusLabel(current.status)} / 優先度: {current.priority}
            </p>
            <Link
              className="primary-button"
              data-testid="keywords-to-opportunities-cta"
              href={current.opportunitiesCtaHref}
            >
              改善機会一覧へ
            </Link>
          </div>

          <div className="card stack">
            <h2>検索結果スナップショット</h2>
            {current.serps.length === 0 ? (
              <p className="helper-text">検索結果データはありません。</p>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>取得元</th>
                      <th>順位</th>
                      <th>タイトル</th>
                      <th>取得日時</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.serps.map((serp) => (
                      <tr key={serp.id}>
                        <td>{serp.provider}</td>
                        <td>{serp.rank ?? '-'}</td>
                        <td>{serp.title ?? serp.url ?? '-'}</td>
                        <td>{new Date(serp.fetchedAt).toLocaleString('ja-JP')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card stack">
            <h2>シグナル</h2>
            {current.signals.length === 0 ? (
              <p className="helper-text">シグナルデータはありません。</p>
            ) : (
              <ul className="stack">
                {current.signals.map((signal) => (
                  <li key={signal.id}>
                    [{signal.type}] {signal.title} ({signal.severity}, {signal.score.toFixed(2)})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card stack">
            <h2>キーワードグラフ</h2>
            {current.keywordGraph && current.keywordGraph.nodes.length > 0 ? (
              <>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>ノード</th>
                        <th>種別</th>
                        <th>スコア</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.keywordGraph.nodes.map((node) => (
                        <tr key={node.id}>
                          <td>{node.label}</td>
                          <td>{node.type}</td>
                          <td>{node.score.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>始点</th>
                        <th>終点</th>
                        <th>関係</th>
                        <th>重み</th>
                      </tr>
                    </thead>
                    <tbody>
                      {current.keywordGraph.edges.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="helper-text">
                            エッジデータはありません。
                          </td>
                        </tr>
                      ) : (
                        current.keywordGraph.edges.map((edge, index) => (
                          <tr key={`${edge.from}-${edge.to}-${index}`}>
                            <td>{edge.from}</td>
                            <td>{edge.to}</td>
                            <td>{edge.relation}</td>
                            <td>{edge.weight.toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="helper-text">グラフデータはありません。</p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function formatStatusLabel(status: string) {
  if (status === 'active') return '有効';
  if (status === 'inactive') return '無効';
  if (status === 'open') return '未対応';
  if (status === 'in_progress') return '進行中';
  if (status === 'pending') return '保留';
  if (status === 'done') return '完了';
  return status || '-';
}

function formatIntent(intent: string | null) {
  if (!intent) return '-';
  if (intent === 'informational') return '情報収集';
  if (intent === 'transactional') return '購買行動';
  if (intent === 'navigational') return '案内検索';
  if (intent === 'commercial') return '比較検討';
  return intent;
}
