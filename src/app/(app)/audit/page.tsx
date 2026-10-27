import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { AuditView } from './audit-view';

export const metadata = { title: 'Audit logs' };

export default async function AuditPage() {
  const { allowed } = await pageActor('audit.view');
  if (!allowed) return <Forbidden what="audit logs" />;
  return (
    <>
      <PageHeader title="Audit logs" subtitle="Append-only record of sign-ins, schedule changes, approvals, exports and administration." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Audit logs' }]} />
      <AuditView />
    </>
  );
}
