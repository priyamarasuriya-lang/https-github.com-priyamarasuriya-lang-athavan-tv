'use client';

import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CategoryChip, Input, Select, Spinner, cx } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/client/api';
import { CATEGORY_LABELS, type ContentCategory, type Paged } from '@/lib/dto';
import { humanDuration } from '@/lib/time/duration';
import type { LibraryBreak, LibraryContent } from './model';

const FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Programs', value: 'PROGRAM' },
  { label: 'Movies', value: 'MOVIE' },
  { label: 'News & live', value: 'NEWS,LIVE,SPECIAL_EVENT' },
  { label: 'Ads', value: 'ADVERTISEMENT' },
  { label: 'Promos', value: 'PROMO,STATION_ID,PSA' },
  { label: 'Fillers & slides', value: 'FILLER,SLIDE' },
];

export function Library({ channelId, onAdd, onAddBreak, targetBreakTitle }: { channelId: string; onAdd: (c: LibraryContent) => void; onAddBreak: (b: LibraryBreak) => void; targetBreakTitle: string | null }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [items, setItems] = useState<LibraryContent[] | null>(null);
  const [breaks, setBreaks] = useState<LibraryBreak[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const p = new URLSearchParams({ channelId, pageSize: '60', sort: 'title', dir: 'asc', status: 'ACTIVE' });
        if (q) p.set('q', q);
        if (cat) p.set('category', cat);
        const r = await api<Paged<LibraryContent>>(`/api/content?${p}`, { signal: ctl.signal });
        setItems(r.items);
        setError(null);
      } catch (e) {
        const m = errorMessage(e);
        if (m) setError(m);
      }
    }, 200);
    return () => (clearTimeout(t), ctl.abort());
  }, [q, cat, channelId]);

  useEffect(() => {
    api<LibraryBreak[]>('/api/breaks')
      .then((b) => setBreaks(b.filter((x) => x.isActive && (!x.channelId || x.channelId === channelId))))
      .catch(() => undefined);
  }, [channelId]);

  return (
    <aside className="flex h-full flex-col rounded-xl bg-white ring-1 ring-line" aria-label="Content library">
      <div className="border-b border-line p-3">
        <h2 className="mb-2 text-sm font-semibold">Content library</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-slate-400" aria-hidden />
          <Input className="pl-8" placeholder="Search title or house no." aria-label="Search content" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="mt-2" aria-label="Filter by category" value={cat} onChange={(e) => setCat(e.target.value)}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <p className="mt-2 text-[11px] leading-snug text-muted">
          Drag onto the timeline, or press <strong>+</strong>. Spots (ads, promos, IDs, PSAs) dropped on a break go inside it.
          {targetBreakTitle && (
            <>
              {' '}
              <strong>+</strong> adds spots to the selected break “{targetBreakTitle}”.
            </>
          )}
        </p>
      </div>
      <div className="border-b border-line p-3">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Commercial breaks</h3>
        <ul className="flex flex-col gap-1">
          {breaks.map((b) => (
            <LibraryRow key={b.id} id={`break:${b.id}`} data={{ type: 'break', item: b }} title={b.name} meta={humanDuration(b.defaultDurationMs)} category="BREAK" onAdd={() => onAddBreak(b)} />
          ))}
        </ul>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && <p className="text-sm text-coral-600">{error}</p>}
        {!items && !error && <Spinner />}
        <ul className="flex flex-col gap-1">
          {items?.map((c) => (
            <LibraryRow
              key={c.id}
              id={`content:${c.id}`}
              data={{ type: 'content', item: c }}
              title={c.title}
              meta={`${humanDuration(c.plannedDurationMs)}${c.approvalState !== 'APPROVED' ? ' · not approved' : ''}`}
              category={c.category}
              onAdd={() => onAdd(c)}
            />
          ))}
          {items?.length === 0 && <li className="text-sm text-muted">No matching content.</li>}
        </ul>
      </div>
    </aside>
  );
}

function LibraryRow({ id, data, title, meta, category, onAdd }: { id: string; data: Record<string, unknown>; title: string; meta: string; category: ContentCategory | 'BREAK'; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, data });
  return (
    <li ref={setNodeRef} className={cx('flex items-center gap-1 rounded-md px-1 py-1 ring-1 ring-transparent hover:bg-slate-50 hover:ring-line', isDragging && 'opacity-40')}>
      <button type="button" className="cursor-grab rounded p-0.5 text-slate-400 hover:text-navy-800" aria-label={`Drag ${title}`} {...listeners} {...attributes}>
        <GripVertical className="size-4" />
      </button>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-navy-900" title={title}>
          {title}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-muted">
          <CategoryChip category={category} short /> {CATEGORY_LABELS[category]} · {meta}
        </span>
      </span>
      <button type="button" onClick={onAdd} className="rounded p-1 text-teal-700 hover:bg-teal-50" aria-label={`Add ${title} to schedule`}>
        <Plus className="size-4" />
      </button>
    </li>
  );
}
