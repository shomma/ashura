import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import KeywordDetailClient from './KeywordDetailClient';

type Props = {
  params: {
    id: string;
  };
};

export const dynamic = 'force-dynamic';

export default async function KeywordDetailPage({ params }: Props) {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <KeywordDetailClient keywordId={params.id} activeSiteId={activeSite.id} />;
}
