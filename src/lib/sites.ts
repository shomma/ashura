import { cookies } from 'next/headers';

export const ACTIVE_SITE_COOKIE = 'ashura_active_site';

export function getActiveSiteIdFromCookies() {
  return cookies().get(ACTIVE_SITE_COOKIE)?.value ?? null;
}

export function setActiveSiteCookie(siteId: string) {
  cookies().set(ACTIVE_SITE_COOKIE, siteId, {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });
}

export function clearActiveSiteCookie() {
  cookies().delete(ACTIVE_SITE_COOKIE);
}
