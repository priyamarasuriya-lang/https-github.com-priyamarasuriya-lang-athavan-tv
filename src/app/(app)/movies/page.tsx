import { CatalogPage } from '@/components/content/catalog-page';

export const metadata = { title: 'Movies & films' };

export default function MoviesPage() {
  return <CatalogPage title="Movies & films" subtitle="Feature films with ratings, rights windows and licensing." categories={['MOVIE']} />;
}
