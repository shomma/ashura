import { redirect } from 'next/navigation';

export default function PublicEpgRedirect() {
  redirect('/dashboard/channel');
}
