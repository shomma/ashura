import { requireUser } from '@/lib/auth';
import { ensureSingleSite, toSingleSiteOptions } from '@/lib/single-site';
import { setActiveSite } from '../../actions';
import ContentHealthClient from './ContentHealthClient';

export const dynamic = 'force-dynamic';

export default async function ContentHealthPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return (
    <ContentHealthClient
      sites={toSingleSiteOptions(activeSite)}
      activeSite={{ id: activeSite.id, name: activeSite.name }}
      activeSiteId={activeSite.id}
      setActiveSiteAction={setActiveSite}
    />
  );
}
