'use server';

import { redirect } from 'next/navigation';
import { setActiveSiteCookie } from '@/lib/sites';
import { ensureSingleSite } from '@/lib/single-site';

export async function setActiveSite(formData: FormData) {
  const redirectTo = formData.get('redirectTo')?.toString() || '/dashboard/channel';
  const site = await ensureSingleSite();

  setActiveSiteCookie(site.id);
  redirect(redirectTo);
}
