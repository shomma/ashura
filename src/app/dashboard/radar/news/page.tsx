import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import RadarNewsClient from './RadarNewsClient';

export const dynamic = 'force-dynamic';

export default async function RadarNewsPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <RadarNewsClient activeSiteId={activeSite.id} />;
}
