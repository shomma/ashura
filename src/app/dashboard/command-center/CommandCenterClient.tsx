'use client';

import { useEffect, useMemo, useState } from 'react';
import OperationFlowGuide from '../../../components/OperationFlowGuide';

type SummaryItem = {
  id: string;
  title: string;
  status: string;
  score: number;
  confidence: number;
};

type CommandCenterSummary = {
  todayTop10: { count: number; items: SummaryItem[] };
  alerts: { count: number };
  inProgress: { total: number };
  yesterdayDelta: { scoreDelta: number };
};

export default function CommandCenterClient({ activeSiteId }: { activeSiteId: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null);

  useEffect(() => {
    if (!activeSiteId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/v1/dashboard/command-center?siteId=${encodeURIComponent(activeSiteId)}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error?.message || '司令センターの取得に失敗しました');
        if (!cancelled) setSummary(json.data as CommandCenterSummary);
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

  const cards = useMemo(
    () => [
      { title: '候補テーマ', value: summary?.todayTop10.count ?? 0 },
      { title: '進行中タスク', value: summary?.inProgress.total ?? 0 },
      { title: '要確認アラート', value: summary?.alerts.count ?? 0 }
    ],
    [summary]
  );

  return (
    <section className="page-shell" data-page="command-center">
      <div className="page-header">
        <div>
          <p className="helper-text">ミッション開始</p>
          <h1 className="page-title">今日やることを1ステップずつ進めます</h1>
          <p className="page-subtitle">迷ったら「次へ」ボタンだけを押してください。</p>
        </div>
      </div>

      <OperationFlowGuide
        current="command-center"
        aiBusy={loading}
        aiLabel={loading ? 'AIが本日の状況を整理しています。' : undefined}
      />

      {!activeSiteId && <p className="helper-text">サイトを選択するとAIが当日の状況を読み込みます。</p>}
      {error && <p className="pill danger">{error}</p>}

      <div className="card-grid compact-three-grid">
        {cards.map((card) => (
          <article key={card.title} className="card">
            <h2>{card.title}</h2>
            <p>{card.value}</p>
          </article>
        ))}
      </div>

      {summary && summary.todayTop10.items.length > 0 ? (
        <section className="card stack" data-block="top-themes">
          <h2>AIが検出した注目テーマ（上位3件）</h2>
          <div className="stack" style={{ gap: 8 }}>
            {summary.todayTop10.items.slice(0, 3).map((item, index) => (
              <div key={item.id} className="tile stack" style={{ gap: 4 }}>
                <strong>
                  {index + 1}. {item.title}
                </strong>
                <p className="helper-text">
                  状態: {formatStatusLabel(item.status)} / スコア: {item.score.toFixed(2)} / 確度: {item.confidence.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function formatStatusLabel(status: string) {
  if (status === 'open') return '未対応';
  if (status === 'in_progress') return '進行中';
  if (status === 'pending') return '保留';
  if (status === 'done') return '完了';
  if (status === 'blocked') return '停止中';
  return status || '-';
}
