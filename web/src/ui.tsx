import type { ReactNode } from 'react';
import type { Priority, Sla, Status, TicketSummary } from './types';

export const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  waiting_customer: 'Waiting on customer',
  resolved: 'Resolved',
  closed: 'Closed',
};

const STATUS_STYLE: Record<Status, string> = {
  open: 'bg-signal-bg text-signal border-signal/40',
  in_progress: 'bg-sky-bg text-sky border-sky/40',
  waiting_customer: 'bg-amber-bg text-amber border-amber/40',
  resolved: 'bg-moss-bg text-moss border-moss/40',
  closed: 'bg-paper-2 text-ink-3 border-line',
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-sm border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

const PRIORITY_BARS: Record<Priority, number> = { low: 1, normal: 2, high: 3, urgent: 4 };

export function PriorityMark({ priority }: { priority: Priority }) {
  const n = PRIORITY_BARS[priority];
  const color = priority === 'urgent' ? 'bg-signal' : priority === 'high' ? 'bg-amber' : 'bg-ink-2';
  return (
    <span className="inline-flex items-center gap-2" title={`${priority} priority`}>
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`w-[3px] rounded-[1px] ${i <= n ? color : 'bg-line'}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      <span className="text-xs capitalize text-ink-2">{priority}</span>
    </span>
  );
}

export function timeAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function span(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60 ? `${m % 60}m` : ''}`.trim();
  return `${Math.round(h / 24)}d`;
}

/** The one SLA line a triager needs: what is due next and whether it is already late. */
export function slaState(t: Pick<TicketSummary, 'status' | 'sla'>): { text: string; late: boolean; muted: boolean } {
  if (t.status === 'resolved' || t.status === 'closed') return { text: 'SLA complete', late: false, muted: true };
  const s: Sla = t.sla;
  const due = new Date(s.firstRespondedAt ? s.resolveDueAt : s.firstResponseDueAt).getTime();
  const label = s.firstRespondedAt ? 'resolve' : 'reply';
  const diff = due - Date.now();
  return diff < 0
    ? { text: `${label} overdue ${span(diff)}`, late: true, muted: false }
    : { text: `${label} in ${span(diff)}`, late: false, muted: false };
}

export function SlaChip({ ticket }: { ticket: Pick<TicketSummary, 'status' | 'sla'> }) {
  const s = slaState(ticket);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs ${s.late ? 'text-signal' : s.muted ? 'text-ink-3' : 'text-ink-2'}`}>
      {s.late && <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-signal" />}
      {s.text}
    </span>
  );
}

export function Avatar({ name, size = 28, tone = 'ink' }: { name: string; size?: number; tone?: 'ink' | 'moss' | 'amber' }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const bg = tone === 'moss' ? 'bg-moss' : tone === 'amber' ? 'bg-amber' : 'bg-ink';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold text-paper ${bg}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="rise mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-5">
      <div>
        <div className="label mb-1">{eyebrow}</div>
        <h1 className="font-display text-4xl font-semibold leading-none tracking-tight">{title}</h1>
      </div>
      {children}
    </header>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="rounded-md border border-signal/40 bg-signal-bg px-3 py-2 text-sm text-signal">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-6 py-14 text-center">
      <div className="font-display text-2xl italic text-ink-2">{title}</div>
      {hint && <p className="mt-1 text-sm text-ink-3">{hint}</p>}
    </div>
  );
}

export function bytes(n: number): string {
  return n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
