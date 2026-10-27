import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { listChannels } from '@/server/services/catalog';
import { SchedulesBrowser } from './schedules-browser';

export const metadata = { title: 'Broadcast schedule' };

export default async function SchedulesPage() {
  const { actor, allowed } = await pageActor('schedule.view');
  if (!allowed) return <Forbidden what="schedules" />;
  const channels = await listChannels(actor);
  return (
    <>
      <PageHeader title="Broadcast schedule" subtitle="Daily, weekly and monthly schedules per channel." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Broadcast schedule' }]} />
      <SchedulesBrowser channels={channels.map((c) => ({ id: c.id, name: c.name, code: c.code }))} canEdit={actor.permissions.has('schedule.edit')} />
    </>
  );
}
