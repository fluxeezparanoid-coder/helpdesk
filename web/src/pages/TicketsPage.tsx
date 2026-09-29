import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Page, Priority, Status, TicketSummary } from '../types';
import { Empty, ErrorNote, PageHeader, PriorityMark, SlaChip, StatusBadge, STATUS_LABEL, timeAgo } from '../ui';

const TABS: { value: Status | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'open', label: STATUS_LABEL.open },
  { value: 'in_progress', label: STATUS_LABEL.in_progress },
  { value: 'waiting_customer', label: 'Waiting' },
  { value: 'resolved', label: STATUS_LABEL.resolved },
  { value: 'closed', label: STATUS_LABEL.closed },
];

const PAGE_SIZE = 12;

export default function TicketsPage() {
  const { isStaff } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as Status | '';
  const priority = (params.get('priority') ?? '') as Priority | '';
  const page = Number(params.get('page') ?? 1);
  const flag = (k: string) => params.get(k) === 'true';
  const urlQ = params.get('q') ?? '';

  const [q, setQ] = useState(urlQ);
  useEffect(() => setQ(urlQ), [urlQ]);

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    if (q === urlQ) return;
    const t = setTimeout(() => set({ q: q || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data, error, isFetching } = useQuery({
    queryKey: ['tickets', params.toString()],
    placeholderData: keepPreviousData,
    queryFn: () =>
      api<Page<TicketSummary>>('/tickets', {
        query: {
          status,
          priority,
          q: urlQ,
          page,
          pageSize: PAGE_SIZE,
          mine: flag('mine') || undefined,
          unassigned: flag('unassigned') || undefined,
          overdue: flag('overdue') || undefined,
          sortBy: flag('overdue') ? 'resolveDueAt' : 'updatedAt',
          order: flag('overdue') ? 'ASC' : 'DESC',
        },
      }),
  });

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader eyebrow={isStaff ? 'Support queue' : 'Your requests'} title={isStaff ? 'Ticket queue' : 'My tickets'}>
        {!isStaff && (
          <Link to="/new" className="btn">
            New ticket
          </Link>
        )}
      </PageHeader>

      <div className="rise mb-5 flex flex-wrap items-center gap-x-1 gap-y-3" style={{ animationDelay: '60ms' }}>
        <div role="tablist" className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={status === t.value}
              onClick={() => set({ status: t.value || null })}
              className={`rounded-full px-3.5 py-1.5 text-sm transition ${status === t.value ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-paper-2'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isStaff && (
            <>
              {(['mine', 'unassigned', 'overdue'] as const).map((k) => (
                <button
                  key={k}
                  aria-pressed={flag(k)}
                  onClick={() => set({ [k]: flag(k) ? null : 'true' })}
                  className={`rounded-md border px-3 py-1.5 text-sm capitalize transition ${
                    flag(k) ? (k === 'overdue' ? 'border-signal bg-signal text-white' : 'border-ink bg-ink text-paper') : 'border-line text-ink-2 hover:border-ink'
                  }`}
                >
                  {k}
                </button>
              ))}
              <select aria-label="Priority" className="field !w-auto !py-1.5" value={priority} onChange={(e) => set({ priority: e.target.value || null })}>
                <option value="">Any priority</option>
                {['urgent', 'high', 'normal', 'low'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </>
          )}
          <input aria-label="Search tickets" className="field !w-56 !py-1.5" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={100} />
        </div>
      </div>

      <ErrorNote error={error} />

      {data && data.items.length === 0 && (
        <Empty title="Nothing here." hint={isStaff ? 'No tickets match these filters.' : 'Open a ticket and we will get back to you.'} />
      )}

      <ul className={`divide-y divide-line border-y border-line transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
        {data?.items.map((t, i) => (
          <li key={t.id} className="rise" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
            <Link to={`/tickets/${t.id}`} className="group grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-2 py-4 transition hover:bg-card md:grid-cols-[4.5rem_1fr_9rem_10rem]">
              <span className="font-mono text-sm text-ink-3 group-hover:text-ink">#{t.id}</span>
              <div className="min-w-0">
                <div className="truncate font-medium">{t.subject}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
                  {isStaff && t.requester && <span>{t.requester.name}</span>}
                  <span className="capitalize">{t.category}</span>
                  <span>{t.assignee ? `→ ${t.assignee.name}` : <em>unassigned</em>}</span>
                  <span>updated {timeAgo(t.updatedAt)}</span>
                </div>
              </div>
              <div className="hidden md:block">
                <PriorityMark priority={t.priority} />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={t.status} />
                <SlaChip ticket={t} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {data && data.total > PAGE_SIZE && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="font-mono text-ink-3">
            {data.total} tickets · page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => set({ page: String(page - 1) })}>← Prev</button>
            <button className="btn btn-ghost" disabled={page >= pages} onClick={() => set({ page: String(page + 1) })}>Next →</button>
          </div>
        </nav>
      )}
    </>
  );
}
