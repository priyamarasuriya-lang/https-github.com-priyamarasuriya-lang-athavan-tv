import { CatalogPage } from '@/components/content/catalog-page';

export const metadata = { title: 'Programs' };

export default function ProgramsPage() {
  return <CatalogPage title="Programs" subtitle="Series, shows and recurring programming." categories={['PROGRAM']} />;
}
