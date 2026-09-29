import { Role } from '../src/common/enums';
import { Ticket } from '../src/entities/ticket.entity';
import { actor, createApp, Ctx, openTicket } from './helpers';

describe('Tickets: access control and workflow', () => {
  let ctx: Ctx;
  beforeAll(async () => (ctx = await createApp()));
  afterAll(() => ctx.app.close());

  describe('row-level access (IDOR)', () => {
    it('hides other customers\' tickets behind 404, for read, comment and update', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const bob = await actor(ctx, Role.Customer, 'bob');
      const t = await openTicket(ctx, alice.auth);

      await ctx.http().get(`/tickets/${t.id}`).set('Authorization', bob.auth).expect(404);
      await ctx.http().post(`/tickets/${t.id}/comments`).set('Authorization', bob.auth).send({ body: 'hi' }).expect(404);
      await ctx.http().post(`/tickets/${t.id}/close`).set('Authorization', bob.auth).expect(404);
      await ctx.http().get(`/tickets/${t.id}`).set('Authorization', alice.auth).expect(200);
    });

    it('scopes lists to the caller even if they pass filters aimed at other users', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const bob = await actor(ctx, Role.Customer, 'bob');
      await openTicket(ctx, alice.auth, { subject: 'Alice ticket' });
      await openTicket(ctx, bob.auth, { subject: 'Bob ticket' });

      const res = await ctx.http().get('/tickets').query({ pageSize: 100 }).set('Authorization', bob.auth).expect(200);
      expect(res.body.items.every((t: any) => t.requester.id === bob.user.id)).toBe(true);
      expect(res.body.items.map((t: any) => t.subject)).not.toContain('Alice ticket');
    });

    it('lets staff see the whole queue', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      const t = await openTicket(ctx, alice.auth);
      await ctx.http().get(`/tickets/${t.id}`).set('Authorization', agent.auth).expect(200);
    });

    it('does not allow customers to use staff endpoints', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const t = await openTicket(ctx, alice.auth);
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', alice.auth).send({ status: 'resolved' }).expect(403);
      await ctx.http().get('/stats').set('Authorization', alice.auth).expect(403);
      await ctx.http().get('/audit').set('Authorization', alice.auth).expect(403);
      await ctx.http().get('/users/staff').set('Authorization', alice.auth).expect(403);
    });
  });

  describe('internal notes', () => {
    it('are visible to staff and never to the customer', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      const t = await openTicket(ctx, alice.auth);

      await ctx.http().post(`/tickets/${t.id}/comments`).set('Authorization', agent.auth).send({ body: 'secret escalation plan', isInternal: true }).expect(201);
      await ctx.http().post(`/tickets/${t.id}/comments`).set('Authorization', agent.auth).send({ body: 'We are on it.' }).expect(201);

      const asCustomer = await ctx.http().get(`/tickets/${t.id}`).set('Authorization', alice.auth).expect(200);
      expect(JSON.stringify(asCustomer.body)).not.toMatch(/secret escalation plan/);
      expect(asCustomer.body.comments).toHaveLength(1);

      const asAgent = await ctx.http().get(`/tickets/${t.id}`).set('Authorization', agent.auth).expect(200);
      expect(asAgent.body.comments).toHaveLength(2);
    });

    it('cannot be created by a customer, even by sending isInternal', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const t = await openTicket(ctx, alice.auth);
      const res = await ctx.http().post(`/tickets/${t.id}/comments`).set('Authorization', alice.auth).send({ body: 'hi', isInternal: true }).expect(201);
      expect(res.body.comments[0].isInternal).toBe(false);
    });
  });

  describe('workflow and SLA', () => {
    it('a staff reply stops the first-response clock, assigns the agent and moves the ticket on', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      const t = await openTicket(ctx, alice.auth);
      expect(t.sla.firstRespondedAt).toBeNull();

      const res = await ctx.http().post(`/tickets/${t.id}/comments`).set('Authorization', agent.auth).send({ body: 'Looking now' }).expect(201);
      expect(res.body.status).toBe('in_progress');
      expect(res.body.assignee.id).toBe(agent.user.id);
      expect(res.body.sla.firstRespondedAt).not.toBeNull();
    });

    it('enforces the status transition table', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      const t = await openTicket(ctx, alice.auth);

      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agent.auth).send({ status: 'waiting_customer' }).expect(409); // open -> waiting is not allowed
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agent.auth).send({ status: 'resolved' }).expect(200);
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agent.auth).send({ status: 'closed' }).expect(200);
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agent.auth).send({ status: 'open' }).expect(409); // closed is terminal
      await ctx.http().post(`/tickets/${t.id}/comments`).set('Authorization', alice.auth).send({ body: 'still there?' }).expect(409);
    });

    it('a customer reply reopens a resolved ticket', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      const t = await openTicket(ctx, alice.auth);
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agent.auth).send({ status: 'resolved' }).expect(200);
      const res = await ctx.http().post(`/tickets/${t.id}/comments`).set('Authorization', alice.auth).send({ body: 'Not actually fixed' }).expect(201);
      expect(res.body.status).toBe('open');
      expect(res.body.resolvedAt).toBeNull();
    });

    it('customers cannot request urgent priority; changing priority moves the deadlines', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      await ctx.http().post('/tickets').set('Authorization', alice.auth).send({ subject: 'x', description: 'y', priority: 'urgent' }).expect(400);

      const t = await openTicket(ctx, alice.auth, { priority: 'low' });
      const res = await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agent.auth).send({ priority: 'urgent' }).expect(200);
      expect(new Date(res.body.sla.resolveDueAt).getTime()).toBeLessThan(new Date(t.sla.resolveDueAt).getTime());
    });

    it('flags and filters overdue tickets', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      const t = await openTicket(ctx, alice.auth, { subject: 'Overdue one' });
      await ctx.ds.getRepository(Ticket).update(t.id, { firstResponseDueAt: new Date(Date.now() - 3_600_000) });

      const detail = await ctx.http().get(`/tickets/${t.id}`).set('Authorization', agent.auth).expect(200);
      expect(detail.body.sla.firstResponseOverdue).toBe(true);

      const list = await ctx.http().get('/tickets').query({ overdue: 'true', pageSize: 100 }).set('Authorization', agent.auth).expect(200);
      expect(list.body.items.map((i: any) => i.id)).toContain(t.id);
    });
  });

  describe('assignment rules', () => {
    it('agents can take a ticket but not assign it to someone else; admins can', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agentA = await actor(ctx, Role.Agent, 'agentA');
      const agentB = await actor(ctx, Role.Agent, 'agentB');
      const admin = await actor(ctx, Role.Admin);
      const t = await openTicket(ctx, alice.auth);

      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agentA.auth).send({ assigneeId: agentB.user.id }).expect(403);
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', agentA.auth).send({ assigneeId: agentA.user.id }).expect(200);
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', admin.auth).send({ assigneeId: agentB.user.id }).expect(200);
      // a customer is not a valid assignee
      await ctx.http().patch(`/tickets/${t.id}`).set('Authorization', admin.auth).send({ assigneeId: alice.user.id }).expect(400);
    });
  });

  describe('search (SQL injection resistance)', () => {
    it('treats injection payloads as plain text', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      const agent = await actor(ctx, Role.Agent);
      await openTicket(ctx, alice.auth, { subject: 'Normal ticket' });

      for (const payload of [`' OR '1'='1`, `'; DROP TABLE tickets; --`, `" OR 1=1 --`, `') UNION SELECT passwordHash FROM users --`]) {
        const res = await ctx.http().get('/tickets').query({ q: payload }).set('Authorization', agent.auth).expect(200);
        expect(res.body.total).toBe(0);
      }
      // ...and the table is still there and populated.
      const all = await ctx.http().get('/tickets').set('Authorization', agent.auth).expect(200);
      expect(all.body.total).toBeGreaterThan(0);
    });

    it('escapes LIKE wildcards, so "%" does not match everything', async () => {
      const alice = await actor(ctx, Role.Customer, 'alice');
      await openTicket(ctx, alice.auth, { subject: 'Discount is 100% off' });
      await openTicket(ctx, alice.auth, { subject: 'No wildcard here' });

      const percent = await ctx.http().get('/tickets').query({ q: '%' }).set('Authorization', alice.auth).expect(200);
      expect(percent.body.items.map((i: any) => i.subject)).toEqual(['Discount is 100% off']);
      const underscore = await ctx.http().get('/tickets').query({ q: '_' }).set('Authorization', alice.auth).expect(200);
      expect(underscore.body.total).toBe(0);
    });

    it('validates query parameters', async () => {
      const agent = await actor(ctx, Role.Agent);
      await ctx.http().get('/tickets').query({ sortBy: 'passwordHash; DROP TABLE users' }).set('Authorization', agent.auth).expect(400);
      await ctx.http().get('/tickets').query({ status: 'nonsense' }).set('Authorization', agent.auth).expect(400);
      await ctx.http().get('/tickets').query({ pageSize: 100000 }).set('Authorization', agent.auth).expect(400);
      await ctx.http().get('/tickets/abc').set('Authorization', agent.auth).expect(400);
    });
  });

  describe('admin functions', () => {
    it('admins manage roles; nobody can change their own; the audit log records it', async () => {
      const admin = await actor(ctx, Role.Admin);
      const alice = await actor(ctx, Role.Customer, 'alice');

      await ctx.http().patch(`/users/${admin.user.id}`).set('Authorization', admin.auth).send({ role: 'customer' }).expect(400);
      await ctx.http().patch(`/users/${alice.user.id}`).set('Authorization', admin.auth).send({ role: 'agent' }).expect(200);
      await ctx.http().patch(`/users/${alice.user.id}`).set('Authorization', alice.auth).send({ role: 'admin' }).expect(403);

      const audit = await ctx.http().get('/audit').query({ action: 'user.update' }).set('Authorization', admin.auth).expect(200);
      expect(audit.body.items[0]).toMatchObject({ action: 'user.update', actorId: admin.user.id });
    });

    it('stats are computed for staff', async () => {
      const agent = await actor(ctx, Role.Agent);
      const res = await ctx.http().get('/stats').set('Authorization', agent.auth).expect(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.last14Days).toHaveLength(14);
    });
  });
});
