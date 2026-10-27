import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { MediaManager } from './media-manager';

export const metadata = { title: 'Media library' };

export default async function MediaPage() {
  const { actor, allowed } = await pageActor('content.view');
  if (!allowed) return <Forbidden what="the media library" />;
  return (
    <>
      <PageHeader title="Media library" subtitle="Uploaded media assets and their metadata." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Media library' }]} />
      <MediaManager canUpload={actor.permissions.has('media.upload')} />
    </>
  );
}
