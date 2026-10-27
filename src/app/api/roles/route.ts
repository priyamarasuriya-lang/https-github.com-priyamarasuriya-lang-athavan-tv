import { api } from '@/server/http';
import { listRoles } from '@/server/services/users';

export const GET = api({ permission: 'users.manage' }, async ({ actor }) => {
  const roles = await listRoles(actor);
  return roles.map((r) => ({ key: r.key, name: r.name, description: r.description, permissions: r.permissions.map((p) => p.permission.key).sort() }));
});
