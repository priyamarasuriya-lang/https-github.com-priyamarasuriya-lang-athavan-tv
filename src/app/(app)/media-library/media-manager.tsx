'use client';

import { RefreshCw, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, EmptyState, Input, Pagination, Spinner, StatusBadge, Table, Td, Th } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/client/format';
import type { Paged } from '@/lib/dto';
import { formatDuration, parseDuration } from '@/lib/time/duration';

interface Asset {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  durationMs: number | null;
  status: string;
  createdAt: string;
  _count: { contentItems: number };
}

export function MediaManager({ canUpload }: { canUpload: boolean }) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [data, setData] = useState<Paged<Asset> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Paged<Asset>>(`/api/media?page=${page}&pageSize=25${q ? `&q=${encodeURIComponent(q)}` : ''}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [page, q]);
  useEffect(() => {
    load();
  }, [load]);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const ms = duration ? parseDuration(duration) : null;
    if (duration && !ms) return toast('Duration must be HH:MM:SS', 'error');
    const form = new FormData();
    form.set('file', file);
    if (ms) form.set('durationMs', String(ms));
    setBusy(true);
    try {
      await api('/api/media', { form });
      toast(`Uploaded ${file.name}`);
      if (fileRef.current) fileRef.current.value = '';
      setDuration('');
      load();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {canUpload && (
        <Card title="Upload media" accent="#7fd3f7">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-navy-700">
              File
              <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,application/mxf,image/png,image/jpeg,audio/mpeg,audio/wav" className="text-sm font-normal normal-case" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-navy-700">
              Media duration (optional)
              <Input placeholder="HH:MM:SS" className="w-36 font-normal" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </label>
            <Button variant="primary" onClick={upload} loading={busy}>
              <Upload className="size-4" /> Upload
            </Button>
            <Button
              className="ml-auto"
              onClick={async () => {
                try {
                  const r = await api<{ checked: number; missing: number }>('/api/media/verify', { body: {} });
                  toast(`Checked ${r.checked} assets; ${r.missing} missing`, r.missing ? 'error' : 'success');
                  load();
                } catch (e) {
                  toast(errorMessage(e), 'error');
                }
              }}
            >
              <RefreshCw className="size-4" /> Verify storage
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            Allowed: MP4, MOV, MXF, PNG, JPEG, MP3, WAV. File contents are checked against the declared type. Files are stored outside the web root with random names. This system stores and references media only — it does not transcode or play out video.
          </p>
        </Card>
      )}
      <Card title="Assets">
        <Input className="mb-3 w-64" placeholder="Search file name" aria-label="Search assets" value={q} onChange={(e) => (setQ(e.target.value), setPage(1))} />
        {error && <Alert tone="error">{error}</Alert>}
        {!data && !error && <Spinner />}
        {data && data.items.length === 0 && <EmptyState title="No media assets" />}
        {data && data.items.length > 0 && (
          <Table caption="Media assets">
            <thead>
              <tr>
                <Th>File</Th>
                <Th>Type</Th>
                <Th>Size</Th>
                <Th>Duration</Th>
                <Th>Used by</Th>
                <Th>Status</Th>
                <Th>Uploaded</Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <tr key={a.id}>
                  <Td>
                    <div className="font-medium">{a.originalName}</div>
                    <div className="font-mono text-[10px] text-muted" title="SHA-256">
                      {a.checksumSha256.slice(0, 16)}…
                    </div>
                  </Td>
                  <Td className="text-xs">{a.mimeType}</Td>
                  <Td className="tabular text-xs">{(a.sizeBytes / 1024).toFixed(1)} KB</Td>
                  <Td className="tabular text-xs">{a.durationMs ? formatDuration(a.durationMs) : '—'}</Td>
                  <Td className="text-xs">{a._count.contentItems} items</Td>
                  <Td>
                    <StatusBadge status={a.status === 'AVAILABLE' ? 'ACTIVE' : 'REJECTED'} />
                  </Td>
                  <Td className="text-xs text-muted">{fmtDateTime(a.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </Card>
    </div>
  );
}
