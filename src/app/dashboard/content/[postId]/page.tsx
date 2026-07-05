import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import ContentDetailClient from './ContentDetailClient';

type Props = {
  params: {
    postId: string;
  };
};

export const dynamic = 'force-dynamic';

export default async function ContentDetailPage({ params }: Props) {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return (
    <ContentDetailClient
      postId={params.postId}
      activeSite={{ id: activeSite.id, name: activeSite.name }}
      activeSiteId={activeSite.id}
    />
  );
}
