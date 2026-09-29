import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import type { Page, Role, User } from '../types';
import { Avatar, ErrorNote, PageHeader, timeAgo } from '../ui';

export default function UsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'agent' as Role });

  const { data, error } = useQuery({
    queryKey: ['users', role, q, page],
    placeholderData: keepPreviousData,
    queryFn: () => api<Page<User>>('/users', { query: { role, q, page, pageSize: 15 } }),
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: Role; isActive?: boolean }) => api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
  const create = useMutation({
    mutationFn: () => api('/users', { method: 'POST', body: form }),
    onSuccess: () => {
      setCreating(false);
      setForm({ name: '', email: '', password: '', role: 'agent' });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <>
      <PageHeader eyebrow="Admin" title="Users">
        <button className="btn" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : 'Add staff member'}</button>
      </PageHeader>

      {creating && (
        <form onSubmit={submit} className="rise mb-8 grid gap-4 rounded-md border border-ink bg-card p-5 md:grid-cols-2">
          <div><label className="label" htmlFor="n">Name</label><input id="n" className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="e">Email</label><input id="e" type="email" className="field" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label" htmlFor="p">Temporary password</label><input id="p" type="password" minLength={10} className="field" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" /></div>
          <div>
            <label className="label" htmlFor="r">Role</label>
            <select id="r" className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="agent">Agent</option><option value="admin">Admin</option><option value="customer">Customer</option>
            </select>
          </div>
          <div className="md:col-span-2"><ErrorNote error={create.error} /></div>
          <div><button className="btn" disabled={create.isPending}>Create user</button></div>
        </form>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <select aria-label="Role" className="field !w-auto" value={role} onChange={(e) => { setRole(e.target.value as Role | ''); setPage(1); }}>
          <option value="">All roles</option><option value="customer">Customers</option><option value="agent">Agents</option><option value="admin">Admins</option>
        </select>
        <input aria-label="Search users" className="field !w-64" placeholder="Search name or email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>

      <ErrorNote error={error ?? update.error} />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ink">
            <tr className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              <th className="py-2 pr-4 font-normal">User</th><th className="pr-4 font-normal">Role</th><th className="pr-4 font-normal">Joined</th><th className="text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.items.map((u) => {
              const self = u.id === me!.id;
              return (
                <tr key={u.id} className={u.isActive ? '' : 'text-ink-3'}>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <Avatar name={u.name} />
                      <div><div className="font-medium">{u.name}{self && <span className="ml-2 font-mono text-[10px] uppercase text-ink-3">you</span>}</div><div className="text-xs text-ink-3">{u.email}</div></div>
                    </div>
                  </td>
                  <td className="pr-4">
                    <select aria-label={`Role for ${u.name}`} className="field !w-auto !py-1" disabled={self} value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })}>
                      <option value="customer">customer</option><option value="agent">agent</option><option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="pr-4 text-ink-3">{u.createdAt ? timeAgo(u.createdAt) : ''}</td>
                  <td className="text-right">
                    <button
                      disabled={self}
                      onClick={() => update.mutate({ id: u.id, isActive: !u.isActive })}
                      className={`rounded-md border px-3 py-1 text-xs transition disabled:opacity-40 ${u.isActive ? 'border-line hover:border-signal hover:text-signal' : 'border-moss text-moss'}`}
                    >
                      {u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="mt-5 flex items-center justify-between text-sm">
          <span className="font-mono text-ink-3">{data.total} users</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <button className="btn btn-ghost" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}
    </>
  );
}
