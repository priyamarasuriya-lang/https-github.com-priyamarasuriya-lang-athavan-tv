import { configureTestDatabase } from './env';

// Runs before each integration test file imports application modules (and thus the Prisma client).
configureTestDatabase();
