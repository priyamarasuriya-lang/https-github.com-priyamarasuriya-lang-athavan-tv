import { api } from '@/server/http';

export const GET = api({}, async ({ actor }) => ({
  id: actor.id,
  name: actor.name,
  email: actor.email,
  roles: actor.roles,
  permissions: [...actor.permissions].sort(),
}));
