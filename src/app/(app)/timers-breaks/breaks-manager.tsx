'use client';

import { Pencil, Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, Dialog, Field, Input, Select, StatusBadge, Table, Td, Th } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { formatDuration, parseDuration } from '@/lib/time/duration';

interface Break {
  id: string;
  name: string;
  channelId: string | null;
  channel: { name: string } | null;
  defaultDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  isActive: boolean;
}

export function BreaksManager({ channels, canManage }: { channels: Array<{ id: string; name: string }>; canManage: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Break[]>([]);
  const [editing, setEditing] = useState<Break | 'new' | null>(null);
  const load = useCallback(() => api<Break[]>('/api/breaks').then(setRows).catch((e) => toast(errorMessage(e), 'error')), [toast]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card
      title="Commercial breaks"
      accent="#94a3b8"
      actions={
        canManage && (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus className="size-4" /> New break
          </Button>
        )
      }
    >
      <Table caption="Break definitions">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Channel</Th>
            <Th>Default</Th>
            <Th>Allowed range</Th>
            <Th>Status</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <Td className="font-medium">{b.name}</Td>
              <Td>{b.channel?.name ?? 'All channels'}</Td>
              <Td className="tabular">{formatDuration(b.defaultDurationMs)}</Td>
              <Td className="tabular">
                {formatDuration(b.minDurationMs)} – {formatDuration(b.maxDurationMs)}
              </Td>
              <Td>
                <StatusBadge status={b.isActive ? 'ACTIVE' : 'ARCHIVED'} />
              </Td>
              <Td className="text-right">
                {canManage && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(b)} aria-label={`Edit ${b.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-muted">Breaks are placed in schedules from the editor’s library. Validation reports breaks outside their range, and over- or under-filled breaks.</p>
      {editing && <BreakForm item={editing === 'new' ? null : editing} channels={channels} onClose={() => setEditing(null)} onSaved={() => (setEditing(null), toast('Break saved'), load())} />}
    </Card>
  );
}

function BreakForm({ item, channels, onClose, onSaved }: { item: Break | null; channels: Array<{ id: string; name: string }>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [channelId, setChannelId] = useState(item?.channelId ?? '');
  const [def, setDef] = useState(item ? formatDuration(item.defaultDurationMs) : '00:03:00');
  const [min, setMin] = useState(item ? formatDuration(item.minDurationMs) : '00:02:00');
  const [max, setMax] = useState(item ? formatDuration(item.maxDurationMs) : '00:04:00');
  const [active, setActive] = useState(item?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const [d, mn, mx] = [parseDuration(def), parseDuration(min), parseDuration(max)];
    if (!d || !mn || !mx) return setError('Durations must be HH:MM:SS.');
    try {
      await api(item ? `/api/breaks/${item.id}` : '/api/breaks', { method: item ? 'PUT' : 'POST', body: { name, channelId, defaultDurationMs: d, minDurationMs: mn, maxDurationMs: mx, isActive: active } });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={item ? 'Edit break' : 'New break'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {error && <Alert tone="error" className="sm:col-span-3">{error}</Alert>}
        <Field label="Name" className="sm:col-span-2">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Channel">
          {(id) => (
            <Select id={id} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
              <option value="">All channels</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Minimum">{(id) => <Input id={id} value={min} onChange={(e) => setMin(e.target.value)} />}</Field>
        <Field label="Default">{(id) => <Input id={id} value={def} onChange={(e) => setDef(e.target.value)} />}</Field>
        <Field label="Maximum">{(id) => <Input id={id} value={max} onChange={(e) => setMax(e.target.value)} />}</Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
        </label>
      </div>
    </Dialog>
  );
}
