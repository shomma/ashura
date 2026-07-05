'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { WatchKeywordDto } from '@/lib/epg/types';
import GeminiContextSetter from '@/components/gemini/GeminiContextSetter';
import { buildContextString } from '@/lib/ai/context';

type KeywordCategory = 'person' | 'group' | 'topic';

type PriorityLevel = 'urgent' | 'focus' | 'normal' | 'inactive';

type SortMode = 'priority' | 'recent' | 'name';

type EnrichedWatchword = WatchKeywordDto & {
  category: KeywordCategory;
  categorySource: 'auto' | 'manual';
  monthlyTrendIndex: number | null;
  latestTrendIndex: number | null;
  priorityScore: number;
  priorityLevel: PriorityLevel;
};

type Props = {
  initialWatchwords: WatchKeywordDto[];
  defaultKeywords: string[];
  loadError?: string | null;
};

const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  person: '人物名',
  group: 'グループ・作品',
  topic: 'トピック'
};

const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  urgent: '最優先',
  focus: '注目',
  normal: '通常',
  inactive: '停止中'
};

const GROUP_HINTS = [
  '46',
  '48',
  'stones',
  'timelesz',
  'snow man',
  'king & prince',
  'candy tune',
  'niziu',
  'yoasobi',
  'mrs. green apple',
  'novelbright',
  'vaundy',
  'ado'
];

const TOPIC_HINTS = ['地雷チャン', 'ハウスダスト', 'キャンマジ', 'バルサミコ', 'MON7'];

const PERSON_PATTERN = /^[ぁ-ゟ゠-ヿ一-龯々ー]{2,8}(?:\s[ぁ-ゟ゠-ヿ一-龯々ー]{1,8})?$/u;
const GROUP_PATTERN = /[A-Z]{2,}|[0-9]|[&!./]/u;
const CATEGORY_OVERRIDE_STORAGE_KEY = 'ashura_watchwords_category_overrides_v1';

