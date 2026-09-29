import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import type { AuditEntry, Page } from '../types';
import { ErrorNote, fullDate, PageHeader } from '../ui';

const FILTERS = ['', 'auth.login', 'auth.login_failed', 'auth.account_locked', 'auth.refresh_reuse_detected', 'user.update', 'user.create', 'ticket.update', 'attachment.upload'];

const tone = (a: string) => (/failed|locked|reuse|blocked/.test(a) ? 'text-signal' : a.startsWith('user.') ? 'text-amber' : 'text-ink');

export default function AuditPage() {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useQuery({
    queryKey: ['audit', action, page],
    placeholderData: keepPreviousData,
    queryFn: () => api<Page<AuditEntry>>('/audit', { query: { action, page, pageSize: 25 } }),
  });

  return (
    <>
      <PageHeader eyebrow="Admin" title="Audit log">
        <select aria-label="Filter by action" className="field !w-auto" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          {FILTERS.map((f) => <option key={f} value={f}>{f || 'All events'}</option>)}
        </select>
      </PageHeader>
      <ErrorNote error={error} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink">
            <tr className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              <th className="py-2 pr-4 font-normal">When</th><th className="pr-4 font-normal">Who</th><th className="pr-4 font-normal">Event</th><th className="font-normal">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line font-mono text-xs">
            {data?.items.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap py-2.5 pr-4 text-ink-3">{fullDate(e.createdAt)}</td>
                <td className="py-2.5 pr-4">{e.actorEmail ?? <span className="text-ink-3">anonymous</span>}</td>
                <td className={`whitespace-nowrap py-2.5 pr-4 ${tone(e.action)}`}>{e.action}</td>
                <td className="break-all py-2.5 text-ink-3">{e.entity && `${e.entity} ${e.entityId ?? ''}`} {e.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > data.pageSize && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="font-mono text-ink-3">{data.total} events</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <button className="btn btn-ghost" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}
    </>
  );
}
