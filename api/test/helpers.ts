import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/config/app';
import { Role } from '../src/common/enums';
import { User } from '../src/entities/user.entity';

export const PASSWORD = 'Sup3rSecret-pass';

export interface Ctx {
  app: INestApplication;
  ds: DataSource;
  http: () => ReturnType<typeof request>;
}

export async function createApp(): Promise<Ctx> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, ds: app.get(DataSource), http: () => request(app.getHttpServer()) };
}

let counter = 0;

/** Insert a user with any role directly (self-registration only ever creates customers). */
export async function makeUser(ctx: Ctx, role: Role, name: string = role) {
  const email = `${name}${++counter}@test.dev`.toLowerCase();
  const repo = ctx.ds.getRepository(User);
  const user = await repo.save(repo.create({ email, name: `${name} ${counter}`, role, passwordHash: await argon2.hash(PASSWORD), isActive: true }));
  return { ...user, email };
}

export async function login(ctx: Ctx, email: string, password = PASSWORD) {
  const res = await ctx.http().post('/auth/login').send({ email, password });
  return res;
}

/** Create a user and return a ready-to-use bearer header plus tokens. */
export async function actor(ctx: Ctx, role: Role, name: string = role) {
  const user = await makeUser(ctx, role, name);
  const res = await login(ctx, user.email);
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user, token: res.body.accessToken as string, refreshToken: res.body.refreshToken as string, auth: `Bearer ${res.body.accessToken}` };
}

export async function openTicket(ctx: Ctx, auth: string, extra: Record<string, unknown> = {}) {
  const res = await ctx.http().post('/tickets').set('Authorization', auth).send({ subject: 'Printer on fire', description: 'It is quite literally on fire.', ...extra });
  if (res.status !== 201) throw new Error(`create ticket failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Minimal but valid file signatures for upload tests.
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
export const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
