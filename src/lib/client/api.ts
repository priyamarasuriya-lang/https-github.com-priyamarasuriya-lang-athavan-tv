'use client';

/** Browser-side API client. Unwraps { data } envelopes and raises ApiError for { error } responses. */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body || init.form ? 'POST' : 'GET'),
    headers: init.form ? undefined : init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
    credentials: 'same-origin',
    signal: init.signal,
  });
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
    window.location.href = `/login?expired=1&next=${encodeURIComponent(window.location.pathname)}`;
  }
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { code: string; message: string; details?: unknown } } | null;
  if (!res.ok || !json || json.error) {
    throw new ApiError(res.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? `Request failed (${res.status})`, json?.error?.details);
  }
  return json.data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'VALIDATION_ERROR' && Array.isArray(e.details)) {
      return `${e.message} ${(e.details as Array<{ path: string; message: string }>).map((d) => `${d.path}: ${d.message}`).join('; ')}`;
    }
    return e.message;
  }
  if (e instanceof Error && e.name === 'AbortError') return '';
  return 'Unexpected error. Check your connection and try again.';
}
