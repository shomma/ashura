import { requireUser } from '@/lib/auth';
import { DEFAULT_WATCHWORDS, listWatchKeywords, seedWatchKeywords } from '@/lib/epg/ingest';
import WatchwordsClient from './WatchwordsClient';

export default async function WatchwordsPage() {
  await requireUser();
  let watchwords = [] as Awaited<ReturnType<typeof listWatchKeywords>>;
  let loadError: string | null = null;
  try {
    await seedWatchKeywords(DEFAULT_WATCHWORDS);
    watchwords = await listWatchKeywords();
  } catch {
    loadError =
      'データベース接続が未設定のため、キーワードを読み込めません。API設定または環境変数を確認してください。';
  }
  return (
    <WatchwordsClient
      initialWatchwords={watchwords}
      defaultKeywords={DEFAULT_WATCHWORDS}
      loadError={loadError}
    />
  );
}
