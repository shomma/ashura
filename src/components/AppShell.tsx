import { ReactNode } from 'react';
import SiteSwitcher from './SiteSwitcher';
import { GeminiContextProvider } from './gemini/GeminiContext';
import SidebarNav, { SidebarProgressStep } from './SidebarNav';
import WorkflowResetButton from './WorkflowResetButton';

type AppShellProps = {
  children: ReactNode;
  userName: string;
  sites: { id: string; name: string }[];
  activeSiteId: string | null;
  setActiveSiteAction: (formData: FormData) => void;
};

const PROGRESS_STEPS: SidebarProgressStep[] = [
  {
    id: 'watchwords',
    label: '登録キーワード',
    caption: '番組表に照合したい語句を登録・ON/OFF',
    href: '/dashboard/watchwords',
    matchPrefixes: ['/dashboard/watchwords']
  },
  {
    id: 'channel-planner',
    label: '番組表取得',
    caption: '番組表データを取得して保存',
    href: '/dashboard/channel',
    matchPrefixes: ['/dashboard/channel', '/dashboard/command-center', '/dashboard/radar']
  },
  {
    id: 'keyword-research',
    label: '需要・競合調査',
    caption: '取得済み番組表からキーワードヒットと競合を確認',
    href: '/dashboard/keywords/discovery',
    matchPrefixes: ['/dashboard/keywords', '/dashboard/opportunities']
  },
  {
    id: 'article-production',
    label: '記事下書き',
    caption: 'タイトル案、構成案、本文下書き',
    href: '/dashboard/recommendations',
    matchPrefixes: ['/dashboard/tasks', '/dashboard/recommendations', '/dashboard/insights']
  }
];

export default function AppShell({
  children,
  userName: _userName,
  sites,
  activeSiteId,
  setActiveSiteAction
}: AppShellProps) {
  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="logo">ASHURA</div>
        <SiteSwitcher
          sites={sites}
          activeSiteId={activeSiteId}
          setActiveSiteAction={setActiveSiteAction}
        />
        <SidebarNav steps={PROGRESS_STEPS} />
        <WorkflowResetButton />
        <div className="sidebar-footer">記事下書きワークフロー</div>
      </aside>
      <div className="dashboard-content">
        <GeminiContextProvider>
          <div className="dashboard-body">{children}</div>
        </GeminiContextProvider>
      </div>
    </div>
  );
}
