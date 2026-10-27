import { api, parseJson } from '@/server/http';
import { updateUser } from '@/server/services/users';
import { userUpdateSchema } from '@/server/validators/catalog';

export const PUT = api<{ id: string }>({ permission: 'users.manage' }, async ({ actor, req, params }) => updateUser(actor, params.id, await parseJson(req, userUpdateSchema)));
