import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { listChannels } from '@/server/services/catalog';
import { AdsManager } from './ads-manager';

export const metadata = { title: 'Advertisements' };

export default async function AdvertisementsPage() {
  const { actor, allowed } = await pageActor('ads.view');
  if (!allowed) return <Forbidden what="advertising" />;
  const channels = await listChannels(actor);
  return (
    <>
      <PageHeader title="Advertisements" subtitle="Advertisers, campaigns, creatives and delivery against contracted airings." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Advertisements' }]} />
      <AdsManager channels={channels.map((c) => ({ id: c.id, name: c.name }))} canManage={actor.permissions.has('ads.manage')} />
    </>
  );
}
