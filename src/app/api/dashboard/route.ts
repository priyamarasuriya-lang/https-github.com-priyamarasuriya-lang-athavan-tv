import { api } from '@/server/http';
import { dashboard } from '@/server/services/dashboard';

export const GET = api({ permission: 'schedule.view' }, async ({ actor }) => dashboard(actor));
