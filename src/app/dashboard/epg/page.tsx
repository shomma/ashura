import { redirect } from 'next/navigation';

export default function LegacyEpgRedirectPage() {
  redirect('/dashboard/channel');
}
