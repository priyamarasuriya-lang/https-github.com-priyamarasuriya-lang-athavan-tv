import { api, parseJson } from '@/server/http';
import { createUser, listUsers } from '@/server/services/users';
import { userCreateSchema } from '@/server/validators/catalog';

export const GET = api({ permission: 'users.manage' }, async ({ actor }) => listUsers(actor));
export const POST = api({ permission: 'users.manage' }, async ({ actor, req }) => createUser(actor, await parseJson(req, userCreateSchema)));
