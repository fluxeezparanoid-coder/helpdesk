import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Stats, Status } from '../types';
import { ErrorNote, PageHeader, STATUS_LABEL } from '../ui';

function Figure({ label, value, sub, tone, to, delay }: { label: string; value: string | number; sub?: string; tone?: 'signal'; to?: string; delay: number }) {
  const body = (
    <div className="rise h-full border-l-2 border-ink pl-4 transition group-hover:border-signal" style={{ animationDelay: `${delay}ms` }}>
      <div className="label">{label}</div>
      <div className={`font-display text-6xl font-semibold leading-none tracking-tight ${tone === 'signal' ? 'text-signal' : ''}`}>{value}</div>
      {sub && <div className="mt-2 text-sm text-ink-3">{sub}</div>}
    </div>
  );
  return to ? <Link to={to} className="group block">{body}</Link> : <div className="group">{body}</div>;
}

const STATUS_BAR: Record<Status, string> = {
  open: 'bg-signal',
  in_progress: 'bg-sky',
  waiting_customer: 'bg-amber',
  resolved: 'bg-moss',
  closed: 'bg-ink-3',
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, error } = useQuery({ queryKey: ['stats'], queryFn: () => api<Stats>('/stats'), refetchInterval: 60_000 });

  if (error) return <ErrorNote error={error} />;
  if (!data) return <div className="font-display text-2xl italic text-ink-3">Loading…</div>;

  const maxDay = Math.max(1, ...data.last14Days.flatMap((d) => [d.created, d.resolved]));
  const maxStatus = Math.max(1, ...Object.values(data.byStatus));
  const first = user!.name.split(' ')[0];
  const avg = data.avgFirstResponseMinutes;

  return (
    <>
      <PageHeader eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} title={<>Good day, <em>{first}</em>.</>} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
        <Figure label="Active" value={data.active} sub={`of ${data.total} tickets`} to="/tickets" delay={0} />
        <Figure label="Overdue" value={data.overdue} sub="past an SLA deadline" tone={data.overdue ? 'signal' : undefined} to="/tickets?overdue=true" delay={60} />
        <Figure label="Unassigned" value={data.unassigned} sub="nobody owns these yet" to="/tickets?unassigned=true" delay={120} />
        <Figure label="First reply" value={avg === null ? '–' : avg < 90 ? `${avg}m` : `${(avg / 60).toFixed(1)}h`} sub="average response time" delay={180} />
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <section className="rise" style={{ animationDelay: '240ms' }}>
          <h2 className="label">Last 14 days</h2>
          <div className="mb-2 flex gap-4 text-xs text-ink-2">
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 bg-ink" /> opened</span>
            <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 bg-moss" /> resolved</span>
          </div>
          <div className="flex h-44 items-end gap-1.5 border-b border-ink" role="img" aria-label="Tickets opened and resolved per day, last 14 days">
            {data.last14Days.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center gap-[2px]" title={`${d.date}: ${d.created} opened, ${d.resolved} resolved`}>
                <div className="w-full bg-ink transition-all group-hover:opacity-80" style={{ height: `${(d.created / maxDay) * 100}%`, minHeight: d.created ? 3 : 0 }} />
                <div className="w-full bg-moss transition-all group-hover:opacity-80" style={{ height: `${(d.resolved / maxDay) * 100}%`, minHeight: d.resolved ? 3 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-3">
            <span>{data.last14Days[0].date.slice(5)}</span>
            <span>{data.last14Days[13].date.slice(5)}</span>
          </div>
        </section>

        <section className="rise" style={{ animationDelay: '300ms' }}>
          <h2 className="label">By status</h2>
          <ul className="space-y-3">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <li key={s}>
                <Link to={`/tickets?status=${s}`} className="group block">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="group-hover:underline">{STATUS_LABEL[s]}</span>
                    <span className="font-mono">{data.byStatus[s]}</span>
                  </div>
                  <div className="h-2 bg-paper-2">
                    <div className={`h-full ${STATUS_BAR[s]}`} style={{ width: `${(data.byStatus[s] / maxStatus) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
