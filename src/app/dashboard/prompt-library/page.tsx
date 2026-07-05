import { requireUser } from '@/lib/auth';
import { ensureSingleSite } from '@/lib/single-site';
import PromptLibraryClient from './PromptLibraryClient';

export default async function PromptLibraryPage() {
  await requireUser();
  const activeSite = await ensureSingleSite();

  return <PromptLibraryClient activeSiteId={activeSite.id} />;
}
