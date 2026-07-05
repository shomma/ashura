import { requireUser } from '@/lib/auth';
import FlowSettingsClient from './FlowSettingsClient';

export const dynamic = 'force-dynamic';

export default async function FlowSettingsPage() {
  await requireUser();
  return <FlowSettingsClient />;
}
