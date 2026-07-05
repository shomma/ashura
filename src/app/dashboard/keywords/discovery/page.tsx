import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import KeywordDiscoveryClient from './KeywordDiscoveryClient';

export const dynamic = 'force-dynamic';

type SearchParams = {
  start?: string;
  end?: string;
  autostart?: string;
};

type KeywordDiscoveryPageProps = {
  searchParams?: SearchParams;
};

export default async function KeywordDiscoveryPage({ searchParams }: KeywordDiscoveryPageProps) {
  await requireUser();
  const activeSite = await ensureSingleSite();

  const prefillStartDate = typeof searchParams?.start === 'string' ? searchParams.start : '';
  const prefillEndDate = typeof searchParams?.end === 'string' ? searchParams.end : '';
  const autoStart = searchParams?.autostart === '1';

  return (
    <KeywordDiscoveryClient
      activeSiteId={activeSite.id}
      prefillStartDate={prefillStartDate}
      prefillEndDate={prefillEndDate}
      autoStart={autoStart}
    />
  );
}
