import { Forbidden } from '@/components/layout/forbidden';
import { PageHeader } from '@/components/ui/primitives';
import { pageActor } from '@/server/auth/page-guard';
import { UsersManager } from './users-manager';

export const metadata = { title: 'User management' };

export default async function UsersPage() {
  const { actor, allowed } = await pageActor('users.manage');
  if (!allowed) return <Forbidden what="user management" />;
  return (
    <>
      <PageHeader title="User management" subtitle="Accounts, roles and access. Role changes and deactivation sign the user out immediately." crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Users' }]} />
      <UsersManager currentUserId={actor.id} />
    </>
  );
}
