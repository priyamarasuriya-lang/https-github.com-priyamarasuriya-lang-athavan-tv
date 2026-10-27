import { CatalogPage } from '@/components/content/catalog-page';

export const metadata = { title: 'Promotions & fillers' };

export default function PromotionsPage() {
  return <CatalogPage title="Promotions & fillers" subtitle="Promos, fillers, slides, station IDs and public service announcements." categories={['PROMO', 'FILLER', 'SLIDE', 'STATION_ID', 'PSA']} />;
}
