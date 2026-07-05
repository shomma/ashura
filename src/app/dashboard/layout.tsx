import { ReactNode } from 'react';
import { requireUser } from '@/lib/auth';
import { setActiveSite } from './actions';
import AppShell from '@/components/AppShell';
import { ensureSingleSite, toSingleSiteOptions } from '@/lib/single-site';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const activeSite = await ensureSingleSite();
  const siteOptions = toSingleSiteOptions(activeSite);

  return (
    <AppShell
      userName={user.name ?? 'Guest'}
      sites={siteOptions}
      activeSiteId={activeSite.id}
      setActiveSiteAction={setActiveSite}
    >
      {children}
    </AppShell>
  );
}
