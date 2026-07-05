import ChannelClient from '@/app/dashboard/channel/ChannelClient';
import { ensureSingleSite } from '@/lib/single-site';

export const dynamic = 'force-dynamic';

export default async function DashboardChannelPage() {
  const start = toTokyoDateInput(0);
  const end = toTokyoDateInput(6);
  const activeSite = await ensureSingleSite();

  return (
    <ChannelClient
      defaultStart={start}
      defaultEnd={end}
      activeSiteId={activeSite?.id ?? null}
    />
  );
}

function toTokyoDateInput(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
