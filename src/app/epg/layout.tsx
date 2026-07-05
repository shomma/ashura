import { ReactNode } from 'react';
import { requireUser } from '@/lib/auth';
import { setActiveSite } from '@/app/dashboard/actions';
import AppShell from '@/components/AppShell';
import { ensureSingleSite, toSingleSiteOptions } from '@/lib/single-site';

export const dynamic = 'force-dynamic';

export default async function EpgLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const activeSite = await ensureSingleSite();

  return (
    <AppShell
      userName={user.name}
      sites={toSingleSiteOptions(activeSite)}
      activeSiteId={activeSite.id}
      setActiveSiteAction={setActiveSite}
    >
      {children}
    </AppShell>
  );
}
