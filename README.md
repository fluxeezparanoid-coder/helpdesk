# Helpdesk: support ticket system

A support desk where customers open tickets, agents work a queue against **SLA timers**, and admins manage users and read a **security audit log**. NestJS + PostgreSQL API with JWT auth and role-based access, plus a React front end.

**Live demo:** https://helpdesk-web-i6wr.onrender.com  (API docs: https://helpdesk-api-t41s.onrender.com/docs)

> Free hosting: the API sleeps when idle, so the first request after a pause can take up to a minute. Demo logins are listed below.

![Agent dashboard](docs/02-dashboard.png)

| Ticket queue with SLA countdowns | Ticket thread with internal notes |
|---|---|
| ![Queue](docs/03-queue.png) | ![Ticket](docs/05-ticket-agent.png) |
| **Customer view** | **Audit log (admin)** |
| ![Customer](docs/06-customer-tickets.png) | ![Audit](docs/09-audit.png) |

| | |
|---|---|
| **API** | NestJS 11 · TypeScript · TypeORM · PostgreSQL 17 · Swagger/OpenAPI (`/docs`) |
| **Auth** | JWT access tokens (15 min) · rotating refresh tokens with reuse detection · Argon2id · account lockout |
| **Access control** | Roles (customer / agent / admin) · row-level scoping · status transition table |
| **Front end** | React 19 · TypeScript · Vite · Tailwind CSS 4 · TanStack Query |
| **Quality** | 36 end-to-end tests (run on SQLite and on PostgreSQL) · CI · Docker Compose |

---

## What it does

- **Customers** open tickets with attachments, follow the thread, reply, reopen a resolved ticket or close it. They only ever see their own tickets.
- **Agents** work one shared queue: filter by status, priority, *mine*, *unassigned*, *overdue*; take tickets; reply to customers; leave **internal notes** customers can never see; move tickets through a defined workflow.
- **SLA timers.** Each priority has a first-response and a resolution deadline (urgent 1h/4h, high 4h/24h, normal 8h/48h, low 24h/72h). A staff reply stops the first-response clock; overdue tickets are flagged and filterable.
- **Admins** get everything above plus user management (create staff, change roles, deactivate) and an audit log of logins, lockouts, role changes and ticket updates.
- **Dashboard** with active / overdue / unassigned counts, average first response time and a 14-day opened-vs-resolved chart.

## Run it

### Docker (PostgreSQL + API + nginx)

```bash
cp .env.example .env     # set POSTGRES_PASSWORD and JWT_SECRET (32+ random characters)
docker compose up --build
```

Open **http://localhost:8080** (Swagger UI at **http://localhost:8080/api/docs**).

### Local development (no Docker, no database to install)

Without `DATABASE_URL` the API falls back to SQLite, so this works on a bare machine:

```bash
cd api && npm install && npm run build
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))") \
  SQLITE_PATH=./dev.sqlite node dist/main.js                # API on :3000, Swagger on /docs

cd web && npm install && npm run dev                        # UI on :5173, proxies /api to :3000
```

To use PostgreSQL locally, set `DATABASE_URL=postgres://user:pass@localhost:5432/helpdesk`.

### Demo accounts

Seeded on first start (disable with `SEED_DEMO=false`). Password for all: `Demo#Helpdesk2026` (demo data only).

| Role | Email | Try |
|---|---|---|
| Customer | `customer@helpdesk.demo` | Open a ticket, attach a file, reply, close it |
| Agent | `agent@helpdesk.demo` | Work the queue, add an internal note, resolve tickets |
| Admin | `admin@helpdesk.demo` | Change a role, deactivate a user, read the audit log |

The seed creates 48 tickets across three weeks, so dashboards and SLA states are populated.

## Security design

Each row is something the API does on purpose, and most are pinned by a test in `api/test/`.

