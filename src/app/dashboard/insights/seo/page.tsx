import { requireUser } from '@/lib/auth';
import { ensureSingleSite, toSingleSiteOptions } from '@/lib/single-site';
import SeoInsightsClient from './SeoInsightsClient';

export const dynamic = 'force-dynamic';

export default async function SeoInsightsPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return (
    <SeoInsightsClient
      activeSiteId={activeSite.id}
      sites={toSingleSiteOptions(activeSite)}
    />
  );
}
