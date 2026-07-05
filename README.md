# ASHURA

ASHURAは、番組表を取得し、登録キーワードとの一致から需要・競合を調べ、Geminiで記事タイトル案と記事構成案を作るためのNext.jsアプリです。

外部投稿先、運用サイト、外部メトリクスサービスとの接続機能は含めません。APIキーやログイン情報はリポジトリに保存せず、運用環境の環境変数で管理します。

## 開発コマンド

```bash
npm install
npm run prisma:generate
npm run dev
npm run lint
npx tsc --noEmit --pretty false
npm run build
```

## 主な画面

- `/dashboard/channel`: 番組表取得と取得結果の確認
- `/dashboard/watchwords`: 登録キーワード管理
- `/dashboard/keywords/discovery`: 需要競合調査
- `/dashboard/recommendations`: 記事タイトル案と記事構成案の生成
- `/dashboard/settings/api`: Geminiと番組表取得の準備状況確認

## 環境変数

- `DATABASE_URL`: PrismaのSQLite接続先
- `GEMINI_API_KEY`: Gemini連携用
- `GEMINI_MODEL`: Geminiモデル名。未設定時はアプリ側の既定値を使用
- `SERPAPI_KEY`: 検索結果調査にSerpAPIを使う場合のみ設定

`.env` やAPIキー値はコミットしないでください。
