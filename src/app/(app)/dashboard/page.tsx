import { AlertTriangle, BadgeCheck, CalendarClock, Clock3, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { Forbidden } from '@/components/layout/forbidden';
import { Card, CategoryChip, EmptyState, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { humanDuration } from '@/lib/time/duration';
import { fmtDate, fmtDateTime, fmtTime } from '@/lib/client/format';
import type { ContentCategory } from '@/lib/dto';
import { pageActor } from '@/server/auth/page-guard';
import { dashboard } from '@/server/services/dashboard';

export const metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  const { actor, allowed } = await pageActor('schedule.view');
  if (!allowed) return <Forbidden what="the dashboard" />;
  const d = await dashboard(actor);
  const scheduled = d.channels.filter((c) => c.schedule);

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Operational overview · generated ${fmtDateTime(d.generatedAt, d.channels[0]?.channel.timeZone)}`} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile color="bg-amber-300" label="Channels scheduled today" value={`${scheduled.length} / ${d.channels.length}`} icon={<CalendarClock className="size-5" />} />
        <Tile
          color="bg-teal-400"
          label="Airtime scheduled today"
          value={humanDuration(scheduled.reduce((s, c) => s + (c.schedule?.airtimeMs ?? 0), 0))}
          icon={<Clock3 className="size-5" />}
        />
        <Tile color="bg-coral-400 text-white" label="Pending approvals" value={String(d.pendingApprovals)} icon={<BadgeCheck className="size-5" />} href="/approvals" />
        <Tile color="bg-navy-800 text-white" label="Unpublished, next 7 days" value={String(d.unpublishedNext7Days)} icon={<AlertTriangle className="size-5" />} href="/schedules" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="flex flex-col gap-5 xl:col-span-2">
          {d.channels.map((c) => (
            <Card
              key={c.channel.id}
              accent="#f5c343"
              title={
                <>
                  {c.channel.name} <span className="font-normal text-muted">· {fmtDate(c.date)}</span>
                </>
              }
              actions={c.schedule ? <StatusBadge status={c.schedule.status} /> : null}
            >
              {!c.schedule ? (
                <EmptyState title="No schedule for today">
                  <Link href="/schedules" className="text-teal-700 underline">
                    Create today’s schedule
                  </Link>
                </EmptyState>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted">
                      <span>Schedule completion</span>
                      <span className="tabular font-semibold text-navy-900">{c.schedule.fillPct}%</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={c.schedule.fillPct} aria-valuemin={0} aria-valuemax={100} aria-label="Schedule completion">
                      <div className="h-full rounded-full bg-teal-500" style={{ width: `${c.schedule.fillPct}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      {c.schedule.itemCount} items · {humanDuration(c.schedule.airtimeMs)} scheduled
                    </p>
                    <div className="mt-4 rounded-lg bg-slate-50 p-3 ring-1 ring-line">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Per schedule now</p>
                      {c.schedule.plannedNow ? (
                        <>
                          <p className="mt-1 font-semibold text-navy-900">{c.schedule.plannedNow.title}</p>
                          <p className="tabular text-xs text-muted">
                            {fmtTime(c.schedule.plannedNow.startAt, c.channel.timeZone, false)}–{fmtTime(c.schedule.plannedNow.endAt, c.channel.timeZone, false)}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-muted">Nothing scheduled at this moment.</p>
                      )}
                      <p className="mt-2 text-[11px] text-slate-500">Derived from the schedule plan. Not a live on-air status — no playout system is connected.</p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Up next</p>
                    <ol className="flex flex-col gap-1.5">
                      {c.schedule.upcoming.map((u, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="tabular w-12 shrink-0 text-xs text-muted">{fmtTime(u.startAt, c.channel.timeZone, false)}</span>
                            <CategoryChip category={u.category as ContentCategory} short />
                            <span className="truncate">{u.title}</span>
                          </span>
                          <span className="tabular shrink-0 text-xs text-muted">{humanDuration(u.durationMs)}</span>
                        </li>
                      ))}
                      {c.schedule.upcoming.length === 0 && <li className="text-sm text-muted">End of day.</li>}
                    </ol>
                    <Link href={`/schedules/${c.schedule.id}`} className="mt-3 inline-block text-sm font-medium text-teal-700 hover:underline">
                      Open schedule →
                    </Link>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>

        <div className="flex flex-col gap-5">
          <Card title="Upcoming conflicts (7 days)" accent="#f2604b">
            {d.conflicts.length === 0 ? (
              <p className="text-sm text-muted">No conflicts in upcoming schedules.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.conflicts.map((c) => (
                  <li key={c.scheduleId} className="flex items-center justify-between text-sm">
                    <Link href={`/schedules/${c.scheduleId}`} className="font-medium hover:underline">
                      {c.label}
                    </Link>
                    <span className="flex gap-2 text-xs">
                      {c.errors > 0 && <span className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-700">{c.errors} errors</span>}
                      {c.warnings > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{c.warnings} warnings</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {actor.permissions.has('ads.view') && (
            <Card title="Active campaigns" accent="#fb923c" actions={<Megaphone className="size-4 text-muted" aria-hidden />}>
              {d.campaigns.length === 0 ? (
                <p className="text-sm text-muted">No active campaigns.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {d.campaigns.map((c) => (
                    <li key={c.id}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{c.name}</span>
                        <span className="tabular text-xs text-muted">
                          {c.booked}
                          {c.cap ? ` / ${c.cap}` : ''} booked
                        </span>
                      </div>
                      {c.pct != null && (
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${c.pct > 90 ? 'bg-coral-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, c.pct)}%` }} />
                        </div>
                      )}
                      <p className="text-[11px] text-muted">Ends {fmtDate(c.endDate)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="Recently modified" accent="#3aa6df">
            <ul className="flex flex-col gap-2">
              {d.recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/schedules/${r.id}`} className="hover:underline">
                    {r.label}
                  </Link>
                  <span className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <span className="text-[11px] text-muted">{fmtDateTime(r.updatedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Tile({ color, label, value, icon, href }: { color: string; label: string; value: string; icon: React.ReactNode; href?: string }) {
  const body = (
    <div className={`flex h-28 flex-col justify-between rounded-sm p-4 shadow-md transition-transform hover:-translate-y-0.5 ${color}`}>
      <div className="flex items-start justify-between text-navy-950/80">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <span className="tabular text-3xl font-semibold">{value}</span>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
