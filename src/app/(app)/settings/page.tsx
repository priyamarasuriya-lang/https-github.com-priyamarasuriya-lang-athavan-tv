import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { SettingsForm } from './settings-form';

export const metadata = { title: 'System settings' };

export default async function SettingsPage() {
  const { allowed } = await pageActor('settings.manage');
  if (!allowed) return <Forbidden what="system settings" />;
  return (
    <>
      <PageHeader title="System settings" subtitle="Station-wide configuration. Changes are audited." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Settings' }]} />
      <SettingsForm />
    </>
  );
}
