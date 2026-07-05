import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import RadarProgramClient from './RadarProgramClient';

export const dynamic = 'force-dynamic';

export default async function RadarProgramPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <RadarProgramClient activeSiteId={activeSite.id} />;
}
