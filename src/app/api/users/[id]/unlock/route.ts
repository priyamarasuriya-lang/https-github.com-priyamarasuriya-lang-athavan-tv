import { api } from '@/server/http';
import { unlockUser } from '@/server/services/users';

export const POST = api<{ id: string }>({ permission: 'users.manage' }, async ({ actor, params }) => unlockUser(actor, params.id));
