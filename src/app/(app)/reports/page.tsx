import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { REPORT_KEYS, REPORT_TITLES } from '@/server/reports/builders';
import { listChannels } from '@/server/services/catalog';
import { ReportsView } from './reports-view';

export const metadata = { title: 'Reports & analytics' };

export default async function ReportsPage() {
  const { actor, allowed } = await pageActor('reports.view');
  if (!allowed) return <Forbidden what="reports" />;
  const channels = actor.permissions.has('schedule.view') || actor.permissions.has('content.view') || actor.permissions.has('ads.view') ? await listChannels(actor) : [];
  return (
    <>
      <PageHeader title="Reports & analytics" subtitle="Operational reports with PDF, Excel and CSV export." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Reports' }]} />
      <ReportsView reports={REPORT_KEYS.map((k) => ({ key: k, title: REPORT_TITLES[k] }))} channels={channels.map((c) => ({ id: c.id, name: c.name }))} canExport={actor.permissions.has('reports.export')} />
    </>
  );
}
