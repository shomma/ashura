'use client';

import { useMemo, useState } from 'react';
import GeminiContextSetter from '@/components/gemini/GeminiContextSetter';
import { buildContextString } from '@/lib/ai/context';

type RecommendationItem = {
  id: string;
  siteId: string;
  dedupeKey: string;
  type: string;
  title: string;
  reason: string;
  evidence: unknown;
  priority: number;
  expectedImpact: string | null;
  status: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DraftPlan = {
  title: string;
  excerpt: string;
  content: string;
  generatedAt: string;
};

type Props = {
  activeSite: { id: string; name: string } | null;
  recommendations: RecommendationItem[];
};

export default function RecommendationsClient({
  activeSite,
  recommendations: initialRecommendations
}: Props) {
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>(
    initialRecommendations
  );
  const [draftPlans, setDraftPlans] = useState<Record<string, DraftPlan>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasSite = Boolean(activeSite?.id);
  const geminiContext = useMemo(
    () =>
      buildContextString({
        page: '記事下書き',
        activeSite,
        recommendations: recommendations.slice(0, 10).map((item) => ({
          id: item.id,
          title: item.title,
          type: item.type,
          priority: item.priority,
          reason: item.reason
        })),
        recommendationCount: recommendations.length
      }),
    [activeSite, recommendations]
  );

  async function runGenerate() {
    if (!activeSite?.id) return;
    setBusyKey('generate');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/recommendations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: activeSite.id })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || '提案作成に失敗しました');

      const listRes = await fetch('/api/recommendations', { cache: 'no-store' });
      const listJson = await listRes.json();
      if (listRes.ok) {
        setRecommendations(listJson.items || []);
      }
      const generated = Number(json?.summary?.generated ?? 0);
      setMessage(
        generated > 0
          ? `調査済みの番組表ヒットから記事ネタ提案を${generated.toLocaleString()}件作成しました`
          : '提案はありません。先に番組表取得と需要競合調査を完了してください'
      );
      setMessage(
        generated > 0
          ? `調査済みの番組表ヒットから記事ネタ提案を${generated.toLocaleString()}件追加しました`
          : '追加できる提案はありません。番組表取得と需要競合調査を追加で実行してください'
      );
    } catch (e: any) {
      setError(e?.message ? String(e.message) : '提案作成に失敗しました');
    } finally {
      setBusyKey(null);
    }
  }

  async function generateDraftPlan(item: RecommendationItem) {
    setBusyKey(`draft-${item.id}`);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/ai/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titleHint: item.title,
          prompt: buildDraftPrompt(item)
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || '記事タイトル・構成の生成に失敗しました');
      }

      const draft = json.draft as { title?: string; excerpt?: string; content?: string };
      const draftTitle = String(draft?.title || '').trim();
      const draftContent = String(draft?.content || '').trim();
      if (!draftTitle || !draftContent) {
        throw new Error('Geminiの返答に記事タイトルまたは記事構成がありません');
      }

      setDraftPlans((current) => ({
        ...current,
        [item.id]: {
          title: draftTitle,
          excerpt: draft.excerpt || '',
          content: draftContent,
          generatedAt: new Date().toISOString()
        }
      }));
      setMessage('記事タイトルと記事構成を生成しました');
    } catch (e: any) {
      setError(e?.message ? String(e.message) : '記事タイトル・構成の生成に失敗しました');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="page-shell recommendations-page">
      <GeminiContextSetter
        contextKey="recommendations"
        contextLabel="記事下書き"
        context={geminiContext}
      />
      <div className="page-header">
        <div>
          <p className="helper-text">ASHURA FLOW</p>
          <h1 className="page-title">記事下書き</h1>
          <p className="page-subtitle">
            番組表取得と需要競合調査が終わったデータから記事ネタを作り、提案ごとにGeminiで記事タイトルと記事構成を生成します。
          </p>
        </div>
        <div className="stack">
          {message && <div className="pill success">{message}</div>}
          {error && <div className="pill danger">{error}</div>}
        </div>
      </div>

      <div className="page-sections">
        <div className="card section-card">
          <div className="section-scroll stack">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>1. 提案作成</h3>
                <p className="helper-text" style={{ marginTop: 6 }}>
                  取得済み番組表の中で登録キーワードにヒットし、需要競合調査まで完了したネタだけを一覧へ追加します。
                </p>
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={runGenerate}
                disabled={!hasSite || busyKey === 'generate'}
              >
                {busyKey === 'generate' ? '提案作成中...' : '記事ネタ提案を作成'}
              </button>
            </div>
          </div>
        </div>

        <div className="card section-card wide-xl">
          <div className="section-scroll stack">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>2. 提案一覧</h3>
              <span className="pill">提案 {recommendations.length.toLocaleString()} 件</span>
            </div>
            {recommendations.length === 0 ? (
              <div className="helper-text">
                提案がありません。先に登録キーワードを用意し、番組表取得と需要競合調査を実行してから「記事ネタ提案を作成」を押してください。
              </div>
            ) : (
              <div className="recommendation-list">
                {recommendations.map((item) => {
                  const plan = draftPlans[item.id];
                  return (
                    <article className="recommendation-list-item" key={item.id}>
                      <div className="recommendation-main">
                        <div className="recommendation-meta-row">
                          <span className="pill">{typeLabel(item.type)}</span>
                          <span className={`pill ${item.priority >= 80 ? 'warning' : ''}`}>
                            優先度 {item.priority}
                          </span>
                        </div>
                        <h4>{item.title}</h4>
                        <p className="helper-text">{item.reason}</p>
                        {item.evidence != null && (
                          <details>
                            <summary className="helper-text">根拠データ</summary>
                            <pre className="code-block" style={{ maxHeight: 140 }}>
                              {formatEvidence(item.evidence)}
                            </pre>
                          </details>
                        )}
                      </div>
                      <div className="stack recommendation-draft-cell">
                        <button
                          className="primary-button recommendation-draft-button"
                          type="button"
                          onClick={() => generateDraftPlan(item)}
                          disabled={busyKey === `draft-${item.id}`}
                        >
                          {busyKey === `draft-${item.id}`
                            ? 'Geminiで生成中...'
                            : 'このネタで記事タイトルと記事構成を生成'}
                        </button>
                        {plan ? (
                          <div className="plan-draft-card recommendation-draft-output">
                            <div className="stack">
                              <div>
                                <span className="helper-text">記事タイトル案</span>
                                <h4 style={{ margin: '4px 0 0' }}>{plan.title}</h4>
                              </div>
                              {plan.excerpt ? <p className="helper-text">{plan.excerpt}</p> : null}
                              <pre className="code-block">{plan.content}</pre>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildDraftPrompt(item: RecommendationItem) {
  return [
    '以下の提案を記事化するための記事タイトル案と記事構成案を作成してください。',
    '',
    '必須要件:',
    '- title は最有力の記事タイトルを1本だけ返す。',
    '- excerpt はこの記事で狙う検索意図と読者メリットを80字以内で説明する。',
    '- content はMarkdownで返す。',
    '- content には必ず「## タイトル案」「## 記事構成」「## 本文で確認すること」「## 狙うキーワード」を含める。',
    '- 記事構成はH2/H3相当で、各見出しに書くべき要点を箇条書きにする。',
    '- 未確認のプロフィール、出演事実、年齢、結婚、病気、死亡、不祥事などを断定しない。',
    '- 番組表と需要競合調査由来の情報は、本文を書く前に確認すべき事項として明示する。',
    '',
    '提案データ:',
    JSON.stringify(
      {
        type: item.type,
        title: item.title,
        reason: item.reason,
        priority: item.priority,
        evidence: item.evidence,
        createdAt: item.createdAt
      },
      null,
      2
    )
  ].join('\n');
}

function typeLabel(type: string) {
  if (type === 'rewrite') return 'リライト';
  if (type === 'foresight') return '先回り';
  if (type === 'linking') return '内部リンク';
  if (type === 'expansion') return '横展開';
  return type;
}

function formatEvidence(value: unknown) {
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    return parsed == null ? value : JSON.stringify(parsed, null, 2);
  }
  return JSON.stringify(value, null, 2);
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
