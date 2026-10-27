import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { ChannelsManager } from './channels-manager';

export const metadata = { title: 'Channels & playout' };

export default async function ChannelsPage() {
  const { actor, allowed } = await pageActor('schedule.view');
  if (!allowed) return <Forbidden what="channels" />;
  return (
    <>
      <PageHeader title="Channels & playout" subtitle="Channel time zones, broadcast-day boundaries and scheduling rules." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Channels & playout' }]} />
      <ChannelsManager canManage={actor.permissions.has('channel.manage')} />
    </>
  );
}
