import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import type { ContentCategory } from '@/lib/dto';
import { pageActor } from '@/server/auth/page-guard';
import { listChannels } from '@/server/services/catalog';
import { ContentCatalog } from './content-catalog';

/** Shared server wrapper for the category-specific catalogue pages. */
export async function CatalogPage({ title, subtitle, categories }: { title: string; subtitle: string; categories: ContentCategory[] }) {
  const { actor, allowed } = await pageActor('content.view');
  if (!allowed) return <Forbidden what={title.toLowerCase()} />;
  const channels = await listChannels(actor);
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: title }]} />
      <ContentCatalog categories={categories} channels={channels.map((c) => ({ id: c.id, name: c.name }))} canManage={actor.permissions.has('content.manage')} canApprove={actor.permissions.has('content.approve')} />
    </>
  );
}
