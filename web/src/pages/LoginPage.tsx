import { useState, type FormEvent } from 'react';
import { register } from '../api';
import { useAuth } from '../auth';
import { ErrorNote } from '../ui';

const DEMO_PASSWORD = 'Demo#Helpdesk2026';
const DEMOS = [
  { label: 'Customer', email: 'customer@helpdesk.demo', hint: 'Open and follow tickets' },
  { label: 'Agent', email: 'agent@helpdesk.demo', hint: 'Work the queue, SLA timers' },
  { label: 'Admin', email: 'admin@helpdesk.demo', hint: 'Users, roles, audit log' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      if (mode === 'register') await register(email, name, password);
      await login(email, password);
    });
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-14 text-paper lg:flex">
        <div className="font-display text-3xl font-semibold italic">Helpdesk</div>
        <div className="rise">
          <h1 className="font-display text-7xl font-semibold leading-[0.95] tracking-tight">
            Every question
            <br />
            gets an <em className="text-amber">answer</em>,
            <br />
            on the clock.
          </h1>
          <p className="mt-6 max-w-md text-lg text-paper/65">
            Tickets with SLA timers, internal notes, role-based access and a full audit trail.
          </p>
        </div>
        <ul className="grid max-w-md grid-cols-2 gap-x-8 gap-y-2 font-mono text-xs uppercase tracking-wider text-paper/45">
          <li>JWT + refresh rotation</li>
          <li>Row-level access</li>
          <li>Argon2id hashing</li>
          <li>Verified uploads</li>
        </ul>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full border border-paper/10" />
        <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-96 w-96 rounded-full border border-paper/10" />
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="rise w-full max-w-sm" style={{ animationDelay: '120ms' }}>
          <div className="mb-1 font-display text-3xl font-semibold lg:hidden">Helpdesk</div>
          <div className="label">{mode === 'login' ? 'Sign in' : 'Create account'}</div>
          <h2 className="mb-6 font-display text-4xl font-semibold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Get started'}</h2>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoComplete="name" />
              </div>
            )}
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 10 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'register' && <p className="mt-1 text-xs text-ink-3">At least 10 characters, with a letter and a digit.</p>}
            </div>
            <ErrorNote error={error} />
            <button className="btn w-full justify-center" disabled={busy}>
              {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button className="mt-4 text-sm text-ink-2 underline underline-offset-4" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
            {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>

          <div className="mt-10 border-t border-line pt-6">
            <div className="label">Try a demo account</div>
            <div className="grid gap-2">
              {DEMOS.map((d) => (
                <button
                  key={d.email}
                  disabled={busy}
                  onClick={() => run(() => login(d.email, DEMO_PASSWORD))}
                  className="flex items-baseline justify-between rounded-md border border-line bg-card px-3 py-2 text-left transition hover:border-ink hover:shadow-[0_2px_0_rgba(27,26,23,0.2)]"
                >
                  <span className="font-medium">{d.label}</span>
                  <span className="text-xs text-ink-3">{d.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
