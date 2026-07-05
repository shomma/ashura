import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import OpportunityDetailClient from './OpportunityDetailClient';

type Props = {
  params: {
    id: string;
  };
};

export const dynamic = 'force-dynamic';

export default async function OpportunityDetailPage({ params }: Props) {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <OpportunityDetailClient opportunityId={params.id} activeSiteId={activeSite.id} />;
}
