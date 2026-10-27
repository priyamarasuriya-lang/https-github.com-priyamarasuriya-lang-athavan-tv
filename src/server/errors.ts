/** Typed application errors mapped to HTTP status codes by the API layer. */

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STALE_VERSION'
  | 'LOCKED'
  | 'INVALID_TRANSITION'
  | 'SCHEDULE_HAS_CONFLICTS'
  | 'REASON_REQUIRED'
  | 'SEPARATION_OF_DUTIES'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STALE_VERSION: 409,
  LOCKED: 423,
  INVALID_TRANSITION: 409,
  SCHEDULE_HAS_CONFLICTS: 422,
  REASON_REQUIRED: 400,
  SEPARATION_OF_DUTIES: 403,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
  get status(): number {
    return STATUS[this.code];
  }
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found.`);
export const forbidden = (msg = 'You do not have permission to perform this action.') => new AppError('FORBIDDEN', msg);
