import { requireUser } from '@/lib/auth';
import { ensureSingleSite, toSingleSiteOptions } from '@/lib/single-site';
import { setActiveSite } from '../../actions';
import TaskDetailClient from './TaskDetailClient';

type Props = {
  params: {
    taskId: string;
  };
};

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({ params }: Props) {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return (
    <TaskDetailClient
      taskId={params.taskId}
      activeSite={{ id: activeSite.id, name: activeSite.name }}
      activeSiteId={activeSite.id}
      setActiveSiteAction={setActiveSite}
      sites={toSingleSiteOptions(activeSite)}
    />
  );
}
