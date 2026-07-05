'use client';

import SiteSwitcher from '../../../components/SiteSwitcher';
import OperationFlowGuide from '../../../components/OperationFlowGuide';
import GeminiContextSetter from '@/components/gemini/GeminiContextSetter';
import { buildContextString } from '@/lib/ai/context';

type TaskItem = {
  id: string;
  title: string;
  action: string;
  source: string;
  status: string;
  dueAt?: string | null;
  createdAt: string;
};

type ActiveSite = {
  id: string;
  name: string;
};

type Props = {
  tasks: TaskItem[];
  activeSite: ActiveSite | null;
  sites: { id: string; name: string }[];
  activeSiteId: string | null;
  setActiveSiteAction: (formData: FormData) => void;
};

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ja-JP');
}

export default function TasksClient({ tasks, activeSite, sites, activeSiteId, setActiveSiteAction }: Props) {
  const geminiContext = buildContextString({
    page: 'task-board',
    activeSite,
    taskCount: tasks.length,
    tasks: tasks.slice(0, 20)
  });

  const nextTask = tasks[0] ?? null;

  return (
    <div className="page-shell" data-page="tasks-list">
      <GeminiContextSetter contextKey="tasks" contextLabel="タスクボード" context={geminiContext} />
      <div className="page-header">
        <div>
          <p className="helper-text">公開ステップ</p>
          <h1 className="page-title">次のタスクを1件だけ実行</h1>
          <p className="page-subtitle">最初の1件だけ終わらせればOKです。終わったら次のタスクが自動で先頭になります。</p>
        </div>
      </div>

      <OperationFlowGuide current="tasks" />

      <div className="page-sections">
        <section className="card section-card stack">
          <h2 style={{ margin: 0 }}>1. サイトを確認</h2>
          {sites.length === 0 ? (
            <p className="helper-text">サイトが設定されていません。</p>
          ) : (
            <SiteSwitcher sites={sites} activeSiteId={activeSiteId} setActiveSiteAction={setActiveSiteAction} />
          )}
          {activeSite ? (
            <div className="tile stack" style={{ gap: 4 }}>
              <strong>{activeSite.name}</strong>
            </div>
          ) : null}
        </section>

        <section className="card section-card stack" data-block="next-task">
          <h2 style={{ margin: 0 }}>2. 今やるタスク</h2>
          {!nextTask ? (
            <p className="helper-text">未完了タスクはありません。</p>
          ) : (
            <>
              <div className="tile stack" style={{ gap: 6 }}>
                <strong>{nextTask.title}</strong>
                <p className="helper-text">
                  種別: {formatActionLabel(nextTask.action)} / ソース: {formatSourceLabel(nextTask.source)}
                </p>
                <p className="helper-text">
                  状態: {formatStatusLabel(nextTask.status)} / 期限: {formatDate(nextTask.dueAt ?? null)}
                </p>
              </div>
              <a className="primary-button operation-big-action" href={`/dashboard/tasks/${encodeURIComponent(nextTask.id)}`}>
                このタスクを開く
              </a>
            </>
          )}

          {tasks.length > 1 ? (
            <details>
              <summary className="helper-text">残り {tasks.length - 1} 件を見る</summary>
              <div className="stack" style={{ marginTop: 10 }}>
                {tasks.slice(1, 6).map((task) => (
                  <div key={task.id} className="tile stack" style={{ gap: 4 }}>
                    <strong>{task.title}</strong>
                    <span className="helper-text">
                      {formatActionLabel(task.action)} / {formatStatusLabel(task.status)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function formatActionLabel(action: string) {
  if (action === 'write') return '新規執筆';
  if (action === 'touch') return '更新';
  if (action === 'rewrite') return 'リライト';
  return action || '-';
}

function formatSourceLabel(source: string) {
  if (source === 'epg') return '番組表';
  if (source === 'yahoo') return 'ヤフーニュース';
  if (source === 'recommendation') return '提案';
  if (source === 'manual') return '手動';
  return source || '-';
}

function formatStatusLabel(status: string) {
  if (status === 'pending') return '未着手';
  if (status === 'in_progress') return '進行中';
  if (status === 'blocked') return '保留';
  if (status === 'done') return '完了';
  return status || '-';
}
