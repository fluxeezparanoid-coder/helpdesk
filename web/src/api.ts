import type { User } from './types';

const BASE = '/api';
const REFRESH_KEY = 'helpdesk.refresh';

/**
 * Token handling: the short-lived access token lives only in memory; the refresh token is kept in
 * sessionStorage (per tab, cleared on close). An httpOnly cookie would be stronger against XSS,
 * at the cost of CSRF handling: see the README's security notes.
 */
let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
let refreshing: Promise<boolean> | null = null;

export const setSessionLostHandler = (fn: () => void) => (onSessionLost = fn);

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function messageFrom(body: unknown, fallback: string): string {
  const m = (body as { message?: string | string[] } | null)?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? fallback);
}

function saveTokens(t: { accessToken: string; refreshToken: string }) {
  accessToken = t.accessToken;
  sessionStorage.setItem(REFRESH_KEY, t.refreshToken);
}

export function clearTokens() {
  accessToken = null;
  sessionStorage.removeItem(REFRESH_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  // Single flight: parallel 401s share one refresh, otherwise rotation would reject the second call.
  refreshing ??= fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      saveTokens(await r.json());
      return true;
    })
    .catch(() => false)
    .finally(() => (refreshing = null));
  return refreshing;
}

interface Opts {
  method?: string;
  body?: unknown;
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  auth?: boolean;
}

function buildUrl(path: string, query?: Opts['query']) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `${BASE}${path}${s ? `?${s}` : ''}`;
}

async function send(path: string, opts: Opts): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.auth !== false && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
}

async function request(path: string, opts: Opts = {}): Promise<Response> {
  let res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false && (await tryRefresh())) res = await send(path, opts);
  if (res.status === 401 && opts.auth !== false) {
    clearTokens();
    onSessionLost?.();
  }
  return res;
}

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const res = await request(path, opts);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, messageFrom(body, res.statusText));
  return body as T;
}

/** Attachments need the bearer header, so they're fetched and saved as a blob rather than linked. */
export async function downloadFile(id: string, name: string) {
  const res = await request(`/attachments/${id}`);
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function login(email: string, password: string): Promise<User> {
  const res = await api<{ accessToken: string; refreshToken: string; user: User }>('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  saveTokens(res);
  return res.user;
}

export const register = (email: string, name: string, password: string) =>
  api<User>('/auth/register', { method: 'POST', body: { email, name, password }, auth: false });

export async function restoreSession(): Promise<User | null> {
  if (!sessionStorage.getItem(REFRESH_KEY)) return null;
  if (!(await tryRefresh())) {
    clearTokens();
    return null;
  }
  return api<User>('/auth/me').catch(() => null);
}

export async function logout() {
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  clearTokens();
  if (refreshToken) await api('/auth/logout', { method: 'POST', body: { refreshToken }, auth: false }).catch(() => undefined);
}
