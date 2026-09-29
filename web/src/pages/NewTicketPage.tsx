import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { Category, Priority, TicketDetail } from '../types';
import { bytes, ErrorNote, PageHeader } from '../ui';

const CATEGORIES: { value: Category; label: string; hint: string }[] = [
  { value: 'technical', label: 'Technical', hint: 'Something is broken or slow' },
  { value: 'billing', label: 'Billing', hint: 'Invoices, charges, plans' },
  { value: 'account', label: 'Account', hint: 'Login, profile, access' },
  { value: 'other', label: 'Other', hint: 'Anything else' },
];

export default function NewTicketPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('technical');
  const [priority, setPriority] = useState<Priority>('normal');
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const create = useMutation({
    mutationFn: async () => {
      const ticket = await api<TicketDetail>('/tickets', { method: 'POST', body: { subject, description, category, priority } });
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        await api(`/tickets/${ticket.id}/attachments`, { method: 'POST', form });
      }
      return ticket;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      nav(`/tickets/${t.id}`);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <>
      <PageHeader eyebrow="New request" title="How can we help?" />
      <form onSubmit={submit} className="rise grid max-w-2xl gap-6">
        <div>
          <label className="label" htmlFor="subject">Subject</label>
          <input id="subject" className="field text-lg" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} required placeholder="One line that sums it up" />
        </div>

        <fieldset>
          <legend className="label">Category</legend>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {CATEGORIES.map((c) => (
              <label key={c.value} className={`cursor-pointer rounded-md border p-3 transition ${category === c.value ? 'border-ink bg-card shadow-[0_2px_0_rgba(27,26,23,0.25)]' : 'border-line hover:border-ink-3'}`}>
                <input type="radio" name="category" className="sr-only" checked={category === c.value} onChange={() => setCategory(c.value)} />
                <div className="font-medium">{c.label}</div>
                <div className="mt-0.5 text-xs text-ink-3">{c.hint}</div>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label className="label" htmlFor="desc">What happened?</label>
          <textarea id="desc" className="field min-h-44" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={10000} required placeholder="Steps to reproduce, what you expected, what you saw instead." />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="priority">How urgent is it?</label>
            <select id="priority" className="field" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">Low: a question, no rush</option>
              <option value="normal">Normal</option>
              <option value="high">High: blocking my work</option>
            </select>
          </div>
          <div>
            <span className="label">Attachments</span>
            <input ref={input} type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.log,.csv,.md" className="sr-only" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])].slice(0, 5))} />
            <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()}>Add files…</button>
            <p className="mt-1 text-xs text-ink-3">PNG, JPEG, GIF, WebP, PDF or text. Up to 5 MB each.</p>
          </div>
        </div>

        {files.length > 0 && (
          <ul className="divide-y divide-line rounded-md border border-line bg-card text-sm">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2">
                <span className="truncate">{f.name} <span className="font-mono text-xs text-ink-3">{bytes(f.size)}</span></span>
                <button type="button" className="text-ink-3 hover:text-signal" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}

        <ErrorNote error={create.error} />
        <div>
          <button className="btn" disabled={create.isPending}>{create.isPending ? 'Sending…' : 'Submit ticket'}</button>
        </div>
      </form>
    </>
  );
}
