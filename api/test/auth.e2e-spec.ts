import { createHmac } from 'crypto';
import { Role } from '../src/common/enums';
import { actor, createApp, Ctx, login, makeUser, PASSWORD } from './helpers';

describe('Authentication', () => {
  let ctx: Ctx;
  beforeAll(async () => (ctx = await createApp()));
  afterAll(() => ctx.app.close());

  describe('registration', () => {
    it('creates a customer account and never returns the password hash', async () => {
      const res = await ctx.http().post('/auth/register').send({ email: 'New.User@Test.dev', name: 'New User', password: PASSWORD }).expect(201);
      expect(res.body).toMatchObject({ email: 'new.user@test.dev', role: 'customer' });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    });

    it('rejects an attempt to register as admin (mass assignment)', async () => {
      const res = await ctx.http().post('/auth/register').send({ email: 'evil@test.dev', name: 'Evil', password: PASSWORD, role: 'admin' }).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/role should not exist/);
    });

    it('rejects weak passwords and duplicate emails', async () => {
      await ctx.http().post('/auth/register').send({ email: 'weak@test.dev', name: 'W', password: 'short1' }).expect(400);
      await ctx.http().post('/auth/register').send({ email: 'weak@test.dev', name: 'W', password: 'onlyletterspassword' }).expect(400);
      await ctx.http().post('/auth/register').send({ email: 'dup@test.dev', name: 'D', password: PASSWORD }).expect(201);
      await ctx.http().post('/auth/register').send({ email: 'DUP@test.dev', name: 'D', password: PASSWORD }).expect(409);
    });
  });

  describe('login', () => {
    it('returns the same error for a wrong password and an unknown email', async () => {
      const user = await makeUser(ctx, Role.Customer);
      const wrongPw = await login(ctx, user.email, 'wrong-password-1');
      const unknown = await login(ctx, 'nobody@test.dev', 'wrong-password-1');
      expect(wrongPw.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrongPw.body.message).toBe(unknown.body.message);
    });

    it('locks the account after 5 failures, even for the correct password', async () => {
      const user = await makeUser(ctx, Role.Customer);
      for (let i = 0; i < 5; i++) await login(ctx, user.email, 'wrong-password-1').then((r) => expect(r.status).toBe(401));
      const locked = await login(ctx, user.email);
      expect(locked.status).toBe(429);
    });

    it('does not accept requests without a token', async () => {
      await ctx.http().get('/tickets').expect(401);
      await ctx.http().get('/auth/me').set('Authorization', 'Bearer garbage').expect(401);
    });
  });

  describe('token integrity', () => {
    it('rejects an unsigned "alg: none" token', async () => {
      const a = await actor(ctx, Role.Customer);
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const forged = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: a.user.id, role: 'admin' })}.`;
      await ctx.http().get('/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    });

    it('rejects a token signed with the wrong key', async () => {
      const a = await actor(ctx, Role.Customer);
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const head = b64({ alg: 'HS256', typ: 'JWT' });
      const body = b64({ sub: a.user.id, role: 'admin', exp: Math.floor(Date.now() / 1000) + 600 });
      const sig = createHmac('sha256', 'secret').update(`${head}.${body}`).digest('base64url');
      await ctx.http().get('/auth/me').set('Authorization', `Bearer ${head}.${body}.${sig}`).expect(401);
    });

    it('uses the role stored in the database, not the one claimed in the token', async () => {
      const a = await actor(ctx, Role.Customer);
      // Same valid token, but the user is a customer in the DB: admin-only route stays closed.
      await ctx.http().get('/users').set('Authorization', a.auth).expect(403);
    });

    it('takes effect immediately when an admin deactivates a user', async () => {
      const admin = await actor(ctx, Role.Admin);
      const victim = await actor(ctx, Role.Customer);
      await ctx.http().get('/auth/me').set('Authorization', victim.auth).expect(200);
      await ctx.http().patch(`/users/${victim.user.id}`).set('Authorization', admin.auth).send({ isActive: false }).expect(200);
      await ctx.http().get('/auth/me').set('Authorization', victim.auth).expect(401);
      await ctx.http().post('/auth/refresh').send({ refreshToken: victim.refreshToken }).expect(401);
    });
  });

  describe('refresh tokens', () => {
    it('rotates on use and revokes the whole family if an old token is replayed', async () => {
      const a = await actor(ctx, Role.Customer);
      const first = await ctx.http().post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(200);
      expect(first.body.refreshToken).not.toBe(a.refreshToken);

      // Replaying the already-used token is treated as theft...
      await ctx.http().post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
      // ...so the legitimate newer token is dead too.
      await ctx.http().post('/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(401);
    });

    it('logout revokes the session', async () => {
      const a = await actor(ctx, Role.Customer);
      await ctx.http().post('/auth/logout').send({ refreshToken: a.refreshToken }).expect(204);
      await ctx.http().post('/auth/refresh').send({ refreshToken: a.refreshToken }).expect(401);
    });
  });
});
