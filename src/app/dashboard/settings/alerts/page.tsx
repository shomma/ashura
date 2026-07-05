import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import AlertsSettingsClient from './AlertsSettingsClient';

export const dynamic = 'force-dynamic';

export default async function AlertsSettingsPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <AlertsSettingsClient activeSiteId={activeSite.id} />;
}
