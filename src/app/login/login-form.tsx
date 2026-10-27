'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/client/api';

export function LoginForm({ next, expired }: { next: string; expired: boolean }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/login', { body: { email, password } });
      window.location.assign(next);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-4" noValidate>
      {expired && !error && <Alert tone="warning">Your session expired. Please sign in again.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Email">{(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Field label="Password">
        {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary" loading={busy} className="mt-2 h-10">
        Sign in
      </Button>
    </form>
  );
}
