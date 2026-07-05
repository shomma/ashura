import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import OpportunitiesClient from './OpportunitiesClient';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <OpportunitiesClient activeSiteId={activeSite.id} />;
}
