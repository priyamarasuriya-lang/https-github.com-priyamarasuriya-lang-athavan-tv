'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Card, Field, Input, Spinner } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';

type Values = Record<string, string | number | boolean>;

export function SettingsForm() {
  const toast = useToast();
  const [values, setValues] = useState<Values | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ values: Values; labels: Record<string, string> }>('/api/settings')
      .then((r) => (setValues(r.values), setLabels(r.labels)))
      .catch((e) => setError(errorMessage(e)));
  }, []);
  if (error && !values) return <Alert tone="error">{error}</Alert>;
  if (!values) return <Spinner />;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      setValues(await api<Values>('/api/settings', { method: 'PUT', body: values }));
      toast('Settings saved');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="General" actions={<Button variant="primary" onClick={save} loading={busy}>Save settings</Button>}>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <div className="grid max-w-2xl gap-4">
        {Object.entries(values).map(([k, v]) =>
          typeof v === 'boolean' ? (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={v} onChange={(e) => setValues({ ...values, [k]: e.target.checked })} /> {labels[k] ?? k}
            </label>
          ) : (
            <Field key={k} label={labels[k] ?? k}>
              {(id) => <Input id={id} type={typeof v === 'number' ? 'number' : 'text'} value={String(v)} onChange={(e) => setValues({ ...values, [k]: typeof v === 'number' ? Number(e.target.value) : e.target.value })} />}
            </Field>
          ),
        )}
      </div>
      <p className="mt-4 text-xs text-muted">Password-reset emails are not configured (no mail service is integrated). Administrators reset passwords from User Management.</p>
    </Card>
  );
}
