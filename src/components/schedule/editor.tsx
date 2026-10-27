'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  GripVertical,
  History,
  Lock,
  Pencil,
  Pin,
  Radio,
  Save,
  ShieldCheck,
  Trash2,
  Undo2,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Alert, Button, CategoryChip, Dialog, EmptyState, Field, Input, StatusBadge, Textarea, cx } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/client/api';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/client/format';
import { CATEGORY_LABELS, type ConflictDto, type ScheduleItemView, type ScheduleView, type WorkflowAction } from '@/lib/dto';
import { formatDuration } from '@/lib/time/duration';
import { DayBar, type BarBlock } from './day-bar';
import { ItemDialog } from './item-dialog';
import { Library } from './library';
import { cloneWithNewKeys, fromBreak, fromContent, fromView, move, SPOT_CATEGORIES, toInput, type EditItem, type LibraryBreak, type LibraryContent } from './model';

const ACTION_LABEL: Record<WorkflowAction, string> = {
  submit: 'Submit for approval',
  withdraw: 'Withdraw submission',
  approve: 'Approve',
  reject: 'Reject',
  publish: 'Publish',
  reopen: 'Reopen as new revision',
  archive: 'Archive',
};

export function ScheduleEditor({ initial, currentUserId }: { initial: ScheduleView; currentUserId: string }) {
  const toast = useToast();
  const [view, setView] = useState(initial);
  const [items, setItems] = useState<EditItem[]>(() => initial.items.map(fromView));
  const [history, setHistory] = useState<EditItem[][]>([]);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'error' | 'warning' | 'info'; text: string; reload?: boolean } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: EditItem; parentKey: string | null; index: number } | null>(null);
  const [action, setAction] = useState<WorkflowAction | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dupOpen, setDupOpen] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const previewSeq = useRef(0);
  const editable = view.editable;
  const tz = view.channel.timeZone;

  // ── Server-computed timing, keyed by item key ──
  const timing = useMemo(() => {
    const m = new Map<string, ScheduleItemView>();
    const walk = (list: ScheduleItemView[]) => list.forEach((i) => (m.set(i.id, i), walk(i.children)));
    walk(view.items);
    return m;
  }, [view]);
  const severityByKey = useMemo(() => {
    const m = new Map<string, 'ERROR' | 'WARNING'>();
    for (const c of view.conflicts) for (const k of c.itemKeys) if (m.get(k) !== 'ERROR') m.set(k, c.severity);
    return m;
  }, [view]);

  // ── Edits → debounced server preview ──
  const runPreview = useCallback(
    async (next: EditItem[]) => {
      const seq = ++previewSeq.current;
      setPreviewing(true);
      try {
        const v = await api<ScheduleView>(`/api/schedules/${view.id}/preview`, { body: { items: next.map(toInput) } });
        if (seq === previewSeq.current) setView((cur) => ({ ...v, lockVersion: cur.lockVersion, editable: cur.editable, actions: cur.actions }));
      } catch (e) {
        if (seq === previewSeq.current) setBanner({ tone: 'error', text: `Could not recalculate: ${errorMessage(e)}` });
      } finally {
        if (seq === previewSeq.current) setPreviewing(false);
      }
    },
    [view.id],
  );
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = useCallback(
    (next: EditItem[]) => {
      setHistory((h) => [...h.slice(-49), items]);
      setItems(next);
      setDirty(true);
      if (previewTimer.current) clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => runPreview(next), 300);
    },
    [items, runPreview],
  );
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setItems(prev);
    setDirty(true);
    runPreview(prev);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ── Mutations ──
  const selectedBreak = items.find((i) => i.key === selected && i.kind === 'BREAK') ?? null;
  const addContent = (c: LibraryContent, at?: number) => {
    const it = fromContent(c);
    if (selectedBreak && SPOT_CATEGORIES.includes(c.category) && at == null) {
      return commit(items.map((i) => (i.key === selectedBreak.key ? { ...i, children: [...i.children, it] } : i)));
    }
    const next = [...items];
    next.splice(at ?? next.length, 0, it);
    commit(next);
    setSelected(it.key);
  };
  const addBreak = (b: LibraryBreak, at?: number) => {
    const it = fromBreak(b);
    const next = [...items];
    next.splice(at ?? next.length, 0, it);
    commit(next);
    setSelected(it.key);
  };
  const removeAt = (parentKey: string | null, index: number) => {
    if (!parentKey) return commit(items.filter((_, i) => i !== index));
    commit(items.map((p) => (p.key === parentKey ? { ...p, children: p.children.filter((_, i) => i !== index) } : p)));
  };
  const moveAt = (parentKey: string | null, from: number, to: number) => {
    if (!parentKey) return commit(move(items, from, to));
    commit(items.map((p) => (p.key === parentKey ? { ...p, children: move(p.children, from, to) } : p)));
  };
  const duplicateAt = (index: number) => {
    const next = [...items];
    next.splice(index + 1, 0, cloneWithNewKeys(items[index]));
    commit(next);
  };
  const applyEdit = (updated: EditItem, newPos: number) => {
    if (!editing) return;
    if (!editing.parentKey) {
      const next = items.map((i) => (i.key === updated.key ? updated : i));
      commit(move(next, editing.index, Math.min(newPos, next.length - 1)));
    } else {
      commit(
        items.map((p) => {
          if (p.key !== editing.parentKey) return p;
          const kids = p.children.map((c) => (c.key === updated.key ? updated : c));
          return { ...p, children: move(kids, editing.index, Math.min(newPos, kids.length - 1)) };
        }),
      );
    }
    setEditing(null);
  };

  async function save() {
    setSaving(true);
    setBanner(null);
    try {
      const v = await api<ScheduleView>(`/api/schedules/${view.id}/items`, { method: 'PUT', body: { lockVersion: view.lockVersion, items: items.map(toInput) } });
      setView(v);
      setItems(v.items.map(fromView));
      setHistory([]);
      setDirty(false);
      toast(v.errorCount ? `Saved with ${v.errorCount} blocking conflict(s)` : 'Schedule saved', v.errorCount ? 'info' : 'success');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'STALE_VERSION') {
        setBanner({ tone: 'warning', text: 'Someone else saved this schedule after you opened it. Your changes were not saved. Reload to see their version (your unsaved edits will be lost), or copy your changes down first.', reload: true });
      } else if (e instanceof ApiError && e.code === 'LOCKED') {
        setBanner({ tone: 'error', text: `${e.message} Reload to see its current state.`, reload: true });
      } else setBanner({ tone: 'error', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    const v = await api<ScheduleView>(`/api/schedules/${view.id}`);
    setView(v);
    setItems(v.items.map(fromView));
    setHistory([]);
    setDirty(false);
    setBanner(null);
  }

  // ── Drag and drop ──
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const filtering = hidden.size > 0;
  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as { type?: string; item?: { title?: string; name?: string } } | undefined;
    setDragLabel(d?.item?.title ?? d?.item?.name ?? items.find((i) => i.key === e.active.id)?.title ?? null);
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null);
    const { active, over } = e;
    if (!over || !editable) return;
    const data = active.data.current as { type?: 'content' | 'break'; item?: LibraryContent | LibraryBreak } | undefined;
    const overIndex = over.id === 'timeline-end' ? items.length : items.findIndex((i) => i.key === over.id);
    if (data?.type === 'content') {
      const c = data.item as LibraryContent;
      const target = items[overIndex];
      if (target?.kind === 'BREAK' && SPOT_CATEGORIES.includes(c.category)) {
        commit(items.map((i) => (i.key === target.key ? { ...i, children: [...i.children, fromContent(c)] } : i)));
        setSelected(target.key);
      } else addContent(c, overIndex < 0 ? items.length : overIndex);
      return;
    }
    if (data?.type === 'break') return addBreak(data.item as LibraryBreak, overIndex < 0 ? items.length : overIndex);
    const from = items.findIndex((i) => i.key === active.id);
    if (from >= 0 && overIndex >= 0 && from !== overIndex) commit(move(items, from, Math.min(overIndex, items.length - 1)));
  };

  const rowKeyDown = (e: KeyboardEvent, parentKey: string | null, index: number, length: number) => {
    if (!editable) return;
    if (e.altKey && e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      moveAt(parentKey, index, index - 1);
    } else if (e.altKey && e.key === 'ArrowDown' && index < length - 1) {
      e.preventDefault();
      moveAt(parentKey, index, index + 1);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      removeAt(parentKey, index);
    }
  };

  const fill = Math.round((view.totalAirtimeMs / view.window.lengthMs) * 1000) / 10;
  const blocks: BarBlock[] = items.map((i) => {
    const t = timing.get(i.key);
    return { key: i.key, title: i.title, category: i.category, startAt: t?.startAt ?? view.window.start, endAt: t?.endAt ?? view.window.start, severity: severityByKey.get(i.key) ?? null };
  });
  const categoriesPresent = [...new Set(items.map((i) => i.category))];

  const selectFromConflict = (c: ConflictDto) => {
    const key = c.itemKeys.find((k) => items.some((i) => i.key === k)) ?? items.find((i) => i.children.some((ch) => c.itemKeys.includes(ch.key)))?.key;
    if (key) {
      setSelected(key);
      document.getElementById(`row-${key}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-muted">
            <Link href="/schedules" className="hover:underline">
              Broadcast schedule
            </Link>{' '}
            / {view.channel.code}
          </nav>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
            {view.channel.name} · {fmtDate(view.broadcastDate)}
            <StatusBadge status={view.status} />
            <span className="text-sm font-normal text-muted">Revision {view.versionNo}</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted">
            Broadcast day {fmtTime(view.window.start, tz, false)} – {fmtTime(view.window.end, tz, false)} ({tz}
            {view.window.lengthMs !== 86_400_000 && `, ${view.window.lengthMs / 3_600_000}h day — DST transition`}) · times shown in channel time
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <Button onClick={undo} disabled={!history.length} aria-label="Undo last change" title="Undo (last 50 changes)">
                <Undo2 className="size-4" /> Undo
              </Button>
              <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || previewing}>
                <Save className="size-4" /> {dirty ? 'Save changes' : 'Saved'}
              </Button>
            </>
          )}
          {view.actions.map((a) => (
            <Button key={a} variant={a === 'approve' || a === 'publish' || a === 'submit' ? 'accent' : a === 'reject' || a === 'archive' ? 'danger' : 'secondary'} disabled={dirty || (a === 'approve' && view.pendingRequest?.submittedById === currentUserId)} onClick={() => setAction(a)} title={dirty ? 'Save your changes first' : undefined}>
              {ACTION_LABEL[a]}
            </Button>
          ))}
          {view.canExport && (
            <div className="flex overflow-hidden rounded-md ring-1 ring-line" role="group" aria-label="Export schedule">
              {(['pdf', 'xlsx', 'csv'] as const).map((f) => (
                <a key={f} href={`/api/schedules/${view.id}/export?format=${f}`} className="flex items-center gap-1 bg-white px-2.5 py-2 text-xs font-medium uppercase hover:bg-slate-50" download>
                  <Download className="size-3.5" aria-hidden /> {f}
                </a>
              ))}
            </div>
          )}
          {view.actions.length > 0 || editable ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setDupOpen(true)}>
                <Copy className="size-4" /> Copy to date
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTplOpen(true)}>
                Save as template
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Status banners ── */}
      {banner && (
        <Alert tone={banner.tone}>
          {banner.text}{' '}
          {banner.reload && (
            <button type="button" className="font-semibold underline" onClick={reload}>
              Reload latest
            </button>
          )}
        </Alert>
      )}
      {!editable && view.status !== 'DRAFT' && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-4" aria-hidden /> This schedule is {view.status.toLowerCase()} and locked.
          </span>
          {view.approvedBy && ` Approved by ${view.approvedBy} on ${fmtDateTime(view.approvedAt!)}.`}
          {view.publishedBy && ` Published by ${view.publishedBy} on ${fmtDateTime(view.publishedAt!)}.`}
          {view.actions.includes('reopen') && ' Use “Reopen as new revision” to make changes; the approved revision is kept in history.'}
        </Alert>
      )}
      {view.pendingRequest && (
        <Alert tone="warning">
          Submitted by {view.pendingRequest.submittedBy} on {fmtDateTime(view.pendingRequest.submittedAt)}
          {view.pendingRequest.note && ` — “${view.pendingRequest.note}”`}.{view.pendingRequest.submittedById === currentUserId && view.actions.includes('approve') && ' Separation of duties: another approver must review it.'}
        </Alert>
      )}

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Stat label="Starts" value={fmtTime(view.window.start, tz)} />
        <Stat label="Ends" value={view.items.length ? fmtTime(view.endAt, tz) : '—'} />
        <Stat label="Total airtime" value={formatDuration(view.totalAirtimeMs)} />
        <Stat label="Day filled" value={`${fill}%`} />
        <Stat label="Blocking errors" value={String(view.errorCount)} tone={view.errorCount ? 'error' : 'ok'} />
        <Stat label="Warnings" value={String(view.warningCount)} tone={view.warningCount ? 'warn' : 'ok'} />
      </div>

      <DayBar windowStart={view.window.start} windowEnd={view.window.end} blocks={blocks} timeZone={tz} selectedKey={selected} onSelect={(k) => (setSelected(k), document.getElementById(`row-${k}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))} />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragLabel(null)}>
        <div className={cx('grid gap-4', editable ? 'xl:grid-cols-[300px_minmax(0,1fr)_320px]' : 'xl:grid-cols-[minmax(0,1fr)_320px]')}>
          {editable && (
            <div className="xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)]">
              <Library channelId={view.channel.id} onAdd={(c) => addContent(c)} onAddBreak={(b) => addBreak(b)} targetBreakTitle={selectedBreak?.title ?? null} />
            </div>
          )}

          {/* ── Timeline ── */}
          <section className="min-w-0 rounded-xl bg-white ring-1 ring-line" aria-label="Schedule timeline">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted">Timeline</span>
              <span className={cx('ml-1 rounded px-1.5 py-0.5', previewing ? 'bg-amber-50 text-amber-800' : dirty ? 'bg-sky-50 text-sky-800' : 'text-muted')} aria-live="polite">
                {previewing ? 'Recalculating on server…' : dirty ? 'Unsaved changes · times recalculated by server' : `${items.length} items`}
              </span>
              <div className="ml-auto flex flex-wrap gap-1" role="group" aria-label="Filter timeline by category">
                {categoriesPresent.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={!hidden.has(c)}
                    onClick={() => setHidden((h) => (h.has(c) ? new Set([...h].filter((x) => x !== c)) : new Set([...h, c])))}
                    className={cx('rounded-full px-2 py-0.5 ring-1 ring-line', hidden.has(c) ? 'bg-slate-50 text-slate-400 line-through' : 'bg-white')}
                  >
                    <CategoryChip category={c} />
                  </button>
                ))}
              </div>
            </div>
            {filtering && editable && <p className="border-b border-line bg-amber-50 px-3 py-1.5 text-xs text-amber-900">Category filter active — drag-reordering is disabled; use the arrow buttons.</p>}
            <div className="hidden grid-cols-[28px_72px_72px_76px_minmax(0,1fr)_auto] gap-2 border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted md:grid" aria-hidden>
              <span />
              <span>Start</span>
              <span>End</span>
              <span>Duration</span>
              <span>Title</span>
              <span>Actions</span>
            </div>
            {items.length === 0 ? (
              <div className="p-6">
                <EmptyState title="This schedule is empty">{editable ? 'Drag content from the library or press + to add it.' : 'No items were scheduled.'}</EmptyState>
                {editable && <TimelineEndDrop />}
              </div>
            ) : (
              <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy} disabled={!editable || filtering}>
                <ol className={cx('divide-y divide-line/70', previewing && 'opacity-80')}>
                  {items.map((it, index) =>
                    hidden.has(it.category) ? null : (
                      <SortableRow
                        key={it.key}
                        item={it}
                        index={index}
                        count={items.length}
                        timing={timing}
                        severity={severityByKey}
                        tz={tz}
                        editable={editable}
                        selected={selected === it.key}
                        onSelect={() => setSelected(it.key)}
                        onMove={(from, to, parentKey) => moveAt(parentKey, from, to)}
                        onRemove={(i, parentKey) => removeAt(parentKey, i)}
                        onEdit={(item, i, parentKey) => setEditing({ item, index: i, parentKey })}
                        onDuplicate={() => duplicateAt(index)}
                        onKeyDown={rowKeyDown}
                      />
                    ),
                  )}
                </ol>
                {editable && <TimelineEndDrop />}
              </SortableContext>
            )}
          </section>

          {/* ── Conflicts & history ── */}
          <aside className="flex flex-col gap-4">
            <section className="rounded-xl bg-white ring-1 ring-line" aria-label="Conflicts">
              <header className="flex items-center justify-between border-b border-line px-3 py-2">
                <h2 className="text-sm font-semibold">Validation</h2>
                {view.conflicts.length === 0 ? (
                  <span className="flex items-center gap-1 text-xs text-teal-700">
                    <ShieldCheck className="size-4" aria-hidden /> All checks pass
                  </span>
                ) : (
                  <span className="text-xs text-muted">
                    {view.errorCount} errors · {view.warningCount} warnings
                  </span>
                )}
              </header>
              <ul className="max-h-[50vh] overflow-y-auto">
                {view.conflicts.map((c, i) => (
                  <li key={i} className="border-b border-line/60 last:border-0">
                    <button type="button" onClick={() => selectFromConflict(c)} className="flex w-full gap-2 px-3 py-2 text-left hover:bg-slate-50">
                      {c.severity === 'ERROR' ? <AlertOctagon className="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Error" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-label="Warning" />}
                      <span className="text-xs">
                        <span className="block font-medium text-navy-900">{c.message}</span>
                        <span className="block text-muted">
                          {c.startAt && <span className="tabular">{fmtTime(c.startAt, tz)} · </span>}
                          {c.suggestion}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">{c.code}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="rounded-xl bg-white ring-1 ring-line" aria-label="History">
              <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                <History className="size-4 text-muted" aria-hidden />
                <h2 className="text-sm font-semibold">Revisions & activity</h2>
              </header>
              <div className="px-3 py-2">
                <ul className="mb-2 flex flex-col gap-1 text-xs">
                  {view.versions.map((v) => (
                    <li key={v.versionNo} className="flex justify-between gap-2">
                      <Link href={`/schedules/${view.id}?version=${v.versionNo}`} className="font-medium hover:underline">
                        Rev {v.versionNo} {v.frozen && '🔒'}
                      </Link>
                      <span className="truncate text-muted" title={v.note ?? undefined}>
                        {v.createdBy} · {fmtDateTime(v.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="flex max-h-60 flex-col gap-1.5 overflow-y-auto border-t border-line pt-2 text-xs">
                  {view.history.map((h, i) => (
                    <li key={i}>
                      <span className="font-medium">{h.action.replace('schedule.', '')}</span> <span className="text-muted">by {h.by ?? 'system'} · {fmtDateTime(h.at)}</span>
                      {h.summary && <span className="block text-slate-500">{h.summary}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </aside>
        </div>
        <DragOverlay>{dragLabel ? <div className="rounded-md bg-navy-900 px-3 py-2 text-sm text-white shadow-lg">{dragLabel}</div> : null}</DragOverlay>
      </DndContext>

      {editing && <ItemDialog item={editing.item} position={editing.index} count={editing.parentKey ? (items.find((p) => p.key === editing.parentKey)?.children.length ?? 1) : items.length} onClose={() => setEditing(null)} onSave={applyEdit} />}
      {action && (
        <ActionDialog
          action={action}
          view={view}
          onClose={() => setAction(null)}
          onDone={(v) => {
            setAction(null);
            setView(v);
            setItems(v.items.map(fromView));
            setHistory([]);
            setDirty(false);
            toast(`${ACTION_LABEL[action]} — done`);
          }}
          onStale={() => setBanner({ tone: 'warning', text: 'The schedule changed since you loaded it.', reload: true })}
        />
      )}
      {dupOpen && <DuplicateDialog view={view} onClose={() => setDupOpen(false)} />}
      {tplOpen && <TemplateDialog view={view} onClose={() => setTplOpen(false)} onSaved={() => (setTplOpen(false), toast('Template saved'))} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' | 'error' }) {
  return (
    <div className={cx('rounded-lg bg-white px-3 py-2 ring-1 ring-line', tone === 'error' && 'ring-red-300', tone === 'warn' && 'ring-amber-300')}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cx('tabular text-lg font-semibold', tone === 'error' && 'text-red-700', tone === 'warn' && 'text-amber-700')}>{value}</div>
    </div>
  );
}

function TimelineEndDrop() {
  const { setNodeRef, isOver } = useDroppable({ id: 'timeline-end' });
  return (
    <div ref={setNodeRef} className={cx('m-3 rounded-md border-2 border-dashed px-3 py-3 text-center text-xs text-muted', isOver ? 'border-teal-500 bg-teal-50' : 'border-line')}>
      Drop here to add at the end of the day
    </div>
  );
}

interface RowProps {
  item: EditItem;
  index: number;
  count: number;
  timing: Map<string, ScheduleItemView>;
  severity: Map<string, 'ERROR' | 'WARNING'>;
  tz: string;
  editable: boolean;
  selected: boolean;
  onSelect: () => void;
  onMove: (from: number, to: number, parentKey: string | null) => void;
  onRemove: (index: number, parentKey: string | null) => void;
  onEdit: (item: EditItem, index: number, parentKey: string | null) => void;
  onDuplicate: () => void;
  onKeyDown: (e: KeyboardEvent, parentKey: string | null, index: number, length: number) => void;
}

function SortableRow(p: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: p.item.key, disabled: !p.editable });
  const it = p.item;
  const t = p.timing.get(it.key);
  const sev = p.severity.get(it.key) ?? (it.children.some((c) => p.severity.get(c.key) === 'ERROR') ? 'ERROR' : it.children.some((c) => p.severity.get(c.key)) ? 'WARNING' : undefined);
  const filled = it.children.reduce((s, c) => s + (p.timing.get(c.key)?.durationMs ?? c.plannedDurationMs ?? c.defaultDurationMs), 0);
  return (
    <li
      ref={setNodeRef}
      id={`row-${it.key}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('relative bg-white', isDragging && 'z-20 opacity-60 shadow-lg', isOver && 'bg-teal-50/60')}
    >
      <span className={cx('absolute inset-y-0 left-0 w-1', sev === 'ERROR' ? 'bg-red-500' : sev === 'WARNING' ? 'bg-amber-400' : 'bg-transparent')} aria-hidden />
      <ItemLine {...p} t={t} sev={sev} dragProps={{ ...attributes, ...listeners }} parentKey={null} listLength={p.count} />
      {it.kind === 'BREAK' && (
        <div className="mb-2 ml-10 mr-3 rounded-md bg-slate-50 ring-1 ring-line">
          <div className="flex justify-between px-3 py-1 text-[11px] text-muted">
            <span>
              {it.children.length} spot{it.children.length === 1 ? '' : 's'} · filled {formatDuration(filled)} of {formatDuration(t?.durationMs ?? 0)}
            </span>
            {p.editable && <span>Select this break, then + spots in the library, or drop them here.</span>}
          </div>
          <ol>
            {it.children.map((c, ci) => (
              <li key={c.key} id={`row-${c.key}`} className="border-t border-line/60">
                <ItemLine {...p} item={c} index={ci} t={p.timing.get(c.key)} sev={p.severity.get(c.key)} parentKey={it.key} listLength={it.children.length} nested />
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

function ItemLine(
  p: RowProps & {
    t: ScheduleItemView | undefined;
    sev: 'ERROR' | 'WARNING' | undefined;
    dragProps?: Record<string, unknown>;
    parentKey: string | null;
    listLength: number;
    nested?: boolean;
  },
) {
  const it = p.item;
  const time = (iso?: string) => (iso ? fmtTime(iso, p.tz) : '—');
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={`${it.title}, ${time(p.t?.startAt)} to ${time(p.t?.endAt)}${p.sev ? `, has ${p.sev.toLowerCase()}` : ''}. ${p.editable ? 'Alt+Up/Down to move, Delete to remove.' : ''}`}
      onClick={p.nested ? undefined : p.onSelect}
      onKeyDown={(e) => p.onKeyDown(e, p.parentKey, p.index, p.listLength)}
      className={cx(
        'grid grid-cols-[28px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 px-3 py-2 text-sm md:grid-cols-[28px_72px_72px_76px_minmax(0,1fr)_auto]',
        p.nested ? 'py-1.5 text-xs' : 'cursor-pointer',
        !p.nested && p.selected && 'bg-sky-50',
      )}
    >
      {p.dragProps && p.editable ? (
        <button type="button" className="cursor-grab touch-none rounded p-0.5 text-slate-400 hover:text-navy-800" aria-label={`Drag to reorder ${it.title}`} {...p.dragProps}>
          <GripVertical className="size-4" />
        </button>
      ) : (
        <span />
      )}
      <span className="tabular font-medium text-navy-900 md:col-auto">
        {time(p.t?.startAt)}
        {it.timingMode === 'FIXED' && <Pin className="ml-1 inline size-3 text-coral-600" aria-label="Fixed time" />}
      </span>
      <span className="tabular hidden text-muted md:block">{time(p.t?.endAt)}</span>
      <span className="tabular hidden text-muted md:block" title={it.plannedDurationMs != null ? 'Duration overridden' : 'Default duration'}>
        {formatDuration(p.t?.durationMs ?? it.plannedDurationMs ?? it.defaultDurationMs)}
        {it.plannedDurationMs != null && '*'}
      </span>
      <span className="col-span-2 flex min-w-0 items-center gap-2 md:col-span-1">
        <CategoryChip category={it.category} short />
        <span className="truncate font-medium" title={it.title}>
          {it.title}
        </span>
        <span className="hidden shrink-0 text-[11px] text-muted lg:inline">{CATEGORY_LABELS[it.category]}</span>
        {it.isLive && (
          <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-coral-500 px-1 text-[10px] font-bold uppercase text-white">
            <Radio className="size-3" aria-hidden /> live
          </span>
        )}
        {it.houseNumber && <span className="hidden shrink-0 text-[11px] text-slate-400 xl:inline">{it.houseNumber}</span>}
        {p.sev && (p.sev === 'ERROR' ? <AlertOctagon className="size-4 shrink-0 text-red-600" aria-hidden /> : <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden />)}
      </span>
      {p.editable && (
        <span className="col-span-2 flex justify-end gap-0.5 md:col-span-1" onClick={(e) => e.stopPropagation()}>
          <IconBtn label="Move up" disabled={p.index === 0} onClick={() => p.onMove(p.index, p.index - 1, p.parentKey)}>
            <ArrowUp className="size-3.5" />
          </IconBtn>
          <IconBtn label="Move down" disabled={p.index >= p.listLength - 1} onClick={() => p.onMove(p.index, p.index + 1, p.parentKey)}>
            <ArrowDown className="size-3.5" />
          </IconBtn>
          <IconBtn label={`Edit timing for ${it.title}`} onClick={() => p.onEdit(it, p.index, p.parentKey)}>
            <Pencil className="size-3.5" />
          </IconBtn>
          {!p.nested && (
            <IconBtn label={`Duplicate ${it.title}`} onClick={p.onDuplicate}>
              <Copy className="size-3.5" />
            </IconBtn>
          )}
          <IconBtn label={`Remove ${it.title}`} onClick={() => p.onRemove(p.index, p.parentKey)}>
            <Trash2 className="size-3.5 text-coral-600" />
          </IconBtn>
        </span>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded p-1.5 text-navy-700 hover:bg-slate-100 disabled:opacity-30">
      {children}
    </button>
  );
}

function ActionDialog({ action, view, onClose, onDone, onStale }: { action: WorkflowAction; view: ScheduleView; onClose: () => void; onDone: (v: ScheduleView) => void; onStale: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReason = action === 'reject' || action === 'reopen';
  const blocking = (action === 'submit' || action === 'approve' || action === 'publish') && view.errorCount > 0;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const v = await api<ScheduleView>(`/api/schedules/${view.id}/transition/${action}`, { body: { lockVersion: view.lockVersion, reason: needsReason ? reason : undefined, note: action === 'submit' ? reason || undefined : undefined } });
      onDone(v);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'STALE_VERSION') {
        onStale();
        onClose();
        return;
      }
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={ACTION_LABEL[action]}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={action === 'reject' || action === 'archive' ? 'danger' : 'accent'} loading={busy} disabled={needsReason && !reason.trim()} onClick={go}>
            {ACTION_LABEL[action]}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        {error && <Alert tone="error">{error}</Alert>}
        {blocking && <Alert tone="error">This schedule has {view.errorCount} blocking conflict(s). The server will refuse this action until they are resolved.</Alert>}
        <p>
          {view.channel.name}, {fmtDate(view.broadcastDate)} — revision {view.versionNo}.
          {action === 'publish' && ' Publishing locks this revision and books its advertising spots as planned airings.'}
          {action === 'reopen' && ' A new draft revision is created from the current one; the approved revision stays in history.'}
          {action === 'approve' && ' Approval freezes this revision.'}
        </p>
        {(needsReason || action === 'submit') && (
          <Field label={needsReason ? 'Reason (required)' : 'Note for the approver (optional)'}>
            {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} required={needsReason} />}
          </Field>
        )}
      </div>
    </Dialog>
  );
}

function DuplicateDialog({ view, onClose }: { view: ScheduleView; onClose: () => void }) {
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    try {
      const v = await api<ScheduleView>(`/api/schedules/${view.id}/duplicate`, { body: { broadcastDate: date } });
      window.location.assign(`/schedules/${v.id}`);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Copy schedule to another date"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!date} onClick={go}>
            Copy
          </Button>
        </>
      }
    >
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <Field label="Target broadcast date" hint="Creates a new draft with the same items; times are recalculated for that date.">
        {(id, d) => <Input id={id} aria-describedby={d} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

function TemplateDialog({ view, onClose, onSaved }: { view: ScheduleView; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(`${view.channel.code} weekday`);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    try {
      await api('/api/templates', { body: { name, description: description || undefined, fromScheduleId: view.id } });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Save as template"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={go}>
            Save template
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && <Alert tone="error">{error}</Alert>}
        <p className="text-sm text-muted">Saves the last saved version of this schedule (not unsaved edits) as a reusable pattern.</p>
        <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Description">{(id) => <Input id={id} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
