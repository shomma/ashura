'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import OperationFlowGuide from '../../../../components/OperationFlowGuide';

type ReadinessCheck = {
  id: string;
  label: string;
  required: boolean;
  ready: boolean;
  howTo: string;
  detail?: string;
};

type ConnectionTestResult = {
  ready: boolean;
  detail: string;
};

type Props = {
  activeSiteId: string | null;
};

export default function ApiSettingsClient({ activeSiteId }: Props) {
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<ReadinessCheck[]>([]);
  const [testResults, setTestResults] = useState<Record<string, ConnectionTestResult>>({});

  const loadData = useCallback(async () => {
    if (!activeSiteId) return;
    setLoading(true);
    setError(null);
    try {
      const readinessRes = await fetch(`/api/v1/settings/api-readiness?siteId=${encodeURIComponent(activeSiteId)}`);
      const readinessJson = await readinessRes.json();
      if (!readinessRes.ok || !readinessJson?.ok) {
        throw new Error(readinessJson?.error?.message || '準備状況の取得に失敗しました');
      }
      setChecks((readinessJson.data?.checks || []) as ReadinessCheck[]);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [activeSiteId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const requiredChecks = useMemo(() => checks.filter((item) => item.required), [checks]);
  const completionRate = useMemo(() => {
    if (!requiredChecks.length) return 0;
    const readyCount = requiredChecks.filter((item) => item.ready).length;
    return Math.round((readyCount / requiredChecks.length) * 100);
  }, [requiredChecks]);
  const requiredReadyCount = useMemo(
    () => requiredChecks.filter((item) => item.ready).length,
    [requiredChecks]
  );

  async function testConnection(checkId: string, options?: { reload?: boolean; silent?: boolean }) {
    if (!activeSiteId) return;
    const reload = options?.reload ?? true;
    const silent = options?.silent ?? false;
    setSavingKey(`test-${checkId}`);
    if (!silent) {
      setError(null);
      setMessage(null);
    }
    try {
      const res = await fetch('/api/v1/settings/api-connections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: activeSiteId,
          checkId
        })
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error?.message || '接続テストに失敗しました');
      }
      const ready = Boolean(json.data?.ready);
      const detail = String(json.data?.detail || '');
      setTestResults((prev) => ({ ...prev, [checkId]: { ready, detail } }));
      if (!silent) {
        setMessage(`${checkLabel(checkId)} の接続テストを実行しました`);
      }
      if (reload) {
        await loadData();
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setSavingKey(null);
    }
  }

  async function testRequiredConnections() {
    if (!requiredChecks.length) return;
    setSavingKey('test-required-all');
    setError(null);
    setMessage(null);
    try {
      for (const check of requiredChecks) {
        await testConnection(check.id, { reload: false, silent: true });
      }
      await loadData();
      setMessage('必要な接続を一括テストしました');
    } finally {
      setSavingKey(null);
    }
  }

  if (!activeSiteId) {
    return <p className="helper-text">設定を初期化しています。</p>;
  }

  return (
    <section className="page-shell" data-page="settings-api">
      <div className="page-header">
        <div>
          <p className="helper-text">接続設定</p>
          <h1 className="page-title">ASHURA接続チェック</h1>
          <p className="page-subtitle">
            番組表取得とGemini記事下書き生成に必要な準備だけを確認します。
          </p>
        </div>
        <div className="stack">
          {loading ? <span className="helper-text">読み込み中...</span> : null}
          {message ? <span className="pill success">{message}</span> : null}
          {error ? <span className="pill danger">{error}</span> : null}
        </div>
      </div>

      <OperationFlowGuide
        current="settings-api"
        aiBusy={loading || Boolean(savingKey)}
        aiLabel={loading || Boolean(savingKey) ? '接続状態を確認中です' : undefined}
      />

      <div className="card section-card api-focus-card">
        <div className="section-scroll stack">
          <h3 style={{ margin: 0 }}>準備状況</h3>
          <p className="helper-text">
            進捗 {requiredReadyCount}/{requiredChecks.length}（{completionRate}%）
          </p>
          <div className="api-progress-track" role="presentation">
            <div className="api-progress-value" style={{ width: `${completionRate}%` }} />
          </div>
          <div className="tile stack">
            <p className="helper-text">1. Render環境変数に Gemini API キーを設定</p>
            <p className="helper-text">2. 番組表取得が利用できることを確認</p>
            <p className="helper-text">3. 一括テストで記事下書き生成の準備を確認</p>
            <div className="row">
              <button
                className="primary-button"
                type="button"
                onClick={testRequiredConnections}
                disabled={Boolean(savingKey)}
              >
                {savingKey === 'test-required-all' ? 'テスト中...' : '必要な接続を一括テスト'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card section-card">
        <div className="section-scroll stack">
          <h3 style={{ margin: 0 }}>必要な接続</h3>
          <p className="helper-text">未設定の項目があれば対応してください。</p>
          <div className="stack">
            {requiredChecks.map((item) => {
              const test = testResults[item.id];
              return (
                <div key={item.id} className="tile stack api-check-tile">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <strong>{item.label}</strong>
                    <span className={`pill ${item.ready ? 'success' : 'warning'}`}>
                      {item.ready ? '準備完了' : '未設定'}
                    </span>
                  </div>
                  {item.detail ? <p className="helper-text">{item.detail}</p> : null}
                  <p className="helper-text">対応方法: {item.howTo}</p>
                  <div className="row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => testConnection(item.id)}
                      disabled={savingKey === `test-${item.id}`}
                    >
                      {savingKey === `test-${item.id}` ? 'テスト中...' : '接続テスト'}
                    </button>
                    {test ? (
                      <span className={`pill ${test.ready ? 'success' : 'warning'}`}>
                        {test.ready ? '成功' : '要確認'}: {test.detail}
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card section-card">
        <div className="section-scroll stack">
          <h3 style={{ margin: 0 }}>次の操作</h3>
          <p className="helper-text">
            準備ができたら、番組表から候補を探して需要・競合を見ながら記事下書きを生成します。
          </p>
          <div className="row">
            <a className="secondary-button" href="/dashboard/channel">
              番組表AIプランナーへ
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function checkLabel(checkId: string) {
  if (checkId === 'gemini') return 'Gemini';
  if (checkId === 'epg') return '番組表取得';
  return checkId;
}
