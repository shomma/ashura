import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import ScoringSettingsClient from './ScoringSettingsClient';

export const dynamic = 'force-dynamic';

export default async function ScoringSettingsPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <ScoringSettingsClient activeSiteId={activeSite.id} />;
}