export default function WatchwordsClient({ initialWatchwords, defaultKeywords, loadError }: Props) {
  const [watchwords, setWatchwords] = useState<WatchKeywordDto[]>(initialWatchwords);
  const [newKeyword, setNewKeyword] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | KeywordCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [priorityFilter, setPriorityFilter] = useState<'all' | PriorityLevel>('all');
  const [sortMode, setSortMode] = useState<SortMode>('priority');
  const [categoryOverrideByKeyword, setCategoryOverrideByKeyword] = useState<Record<string, KeywordCategory>>({});

  const sortedWatchwords = useMemo(
    () =>
      [...watchwords].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [watchwords]
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }),
    []
  );

  const resetStatus = () => {
    setMessage(null);
    setError(null);
  };

  const enrichedWatchwords = useMemo<EnrichedWatchword[]>(() => {
    return sortedWatchwords.map((item) => {
      const monthlyTrendIndex = null;
      const latestTrendIndex = null;
      const overrideCategory = categoryOverrideByKeyword[item.keyword];
      const { priorityScore, priorityLevel } = calcPriority({
        active: item.active,
        monthlyTrendIndex,
        latestTrendIndex,
        createdAt: item.createdAt
      });
      return {
        ...item,
        category: overrideCategory ?? classifyKeyword(item.keyword),
        categorySource: overrideCategory ? 'manual' : 'auto',
        monthlyTrendIndex,
        latestTrendIndex,
        priorityScore,
        priorityLevel
      };
    });
  }, [sortedWatchwords, categoryOverrideByKeyword]);

  const summaryCards = useMemo(() => {
    const grouped = new Map<KeywordCategory, { total: number; active: number; urgent: number }>();
    for (const row of enrichedWatchwords) {
      const found = grouped.get(row.category) ?? { total: 0, active: 0, urgent: 0 };
      found.total += 1;
      if (row.active) found.active += 1;
      if (row.priorityLevel === 'urgent') found.urgent += 1;
      grouped.set(row.category, found);
    }
    return (['person', 'group', 'topic'] as const).map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      total: grouped.get(category)?.total ?? 0,
      active: grouped.get(category)?.active ?? 0,
      urgent: grouped.get(category)?.urgent ?? 0
    }));
  }, [enrichedWatchwords]);

  const activeCount = useMemo(
    () => enrichedWatchwords.filter((item) => item.active).length,
    [enrichedWatchwords]
  );
  const manualCategoryCount = useMemo(
    () => Object.keys(categoryOverrideByKeyword).length,
    [categoryOverrideByKeyword]
  );

  const urgentWatchwords = useMemo(
    () =>
      enrichedWatchwords
        .filter((item) => item.priorityLevel === 'urgent')
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 12),
    [enrichedWatchwords]
  );

  const filteredWatchwords = useMemo(() => {
    const normalizedQuery = searchKeyword.trim().toLowerCase();
    const filtered = enrichedWatchwords.filter((item) => {
      if (statusFilter === 'active' && !item.active) return false;
      if (statusFilter === 'inactive' && item.active) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (priorityFilter !== 'all' && item.priorityLevel !== priorityFilter) return false;
      if (normalizedQuery && !item.keyword.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    });

    if (sortMode === 'recent') {
      return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    if (sortMode === 'name') {
      return filtered.sort((a, b) => a.keyword.localeCompare(b.keyword, 'ja'));
    }
    return filtered.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [enrichedWatchwords, searchKeyword, statusFilter, categoryFilter, priorityFilter, sortMode]);

  const geminiContext = useMemo(
    () =>
      buildContextString({
        page: 'キーワードリスト',
        total: sortedWatchwords.length,
        filtered: filteredWatchwords.length,
        activeCount,
        urgentCount: urgentWatchwords.length,
        manualCategoryCount,
        defaultKeywordsCount: defaultKeywords.length,
        watchwords: filteredWatchwords,
        categorySummary: summaryCards
      }),
    [
      sortedWatchwords.length,
      filteredWatchwords,
      activeCount,
      urgentWatchwords.length,
      manualCategoryCount,
      defaultKeywords.length,
      summaryCards
    ]
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CATEGORY_OVERRIDE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') return;
      const normalized: Record<string, KeywordCategory> = {};
      for (const [keyword, value] of Object.entries(parsed)) {
        if (isKeywordCategory(value)) normalized[keyword] = value;
      }
      setCategoryOverrideByKeyword(normalized);
    } catch {
      // ignore broken local cache
    }
  }, []);

  useEffect(() => {
    try {
      if (Object.keys(categoryOverrideByKeyword).length === 0) {
        window.localStorage.removeItem(CATEGORY_OVERRIDE_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(CATEGORY_OVERRIDE_STORAGE_KEY, JSON.stringify(categoryOverrideByKeyword));
    } catch {
      // storage may be unavailable
    }
  }, [categoryOverrideByKeyword]);

  useEffect(() => {
    const keywordSet = new Set(watchwords.map((item) => item.keyword));
    setCategoryOverrideByKeyword((prev) => {
      const next: Record<string, KeywordCategory> = {};
      let changed = false;
      for (const [keyword, category] of Object.entries(prev)) {
        if (keywordSet.has(keyword)) {
          next[keyword] = category;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [watchwords]);

  async function addKeyword(event?: FormEvent) {
    event?.preventDefault();
    const keywords = splitKeywords(newKeyword);
    if (!keywords.length) return;
    setAdding(true);
    resetStatus();
    try {
      const res = await fetch('/api/epg/watchwords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '追加に失敗しました');
      const nextWatchwords = Array.isArray(json.items) ? json.items : [];
      setWatchwords(nextWatchwords);
      setNewKeyword('');
      setMessage(`キーワードを追加しました (${keywords.length}件)。`);
    } catch (err: any) {
      setError(err?.message ? String(err.message) : '追加に失敗しました');
    } finally {
      setAdding(false);
    }
  }

  async function toggleKeyword(id: string, active: boolean) {
    setBusyId(id);
    resetStatus();
    try {
      const res = await fetch(`/api/epg/watchwords/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '更新に失敗しました');
      const nextWatchwords = Array.isArray(json.items) ? json.items : [];
      setWatchwords(nextWatchwords);
      setMessage('ステータスを更新しました。');
    } catch (err: any) {
      setError(err?.message ? String(err.message) : '更新に失敗しました');
    } finally {
      setBusyId(null);
    }
  }

  async function removeKeyword(id: string) {
    setBusyId(id);
    resetStatus();
    try {
      const res = await fetch(`/api/epg/watchwords/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '削除に失敗しました');
      const nextWatchwords = Array.isArray(json.items) ? json.items : [];
      setWatchwords(nextWatchwords);
      setMessage('キーワードを削除しました。');
    } catch (err: any) {
      setError(err?.message ? String(err.message) : '削除に失敗しました');
    } finally {
      setBusyId(null);
    }
  }

  function updateCategoryOverride(keyword: string, value: 'auto' | KeywordCategory) {
    setCategoryOverrideByKeyword((prev) => {
      const next = { ...prev };
      if (value === 'auto') {
        delete next[keyword];
      } else {
        next[keyword] = value;
      }
      return next;
    });
    setMessage(value === 'auto' ? 'カテゴリ上書きを解除しました。' : 'カテゴリを手動設定しました。');
  }

  function clearCategoryOverrides() {
    if (!confirm('カテゴリ上書きをすべて解除しますか？')) return;
    setCategoryOverrideByKeyword({});
    setMessage('カテゴリ上書きをすべて解除しました。');
  }

  return (
    <div className="page-shell watchwords-page" data-page="watchwords">
      <GeminiContextSetter
        contextKey="watchwords"
        contextLabel="キーワードリスト"
        context={geminiContext}
      />
      <div className="page-header">
        <div>
          <p className="helper-text">登録キーワード</p>
          <h1 className="page-title">登録キーワード</h1>
          <p className="page-subtitle">
            番組表の中から検索したい人物名・番組名・話題語を登録します。ONの語句だけを番組検索で使います。
          </p>
        </div>
        <div className="stack">
          {loadError && <div className="pill warning">{loadError}</div>}
          {message && <div className="pill success">{message}</div>}
          {error && <div className="pill danger">{error}</div>}
        </div>
      </div>

      <div className="page-sections">
        <div className="card section-card wide-xl">
          <div className="section-scroll stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0 }}>登録済みキーワード</h3>
              <span className="helper-text">全 {sortedWatchwords.length} 件 / 表示 {filteredWatchwords.length} 件</span>
            </div>
            <div className="watchwords-summary-grid" data-testid="watchwords-summary">
              <div className="watchwords-summary-card">
                <p className="helper-text">有効キーワード</p>
                <strong>{activeCount} 件</strong>
              </div>
              <div className="watchwords-summary-card urgent">
                <p className="helper-text">最優先</p>
                <strong>{urgentWatchwords.length} 件</strong>
              </div>
              <div className="watchwords-summary-card">
                <p className="helper-text">手動カテゴリ</p>
                <strong>{manualCategoryCount} 件</strong>
              </div>
              {summaryCards.map((item) => (
                <div key={item.category} className="watchwords-summary-card">
                  <p className="helper-text">{item.label}</p>
                  <strong>{item.total} 件</strong>
                  <span className="helper-text">
                    有効 {item.active} / 最優先 {item.urgent}
                  </span>
                </div>
              ))}
            </div>
            <div className="watchwords-priority-list" data-testid="watchwords-priority-list">
              <h4 style={{ margin: 0 }}>今すぐ見るキーワード（最優先）</h4>
              {urgentWatchwords.length === 0 ? (
                <p className="helper-text" style={{ margin: 0 }}>
                  最優先キーワードはありません。トレンド指数を更新して確認してください。
                </p>
              ) : (
                <div className="watchwords-chip-grid">
                  {urgentWatchwords.map((item) => (
                    <span key={item.id} className="pill danger">
                      {item.keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <form onSubmit={addKeyword} className="row watchwords-add-row">
              <input
                type="text"
                placeholder="キーワードをカンマ区切りで追加"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                disabled={adding}
                className="flex-1"
              />
              <button type="submit" className="primary-button" disabled={adding}>
                {adding ? '追加中…' : 'キーワードを追加'}
              </button>
            </form>
            <div className="watchwords-filter-grid" data-testid="watchwords-filters">
              <label className="stack" style={{ gap: 6 }}>
                <span className="helper-text">キーワード検索</span>
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  placeholder="例: 内田雄馬"
                />
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="helper-text">カテゴリ</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as 'all' | KeywordCategory)}
                >
                  <option value="all">すべて</option>
                  <option value="person">人物名</option>
                  <option value="group">グループ・作品</option>
                  <option value="topic">トピック</option>
                </select>
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="helper-text">状態</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                >
                  <option value="active">有効のみ</option>
                  <option value="all">すべて</option>
                  <option value="inactive">停止中のみ</option>
                </select>
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="helper-text">優先度</span>
                <select
                  value={priorityFilter}
                  onChange={(e) =>
                    setPriorityFilter(e.target.value as 'all' | 'urgent' | 'focus' | 'normal' | 'inactive')
                  }
                >
                  <option value="all">すべて</option>
                  <option value="urgent">最優先</option>
                  <option value="focus">注目</option>
                  <option value="normal">通常</option>
                  <option value="inactive">停止中</option>
                </select>
              </label>
              <label className="stack" style={{ gap: 6 }}>
                <span className="helper-text">並び順</span>
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="priority">優先度順</option>
                  <option value="recent">登録日順</option>
                  <option value="name">名前順</option>
                </select>
              </label>
            </div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="helper-text">カテゴリは行ごとに手動修正できます（保存: このブラウザ）。</span>
              <button
                type="button"
                className="secondary-button"
                onClick={clearCategoryOverrides}
                disabled={manualCategoryCount === 0}
              >
                手動カテゴリを全解除
              </button>
            </div>
            <p className="helper-text">
              カンマ区切りでまとめて追加できます。表記ゆれは「スペース / | 改行」などで区切って複数登録すると吸収できます。
            </p>
            <div className="table-wrapper" data-testid="watchwords-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>キーワード</th>
                    <th>カテゴリ</th>
                    <th>優先度</th>
                    <th>月間トレンド指数</th>
                    <th>ステータス</th>
                    <th>登録日</th>
                    <th style={{ width: 220 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWatchwords.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <p className="helper-text" style={{ margin: 0 }}>
                          条件に一致するキーワードがありません。フィルタを調整してください。
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredWatchwords.map((w) => {
                      return (
                        <tr key={w.id}>
                          <td data-label="キーワード" style={{ fontWeight: 700 }}>{w.keyword}</td>
                          <td data-label="カテゴリ">
                            <div className="watchwords-category-editor">
                              <span className={`pill ${w.categorySource === 'manual' ? 'warning' : ''}`}>
                                {CATEGORY_LABELS[w.category]}
                              </span>
                              <select
                                data-testid="watchword-category-select"
                                value={categoryOverrideByKeyword[w.keyword] ?? 'auto'}
                                onChange={(e) =>
                                  updateCategoryOverride(w.keyword, e.target.value as 'auto' | KeywordCategory)
                                }
                              >
                                <option value="auto">自動判定</option>
                                <option value="person">人物名</option>
                                <option value="group">グループ・作品</option>
                                <option value="topic">トピック</option>
                              </select>
                            </div>
                          </td>
                          <td data-label="優先度">
                            <span className={`pill ${priorityPillClass(w.priorityLevel)}`}>
                              {PRIORITY_LABELS[w.priorityLevel]} ({w.priorityScore})
                            </span>
                          </td>
                          <td data-label="月間トレンド">
                            {typeof w.monthlyTrendIndex === 'number' ? (
                              <div className="row" style={{ gap: 8 }}>
                                <span className="pill">{w.monthlyTrendIndex}</span>
                                <span className="helper-text">
                                  最新: {typeof w.latestTrendIndex === 'number' ? w.latestTrendIndex : '-'}
                                </span>
                              </div>
                            ) : (
                              <span className="helper-text">-</span>
                            )}
                          </td>
                          <td data-label="ステータス">
                            <span className={`pill ${w.active ? 'success' : 'warning'}`}>
                              {w.active ? '有効' : '停止中'}
                            </span>
                          </td>
                          <td data-label="登録日">{dateFormatter.format(new Date(w.createdAt))}</td>
                          <td data-label="操作">
                            <div className="row">
                              <button
                                type="button"
                                onClick={() => toggleKeyword(w.id, !w.active)}
                                disabled={busyId === w.id}
                                className="secondary-button"
                              >
                                {w.active ? '無効化' : '有効化'}
                              </button>
                              <button
                                type="button"
                                onClick={() => removeKeyword(w.id)}
                                disabled={busyId === w.id}
                                className="danger-button"
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function splitKeywords(value: string) {
  return value
    .split(/[,\n、]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isKeywordCategory(value: unknown): value is KeywordCategory {
  return value === 'person' || value === 'group' || value === 'topic';
}

function classifyKeyword(keyword: string): KeywordCategory {
  const trimmed = keyword.trim();
  if (!trimmed) return 'topic';

  const normalized = trimmed.toLowerCase();
  if (GROUP_HINTS.some((hint) => normalized.includes(hint))) {
    return 'group';
  }

  if (TOPIC_HINTS.some((hint) => trimmed.includes(hint))) {
    return 'topic';
  }

  if (GROUP_PATTERN.test(trimmed)) {
    return 'group';
  }

  if (PERSON_PATTERN.test(trimmed)) {
    return 'person';
  }

  return 'topic';
}

function calcPriority(input: {
  active: boolean;
  monthlyTrendIndex: number | null;
  latestTrendIndex: number | null;
  createdAt: string;
}): { priorityScore: number; priorityLevel: PriorityLevel } {
  if (!input.active) {
    return { priorityScore: 0, priorityLevel: 'inactive' };
  }

  const trendBase = input.monthlyTrendIndex ?? input.latestTrendIndex ?? 18;
  const ageMs = Date.now() - new Date(input.createdAt).getTime();
  const ageDays = Math.floor(ageMs / 86400000);
  const recencyBonus = ageDays <= 3 ? 20 : ageDays <= 14 ? 10 : 0;
  const score = clamp(Math.round(20 + trendBase * 0.8 + recencyBonus), 1, 100);

  if (score >= 75) {
    return { priorityScore: score, priorityLevel: 'urgent' };
  }
  if (score >= 45) {
    return { priorityScore: score, priorityLevel: 'focus' };
  }
  return { priorityScore: score, priorityLevel: 'normal' };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function priorityPillClass(level: PriorityLevel) {
  if (level === 'urgent') return 'danger';
  if (level === 'focus') return 'warning';
  if (level === 'inactive') return 'warning';
  return 'success';
}
