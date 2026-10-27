'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Select, cx } from '@/components/ui/primitives';
import { CATEGORY_STYLE } from '@/lib/categories';
import { fmtTime } from '@/lib/client/format';
import type { ContentCategory } from '@/lib/dto';

export interface BarBlock {
  key: string;
  title: string;
  category: ContentCategory | 'BREAK';
  startAt: string;
  endAt: string;
  severity: 'ERROR' | 'WARNING' | null;
}

const ZOOMS = [
  { label: 'Full day', hours: 0 },
  { label: '6 hours', hours: 6 },
  { label: '3 hours', hours: 3 },
  { label: '1 hour', hours: 1 },
];
const TICKS = [1, 5, 15, 30, 60];

/**
 * Proportional time ruler for the broadcast day: zoomable range, configurable tick increment,
 * click a block to select the item. Purely a view of server-computed times.
 */
export function DayBar({ windowStart, windowEnd, blocks, timeZone, selectedKey, onSelect }: { windowStart: string; windowEnd: string; blocks: BarBlock[]; timeZone: string; selectedKey: string | null; onSelect: (key: string) => void }) {
  const [zoom, setZoom] = useState(0);
  const [tick, setTick] = useState(60);
  const [offsetH, setOffsetH] = useState(0);
  const ws = new Date(windowStart).getTime();
  const we = new Date(windowEnd).getTime();
  const span = zoom ? zoom * 3600_000 : we - ws;
  const from = zoom ? Math.min(ws + offsetH * 3600_000, we - span) : ws;
  const to = from + span;

  // Keep ticks readable: never more than ~48 labels in view.
  const effectiveTick = useMemo(() => {
    let t = tick;
    while (span / (t * 60_000) > 48) t = TICKS.find((x) => x > t) ?? t * 2;
    return t;
  }, [tick, span]);

  // Align ticks to the broadcast-day start (a local wall-clock boundary), not to UTC epoch multiples,
  // so zones with fractional offsets (e.g. +05:30) still tick on the local hour.
  const ticks: number[] = [];
  const step = effectiveTick * 60_000;
  for (let t = ws + Math.ceil((from - ws) / step) * step; t <= to; t += step) ticks.push(t);
  const pct = (t: number) => ((t - from) / span) * 100;
  const visible = blocks.filter((b) => new Date(b.endAt).getTime() > from && new Date(b.startAt).getTime() < to);

  return (
    <div className="rounded-lg bg-white p-3 ring-1 ring-line">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold uppercase tracking-wide text-muted">Time ruler</span>
        <label className="ml-auto flex items-center gap-1">
          Zoom
          <Select className="h-7 w-28 text-xs" value={zoom} onChange={(e) => (setZoom(Number(e.target.value)), setOffsetH(0))}>
            {ZOOMS.map((z) => (
              <option key={z.hours} value={z.hours}>
                {z.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-1">
          Ticks
          <Select className="h-7 w-24 text-xs" value={tick} onChange={(e) => setTick(Number(e.target.value))}>
            {TICKS.map((t) => (
              <option key={t} value={t}>
                {t} min
              </option>
            ))}
          </Select>
        </label>
        {zoom > 0 && (
          <span className="flex items-center">
            <Button size="sm" variant="ghost" aria-label="Earlier" onClick={() => setOffsetH((o) => Math.max(0, o - zoom / 2))}>
              <ChevronLeft className="size-4" />
            </Button>
            <span className="tabular">
              {fmtTime(new Date(from).toISOString(), timeZone, false)}–{fmtTime(new Date(to).toISOString(), timeZone, false)}
            </span>
            <Button size="sm" variant="ghost" aria-label="Later" onClick={() => setOffsetH((o) => Math.min((we - ws) / 3600_000 - zoom, o + zoom / 2))}>
              <ChevronRight className="size-4" />
            </Button>
          </span>
        )}
      </div>
      <div className="relative h-9 overflow-hidden rounded bg-slate-100" role="group" aria-label="Schedule blocks on the time ruler">
        {visible.map((b) => {
          const s = Math.max(from, new Date(b.startAt).getTime());
          const e = Math.min(to, new Date(b.endAt).getTime());
          const style = CATEGORY_STYLE[b.category];
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => onSelect(b.key)}
              title={`${b.title}\n${fmtTime(b.startAt, timeZone)}–${fmtTime(b.endAt, timeZone)}`}
              aria-label={`${b.title}, ${fmtTime(b.startAt, timeZone)} to ${fmtTime(b.endAt, timeZone)}`}
              className={cx(
                'absolute inset-y-0 border-r border-white/70 text-left text-[10px] leading-9 transition-opacity hover:opacity-90',
                style.bg,
                style.fg,
                selectedKey === b.key && 'z-10 ring-2 ring-navy-900',
                b.severity === 'ERROR' && 'outline outline-2 -outline-offset-2 outline-red-600',
              )}
              style={{ left: `${pct(s)}%`, width: `${Math.max(0.15, pct(e) - pct(s))}%` }}
            >
              <span className="block truncate px-1">{b.title}</span>
            </button>
          );
        })}
      </div>
      <div className="relative mt-1 h-5" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute top-0 -translate-x-1/2 text-[10px] text-muted tabular" style={{ left: `${pct(t)}%` }}>
            <span className="mx-auto block h-1.5 w-px bg-slate-400" />
            {fmtTime(new Date(t).toISOString(), timeZone, false)}
          </span>
        ))}
      </div>
    </div>
  );
}
