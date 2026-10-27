'use client';

import { Button } from '@/components/ui/primitives';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl bg-white p-8 text-center shadow-sm ring-1 ring-line" role="alert">
      <h1 className="text-lg font-semibold text-navy-900">Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">{error.digest ? `Reference: ${error.digest}` : 'The page could not be loaded.'}</p>
      <Button className="mt-4" variant="primary" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
