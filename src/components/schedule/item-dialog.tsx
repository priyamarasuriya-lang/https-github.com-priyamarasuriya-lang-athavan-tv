'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, Field, Input, Textarea } from '@/components/ui/primitives';
import { formatDuration, parseDuration } from '@/lib/time/duration';
import type { EditItem } from './model';

/** Edit timing/duration/notes of one item, and the keyboard-friendly "move to position" action. */
export function ItemDialog({ item, position, count, onClose, onSave }: { item: EditItem; position: number; count: number; onClose: () => void; onSave: (updated: EditItem, newPosition: number) => void }) {
  const [mode, setMode] = useState(item.timingMode);
  const [fixedTime, setFixedTime] = useState(item.fixedTime ?? '');
  const [duration, setDuration] = useState(item.plannedDurationMs != null ? formatDuration(item.plannedDurationMs) : '');
  const [estimate, setEstimate] = useState(item.estimatedDurationMs != null ? formatDuration(item.estimatedDurationMs) : '');
  const [gap, setGap] = useState(item.gapAfterMs != null ? String(item.gapAfterMs / 1000) : '');
  const [live, setLive] = useState(item.isLive);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [pos, setPos] = useState(String(position + 1));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const plannedDurationMs = duration.trim() ? parseDuration(duration) : null;
    if (duration.trim() && (plannedDurationMs == null || plannedDurationMs <= 0)) return setError('Duration must be HH:MM:SS and greater than zero.');
    const estimatedDurationMs = estimate.trim() ? parseDuration(estimate) : null;
    if (estimate.trim() && (estimatedDurationMs == null || estimatedDurationMs <= 0)) return setError('Estimated duration must be HH:MM:SS and greater than zero.');
    if (mode === 'FIXED' && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(fixedTime)) return setError('Fixed start must be HH:MM or HH:MM:SS (24-hour).');
    const g = gap.trim() ? Number(gap) : null;
    if (g != null && (!Number.isFinite(g) || g < 0 || g > 3600)) return setError('Gap must be between 0 and 3600 seconds.');
    const p = Number(pos);
    if (!Number.isInteger(p) || p < 1 || p > count) return setError(`Position must be between 1 and ${count}.`);
    onSave(
      {
        ...item,
        timingMode: mode,
        fixedTime: mode === 'FIXED' ? fixedTime : null,
        plannedDurationMs,
        estimatedDurationMs: live ? estimatedDurationMs : null,
        gapAfterMs: g == null ? null : Math.round(g * 1000),
        isLive: live,
        notes: notes.trim() || null,
      },
      p - 1,
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Edit “${item.title}”`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert tone="error">{error}</Alert>}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-navy-700">Timing</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === 'SEQUENTIAL'} onChange={() => setMode('SEQUENTIAL')} /> Follows the previous item
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={mode === 'FIXED'} onChange={() => setMode('FIXED')} /> Fixed start time
          </label>
          {mode === 'FIXED' && (
            <Field label="Start (channel local time)" hint="Times earlier than the broadcast-day start fall on the next calendar date.">
              {(id, d) => <Input id={id} aria-describedby={d} placeholder="19:00:00" value={fixedTime} onChange={(e) => setFixedTime(e.target.value)} />}
            </Field>
          )}
        </fieldset>
        <Field
          label="Planned duration override"
          hint={item.isDurationEditable ? `Leave blank to use the default ${formatDuration(item.defaultDurationMs)}.` : `Fixed by content rules at ${formatDuration(item.defaultDurationMs)}.`}
        >
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="HH:MM:SS" value={duration} disabled={!item.isDurationEditable} onChange={(e) => setDuration(e.target.value)} />}
        </Field>
        {item.kind === 'CONTENT' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} /> Live event (use an estimated duration)
          </label>
        )}
        {live && <Field label="Estimated duration">{(id) => <Input id={id} placeholder="HH:MM:SS" value={estimate} onChange={(e) => setEstimate(e.target.value)} />}</Field>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gap after (seconds)" hint="Blank = channel default">
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={gap} onChange={(e) => setGap(e.target.value)} />}
          </Field>
          <Field label={`Position (1–${count})`}>{(id) => <Input id={id} inputMode="numeric" value={pos} onChange={(e) => setPos(e.target.value)} />}</Field>
        </div>
        <Field label="Notes">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />}</Field>
      </div>
    </Dialog>
  );
}
