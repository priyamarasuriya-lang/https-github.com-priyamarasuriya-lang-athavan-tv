import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { listChannels } from '@/server/services/catalog';
import { BreaksManager } from './breaks-manager';

export const metadata = { title: 'Timers & breaks' };

export default async function BreaksPage() {
  const { actor, allowed } = await pageActor('ads.view');
  if (!allowed) return <Forbidden what="break definitions" />;
  const channels = await listChannels(actor);
  return (
    <>
      <PageHeader title="Timers & breaks" subtitle="Commercial break definitions with permitted duration ranges." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Timers & breaks' }]} />
      <BreaksManager channels={channels.map((c) => ({ id: c.id, name: c.name }))} canManage={actor.permissions.has('ads.manage')} />
    </>
  );
}