| Threat | What the API does |
|---|---|
| **SQL injection** | Every value reaches the database as a bound parameter, including search terms. `LIKE` wildcards are escaped so `%` doesn't match everything. Sort fields are validated against a whitelist. Tests fire injection payloads at `?q=`. |
| **Broken object-level authorisation (IDOR)** | Customer queries are always constrained to `requesterId = me`. Someone else's ticket, comment target or attachment returns **404**, not 403, so ticket numbers can't be probed. |
| **Broken function-level authorisation** | Global guards run in order: rate limit → authenticate → role check. Routes are deny-by-default (`@Public()` opts out). Roles are read from the database on every request, not trusted from the token, so a demoted or deactivated user loses access immediately. |
| **Mass assignment** | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`. `POST /auth/register {"role":"admin"}` is rejected. Customers can't create internal notes even if they send `isInternal: true`. |
| **Weak or forged JWTs** | Algorithm pinned to HS256 on sign *and* verify (`alg: none` and wrong-key tokens are rejected). The signing secret must be supplied (32+ chars) and the app refuses to boot in production without it. |
| **Token theft / replay** | Refresh tokens are opaque, stored only as SHA-256, and **rotate on every use**. Presenting a used token revokes the whole login family. Logout and deactivation revoke sessions. |
| **Password attacks** | Argon2id hashing. Lockout after 5 failures (15 min). Unknown emails do the same amount of hashing work and return the same message, so login doesn't reveal which accounts exist. Credential endpoints have their own strict rate limit. |
| **Malicious uploads** | The file type is decided from the **bytes** (magic numbers), not the client's `Content-Type` or extension. Allowlist: PNG, JPEG, GIF, WebP, PDF, plain text. Extension/content mismatch, SVG, HTML and executables are rejected. Files are stored under a random name (client names never touch the filesystem) and served as `attachment` with `nosniff`. 5 MB limit, 10 per ticket. |
| **XSS** | The UI renders all user text as text (never HTML). API and nginx send CSP and security headers (Helmet). Bearer tokens, not cookies, so there is no CSRF surface. |
| **Repudiation** | Logins, failures, lockouts, refresh-token reuse, role changes, ticket changes and uploads are written to an audit log that only admins can read. |

## API at a glance

Full interactive docs at `/docs`.

| | |
|---|---|
| `POST /auth/register` `login` `refresh` `logout` · `GET /auth/me` | Authentication |
| `GET/POST /tickets` · `GET /tickets/:id` | List (scoped by role, filters, search, pagination) · open · detail |
| `PATCH /tickets/:id` | Staff: status (validated transitions), priority, category, assignee |
| `POST /tickets/:id/close` `reopen` | Customer actions |
| `POST /tickets/:id/comments` | Reply or (staff) internal note |
| `POST /tickets/:id/attachments` · `GET /attachments/:id` | Upload · download |
| `GET /stats` | Staff dashboard numbers |
| `GET/POST /users` · `PATCH /users/:id` · `GET /users/staff` | Admin user management |
| `GET /audit` | Admin audit log |

**Ticket workflow:** `open → in_progress ⇄ waiting_customer → resolved → closed`. A customer reply on a *waiting* ticket resumes it; a customer reply on a *resolved* ticket reopens it; `closed` is terminal.

## Tests

```bash
cd api
npm test                                                                  # SQLite, no setup
DATABASE_URL=postgres://helpdesk:helpdesk@localhost:5432/helpdesk npm test   # same suite on PostgreSQL
```

36 end-to-end tests boot the real app (same pipes, guards and validation as production). They cover registration and mass assignment, lockout, refresh rotation and reuse, forged tokens, IDOR, internal-note visibility, the status machine, SLA flags, assignment rules, SQL-injection payloads, upload validation and path traversal. CI runs them on both databases.

## Project layout

```
api/src
  auth/      JWT guard, roles guard, login/refresh/lockout
  tickets/   tickets, comments, SLA, attachments, file-type detection
  users/     admin user management
  audit/     audit log service + endpoint
  stats/     dashboard aggregates
  entities/  TypeORM entities
api/test     end-to-end security and workflow tests
web/src      React app (pages/, api client with token refresh)
```

## Notes and trade-offs

- **Schema management.** TypeORM `synchronize` creates tables on startup. That's convenient for a demo; a production deployment should switch to migrations (`DB_SYNCHRONIZE=false`).
- **Refresh token storage.** The browser keeps the refresh token in `sessionStorage` (per tab). An httpOnly cookie would be stronger against XSS at the cost of adding CSRF protection; the API's bearer-token design keeps the demo simple.
- **Uploads** go to a local volume. For multiple API instances, swap `AttachmentsService` to S3-compatible storage (and add virus scanning).
- **Notifications** (email on status change) are not implemented.
- **Rate limiting** is in-memory; use a shared store (Redis) if you run more than one instance.
