'use client';

import { useEffect, useState } from 'react';
import { Alert, Card, Input, Pagination, Select, Spinner, Table, Td, Th } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';
import type { Paged } from '@/lib/dto';

interface Entry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string | null;
  ip: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
}

const TYPES = ['', 'BroadcastSchedule', 'ContentItem', 'AdvertisingCampaign', 'Advertisement', 'CommercialBreak', 'Channel', 'ScheduleRule', 'User', 'MediaAsset', 'SystemSetting', 'Report'];

export function AuditView() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [data, setData] = useState<Paged<Entry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (entityType) p.set('entityType', entityType);
    if (action) p.set('action', action);
    const t = setTimeout(() => {
      api<Paged<Entry>>(`/api/audit?${p}`)
        .then((d) => (setData(d), setError(null)))
        .catch((e) => setError(errorMessage(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [page, entityType, action]);

  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-3">
        <Select className="w-56" aria-label="Entity type" value={entityType} onChange={(e) => (setEntityType(e.target.value), setPage(1))}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t || 'All entity types'}
            </option>
          ))}
        </Select>
        <Input className="w-56" placeholder="Action prefix, e.g. schedule." aria-label="Action" value={action} onChange={(e) => (setAction(e.target.value), setPage(1))} />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <Table caption="Audit log">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Entity</Th>
                <Th>Details</Th>
                <Th>IP</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDateTime(e.createdAt)}</Td>
                  <Td className="text-xs">{e.actor?.name ?? 'system'}</Td>
                  <Td className="font-mono text-xs">{e.action}</Td>
                  <Td className="text-xs">
                    {e.entityType}
                    {e.entityType === 'BroadcastSchedule' ? (
                      <a className="block text-teal-700 hover:underline" href={`/schedules/${e.entityId}`}>
                        open
                      </a>
                    ) : (
                      <span className="block font-mono text-[10px] text-muted">{e.entityId}</span>
                    )}
                  </Td>
                  <Td className="text-xs">{e.summary}</Td>
                  <Td className="text-xs text-muted">{e.ip}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </>
      )}
    </Card>
  );
}
