'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_UI_PREFERENCES,
  readUiPreferences,
  saveUiPreferences,
  type UiPreferences
} from '@/lib/uiPreferences';

export default function FlowSettingsClient() {
  const [preferences, setPreferences] = useState<UiPreferences>(DEFAULT_UI_PREFERENCES);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPreferences(readUiPreferences());
  }, []);

  function updatePreference(next: Partial<UiPreferences>) {
    const saved = saveUiPreferences(next);
    setPreferences(saved);
    setMessage('表示設定を保存しました。');
  }

  return (
    <section className="page-shell" data-page="settings-flow">
      <div className="page-header">
        <div>
          <p className="helper-text">導線設定</p>
          <h1 className="page-title">導線設定</h1>
          <p className="page-subtitle">
            番組検索、需要・競合調査、記事下書き生成の表示方法を調整します。
          </p>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          {message ? <span className="pill success">{message}</span> : null}
        </div>
      </div>

      <div className="card section-card">
        <div className="section-scroll stack">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.compactMainFlowGuide}
              onChange={(event) => updatePreference({ compactMainFlowGuide: event.target.checked })}
            />
            導線ガイドを簡易表示にする
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.articleDraftFocusModeByDefault}
              onChange={(event) =>
                updatePreference({ articleDraftFocusModeByDefault: event.target.checked })
              }
            />
            記事下書き生成を集中モードで開始する
          </label>
          <div className="row">
            <a className="secondary-button" href="/dashboard/channel">
              番組表AIプランナーで確認
            </a>
            <a className="secondary-button" href="/dashboard/command-center">
              司令センターで確認
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
