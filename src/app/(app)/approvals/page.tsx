import Link from 'next/link';
import { Forbidden } from '@/components/layout/forbidden';
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from '@/components/ui/primitives';
import { fmtDate, fmtDateTime } from '@/lib/client/format';
import { pageActor } from '@/server/auth/page-guard';
import { approvalQueue } from '@/server/services/workflow';

export const metadata = { title: 'Schedule approvals' };

export default async function ApprovalsPage() {
  const { actor, allowed } = await pageActor('schedule.view');
  if (!allowed) return <Forbidden what="approvals" />;
  const rows = await approvalQueue(actor);
  const pending = rows.filter((r) => r.status === 'PENDING');
  const history = rows.filter((r) => r.status !== 'PENDING');

  const table = (list: typeof rows, caption: string) => (
    <Table caption={caption}>
      <thead>
        <tr>
          <Th>Schedule</Th>
          <Th>Rev</Th>
          <Th>Submitted</Th>
          <Th>Validation</Th>
          <Th>Request</Th>
          <Th>Decisions</Th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <Td>
              <Link href={`/schedules/${r.scheduleId}`} className="font-medium hover:underline">
                {r.channel} · {fmtDate(r.broadcastDate)}
              </Link>
              <div className="mt-0.5">
                <StatusBadge status={r.scheduleStatus} />
              </div>
            </Td>
            <Td className="tabular">{r.versionNo}</Td>
            <Td className="text-xs">
              {r.submittedBy}
              <div className="text-muted">{fmtDateTime(r.submittedAt)}</div>
              {r.note && <div className="italic text-muted">“{r.note}”</div>}
            </Td>
            <Td className="text-xs">
              {r.validation ? (
                <>
                  <span className={r.validation.errors ? 'font-semibold text-red-700' : 'text-teal-700'}>{r.validation.errors} errors</span>, {r.validation.warnings} warnings
                  <div className="text-muted">checked {fmtDateTime(r.validation.at)}</div>
                </>
              ) : (
                '—'
              )}
            </Td>
            <Td>
              <StatusBadge status={r.status} />
            </Td>
            <Td className="text-xs">
              {r.decisions.map((d, i) => (
                <div key={i}>
                  <span className={d.decision === 'APPROVED' ? 'text-teal-700' : 'text-red-700'}>{d.decision.toLowerCase()}</span> by {d.by} · {fmtDateTime(d.at)}
                  {d.reason && <div className="text-muted">“{d.reason}”</div>}
                </div>
              ))}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  return (
    <>
      <PageHeader title="Schedule approvals" subtitle={actor.permissions.has('schedule.approve') ? 'Review submitted schedules. Open one to approve or reject it.' : 'Submission and approval history.'} crumbs={[{ href: '/dashboard', label: 'Dashboard' }, { label: 'Approvals' }]} />
      <div className="flex flex-col gap-5">
        <Card title={`Awaiting approval (${pending.length})`} accent="#f2604b">
          {pending.length ? table(pending, 'Pending approvals') : <EmptyState title="Nothing awaiting approval" />}
        </Card>
        <Card title="History" accent="#94a3b8">
          {history.length ? table(history, 'Approval history') : <EmptyState title="No decisions yet" />}
        </Card>
      </div>
    </>
  );
}
