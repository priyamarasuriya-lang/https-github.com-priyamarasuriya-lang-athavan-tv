import { api } from '@/server/http';
import { approvalQueue } from '@/server/services/workflow';

export const GET = api({ permission: 'schedule.view' }, async ({ actor }) => approvalQueue(actor));
