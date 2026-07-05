import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import RadarTrendClient from './RadarTrendClient';

export const dynamic = 'force-dynamic';

export default async function RadarTrendPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <RadarTrendClient activeSiteId={activeSite.id} />;
}
