import { requireUser } from '@/lib/auth';
import { ensureSingleSite, toSingleSiteOptions } from '@/lib/single-site';
import ModelInsightsClient from './ModelInsightsClient';

export const dynamic = 'force-dynamic';

export default async function ModelInsightsPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <ModelInsightsClient activeSiteId={activeSite.id} sites={toSingleSiteOptions(activeSite)} />;
}
