import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile } from '../api';
import { useAuth } from '../auth';
import type { Category, Priority, Status, TicketDetail } from '../types';
import { Avatar, bytes, ErrorNote, fullDate, PriorityMark, SlaChip, StatusBadge, STATUS_LABEL, timeAgo } from '../ui';

// Mirrors the API's transition table so staff only see moves the server will accept.
const NEXT: Record<Status, Status[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['waiting_customer', 'resolved', 'closed'],
  waiting_customer: ['in_progress', 'resolved', 'closed'],
  resolved: ['open', 'closed'],
  closed: [],
};

function Rail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

export default function TicketPage() {
  const id = Number(useParams().id);
  const { user, isStaff } = useAuth();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [busyFile, setBusyFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const key = ['ticket', id];
  const { data: t, error } = useQuery({ queryKey: key, queryFn: () => api<TicketDetail>(`/tickets/${id}`), refetchInterval: 30_000 });
  const staff = useQuery({ queryKey: ['staff'], enabled: isStaff, queryFn: () => api<{ id: string; name: string; role: string }[]>('/users/staff') });

  const refresh = (updated: TicketDetail) => {
    qc.setQueryData(key, updated);
    qc.invalidateQueries({ queryKey: ['tickets'] });
    qc.invalidateQueries({ queryKey: ['overdue-count'] });
  };

  const patch = useMutation({
    mutationFn: (changes: { status?: Status; priority?: Priority; category?: Category; assigneeId?: string | null }) =>
      api<TicketDetail>(`/tickets/${id}`, { method: 'PATCH', body: changes }),
    onSuccess: refresh,
  });
  const transition = useMutation({
    mutationFn: (to: 'close' | 'reopen') => api<TicketDetail>(`/tickets/${id}/${to}`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const reply = useMutation({
    mutationFn: () => api<TicketDetail>(`/tickets/${id}/comments`, { method: 'POST', body: { body, ...(isStaff ? { isInternal: internal } : {}) } }),
    onSuccess: (updated) => {
      setBody('');
      setInternal(false);
      refresh(updated);
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      setBusyFile(true);
      const form = new FormData();
      form.append('file', file);
      await api(`/tickets/${id}/attachments`, { method: 'POST', form });
    },
    onSettled: () => {
      setBusyFile(false);
      qc.invalidateQueries({ queryKey: key });
    },
  });

  if (error) return <ErrorNote error={error} />;
  if (!t) return <div className="font-display text-2xl italic text-ink-3">Loading…</div>;

  const closed = t.status === 'closed';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim()) reply.mutate();
  };
  const mutationError = patch.error ?? transition.error ?? reply.error ?? upload.error;

  return (
    <div className="rise">
      <Link to="/tickets" className="font-mono text-xs uppercase tracking-wider text-ink-3 hover:text-ink">← Back to tickets</Link>

      <div className="mt-3 grid gap-x-12 gap-y-8 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          <div className="label">Ticket #{t.id}</div>
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">{t.subject}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-ink-2">
            <StatusBadge status={t.status} />
            <span>opened {timeAgo(t.createdAt)} by <strong className="font-medium text-ink">{t.requester?.name}</strong></span>
          </div>

          <ol className="mt-8 space-y-5">
            <li className="flex gap-3">
              <Avatar name={t.requester?.name ?? '?'} />
              <div className="min-w-0 flex-1 rounded-md border border-line bg-card p-4">
                <div className="mb-2 flex items-baseline justify-between text-xs text-ink-3">
                  <span className="font-medium text-ink-2">{t.requester?.name}</span>
                  <time title={fullDate(t.createdAt)}>{timeAgo(t.createdAt)}</time>
                </div>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{t.description}</p>
              </div>
            </li>

            {t.comments.map((c) => {
              const mine = c.author.id === user!.id;
              const staffAuthor = c.author.role !== 'customer';
              return (
                <li key={c.id} className="flex gap-3">
                  <Avatar name={c.author.name} tone={c.isInternal ? 'amber' : staffAuthor ? 'moss' : 'ink'} />
                  <div className={`min-w-0 flex-1 rounded-md border p-4 ${c.isInternal ? 'hatch border-amber/50' : staffAuthor ? 'border-moss/40 bg-moss-bg/40' : 'border-line bg-card'}`}>
                    <div className="mb-2 flex items-baseline justify-between gap-2 text-xs text-ink-3">
                      <span className="font-medium text-ink-2">
                        {c.author.name}
                        {mine && ' (you)'}
                        {staffAuthor && <span className="ml-2 font-mono uppercase tracking-wider text-moss">staff</span>}
                        {c.isInternal && <span className="ml-2 font-mono uppercase tracking-wider text-amber">internal note · hidden from customer</span>}
                      </span>
                      <time title={fullDate(c.createdAt)}>{timeAgo(c.createdAt)}</time>
                    </div>
                    {/* Rendered as text, never as HTML: a comment containing markup can't inject script. */}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">{c.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {t.attachments.length > 0 && (
            <section className="mt-8">
              <div className="label">Attachments</div>
              <ul className="flex flex-wrap gap-2">
                {t.attachments.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => downloadFile(a.id, a.name)} className="rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-ink">
                      {a.name} <span className="font-mono text-xs text-ink-3">{bytes(a.size)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!closed ? (
            <form onSubmit={submit} className={`mt-8 rounded-md border p-4 ${internal ? 'hatch border-amber/60' : 'border-ink bg-card'}`}>
              <label className="label" htmlFor="reply">{internal ? 'Internal note (staff only)' : 'Reply'}</label>
              <textarea id="reply" className="field min-h-28 bg-transparent" value={body} onChange={(e) => setBody(e.target.value)} maxLength={10000} placeholder={internal ? 'Only agents and admins will see this.' : 'Write a reply…'} />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button className="btn" disabled={reply.isPending || !body.trim()}>{reply.isPending ? 'Sending…' : internal ? 'Add note' : 'Send reply'}</button>
                <input ref={fileInput} type="file" className="sr-only" accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv,.md" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
                <button type="button" className="btn btn-ghost" disabled={busyFile} onClick={() => fileInput.current?.click()}>{busyFile ? 'Uploading…' : 'Attach file'}</button>
                {isStaff && (
                  <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                    Internal note
                  </label>
                )}
              </div>
            </form>
          ) : (
            <p className="mt-8 rounded-md border border-dashed border-line px-4 py-5 text-center font-display text-lg italic text-ink-3">This ticket is closed.</p>
          )}
          <div className="mt-4"><ErrorNote error={mutationError} /></div>
        </div>

        <aside className="h-fit rounded-md border border-line bg-card px-4 py-1 lg:sticky lg:top-8">
          <Rail label="Deadline"><SlaChip ticket={t} /></Rail>
          <Rail label="Priority">
            {isStaff && !closed ? (
              <select className="field !py-1.5" value={t.priority} onChange={(e) => patch.mutate({ priority: e.target.value as Priority })}>
                {['urgent', 'high', 'normal', 'low'].map((p) => <option key={p}>{p}</option>)}
              </select>
            ) : <PriorityMark priority={t.priority} />}
          </Rail>
          <Rail label="Category">
            {isStaff && !closed ? (
              <select className="field !py-1.5" value={t.category} onChange={(e) => patch.mutate({ category: e.target.value as Category })}>
                {['technical', 'billing', 'account', 'other'].map((c) => <option key={c}>{c}</option>)}
              </select>
            ) : <span className="capitalize">{t.category}</span>}
          </Rail>

          {isStaff && (
            <>
              <Rail label="Status">
                <select className="field !py-1.5" value={t.status} disabled={closed} onChange={(e) => patch.mutate({ status: e.target.value as Status })}>
                  <option value={t.status}>{STATUS_LABEL[t.status]}</option>
                  {NEXT[t.status].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </Rail>
              <Rail label="Assignee">
                <select className="field !py-1.5" disabled={closed} value={t.assignee?.id ?? ''} onChange={(e) => patch.mutate({ assigneeId: e.target.value || null })}>
                  <option value="">Unassigned</option>
                  {(staff.data ?? [])
                    .filter((s) => user!.role === 'admin' || s.id === user!.id || s.id === t.assignee?.id)
                    .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {t.assignee?.id !== user!.id && user!.role === 'agent' && !closed && (
                  <button className="mt-2 text-sm underline underline-offset-4" onClick={() => patch.mutate({ assigneeId: user!.id })}>Take this ticket</button>
                )}
              </Rail>
            </>
          )}

          {!isStaff && (
            <Rail label="Assigned to">{t.assignee ? t.assignee.name : <span className="text-ink-3">Waiting for an agent</span>}</Rail>
          )}
          <Rail label="Opened"><span className="text-sm">{fullDate(t.createdAt)}</span></Rail>

          {!isStaff && (
            <div className="flex flex-col gap-2 py-3">
              {t.status === 'resolved' && <button className="btn justify-center" onClick={() => transition.mutate('reopen')}>Not fixed: reopen</button>}
              {!closed && <button className="btn btn-ghost justify-center" onClick={() => confirm('Close this ticket? You will not be able to reply afterwards.') && transition.mutate('close')}>Close ticket</button>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
