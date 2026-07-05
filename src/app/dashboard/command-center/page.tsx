import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import CommandCenterClient from './CommandCenterClient';

export const dynamic = 'force-dynamic';

export default async function CommandCenterPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <CommandCenterClient activeSiteId={activeSite.id} />;
}
