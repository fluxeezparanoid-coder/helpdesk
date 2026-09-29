import { useQuery } from '@tanstack/react-query';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from './api';
import { useAuth } from './auth';
import type { Page, TicketSummary } from './types';
import { Avatar } from './ui';

function Item({ to, children, count }: { to: string; children: string; count?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `group flex items-center justify-between rounded-md px-3 py-2 text-[15px] transition-colors ${
          isActive ? 'bg-paper text-ink' : 'text-paper/70 hover:bg-paper/10 hover:text-paper'
        }`
      }
    >
      <span>{children}</span>
      {count !== undefined && count > 0 && <span className="rounded-full bg-signal px-1.5 font-mono text-[11px] text-white">{count}</span>}
    </NavLink>
  );
}

export default function Layout() {
  const { user, isStaff, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Badge on "Tickets" nav for staff: how many are past a deadline right now.
  const overdue = useQuery({
    queryKey: ['overdue-count'],
    enabled: isStaff,
    refetchInterval: 60_000,
    queryFn: () => api<Page<TicketSummary>>('/tickets', { query: { overdue: true, pageSize: 1 } }),
  });

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col bg-ink px-4 py-5 text-paper md:sticky md:top-0 md:h-screen md:w-64">
        <div className="mb-8 flex items-baseline gap-2 px-3">
          <span className="font-display text-3xl font-semibold italic tracking-tight">Helpdesk</span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-paper/40">v1</span>
        </div>

        <nav className="flex flex-1 flex-row gap-1 overflow-x-auto md:flex-col" aria-label="Main">
          {isStaff && <Item to="/">Dashboard</Item>}
          <Item to="/tickets" count={isStaff ? overdue.data?.total : undefined}>
            {isStaff ? 'Ticket queue' : 'My tickets'}
          </Item>
          {!isStaff && <Item to="/new">New ticket</Item>}
          {isAdmin && (
            <>
              <div className="mt-5 hidden px-3 font-mono text-[10px] uppercase tracking-widest text-paper/40 md:block">Admin</div>
              <Item to="/users">Users</Item>
              <Item to="/audit">Audit log</Item>
            </>
          )}
        </nav>

        <div className="mt-4 flex items-center gap-3 border-t border-paper/15 px-3 pt-4">
          <Avatar name={user!.name} size={34} tone="amber" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{user!.name}</div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-paper/50">{user!.role}</div>
          </div>
          <button onClick={logout} className="rounded px-2 py-1 text-xs text-paper/60 underline-offset-2 hover:text-paper hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 md:px-12 md:py-10">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
