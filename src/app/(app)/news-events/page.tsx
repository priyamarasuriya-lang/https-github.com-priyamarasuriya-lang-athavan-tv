import { CatalogPage } from '@/components/content/catalog-page';

export const metadata = { title: 'News & special events' };

export default function NewsEventsPage() {
  return <CatalogPage title="News & special events" subtitle="Bulletins, live broadcasts and special events." categories={['NEWS', 'LIVE', 'SPECIAL_EVENT']} />;
}
