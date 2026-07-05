import prisma from '@/lib/prisma';
import { setActiveSite } from '@/app/dashboard/actions';
import { ensureSingleSite, toSingleSiteOptions } from '@/lib/single-site';
import TasksClient from './TasksClient';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const activeSite = await ensureSingleSite();
  let serializedTasks: Array<{
    id: string;
    title: string;
    action: string;
    source: string;
    status: string;
    dedupeKey: string;
    dueAt: string | null;
    payload?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  }> = [];

  try {
    const tasks = await prisma.task.findMany({
      where: { siteId: activeSite.id, status: { not: 'done' } },
      orderBy: { createdAt: 'desc' }
    });

    serializedTasks = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      action: task.action,
      source: task.source,
      status: task.status,
      dedupeKey: task.dedupeKey,
      dueAt: task.recommendedDueAt ? task.recommendedDueAt.toISOString() : null,
      payload:
        task.payload && typeof task.payload === 'object' && !Array.isArray(task.payload)
          ? (task.payload as Record<string, unknown>)
          : undefined,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    }));
  } catch (error) {
    console.error('[tasks/page] failed to load sites or tasks from prisma, using empty fallback', error);
  }

  return (
    <TasksClient
      tasks={serializedTasks}
      activeSite={{
        id: activeSite.id,
        name: activeSite.name
      }}
      sites={toSingleSiteOptions(activeSite)}
      activeSiteId={activeSite.id}
      setActiveSiteAction={setActiveSite}
    />
  );
}
