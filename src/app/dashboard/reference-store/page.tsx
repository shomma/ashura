import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import ReferenceStoreClient from './ReferenceStoreClient';

export default async function ReferenceStorePage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <ReferenceStoreClient activeSiteId={activeSite.id} />;
}
