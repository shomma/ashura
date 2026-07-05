import { ensureSingleSite } from '@/lib/single-site';
import ApiSettingsClient from './ApiSettingsClient';

export const dynamic = 'force-dynamic';

export default async function ApiSettingsPage() {
  const activeSite = await ensureSingleSite();

  return <ApiSettingsClient activeSiteId={activeSite.id} />;
}
