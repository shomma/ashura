import Link from 'next/link';
import { ensureSingleSite } from '@/lib/single-site';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const activeSite = await ensureSingleSite();

  return (
    <section className="page-shell" data-page="settings">
      <div className="page-header">
        <div>
          <p className="helper-text">設定</p>
          <h1 className="page-title">設定メニュー</h1>
          <p className="page-subtitle">
            {activeSite.name} の番組検索、需要・競合調査、記事下書き生成に必要な設定を管理します。
          </p>
        </div>
      </div>
      <div className="card-grid">
        <article className="card">
          <h2>接続設定</h2>
          <p className="helper-text">Geminiと番組表取得の準備状況を確認します。</p>
          <Link className="secondary-button" href="/dashboard/settings/api">
            接続設定へ
          </Link>
        </article>
        <article className="card">
          <h2>スコア設定</h2>
          <p className="helper-text">候補ランキングの重みや除外条件を調整します。</p>
          <Link className="secondary-button" href="/dashboard/settings/scoring">
            スコア設定へ
          </Link>
        </article>
        <article className="card">
          <h2>アラート設定</h2>
          <p className="helper-text">注目候補や調査対象の通知条件を調整します。</p>
          <Link className="secondary-button" href="/dashboard/settings/alerts">
            アラート設定へ
          </Link>
        </article>
      </div>
    </section>
  );
}
