import { api } from '@/server/http';
import { verifyMediaStorage } from '@/server/services/media';

export const POST = api({ permission: 'media.upload' }, async ({ actor }) => verifyMediaStorage(actor));
