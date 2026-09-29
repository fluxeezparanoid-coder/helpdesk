import { readdirSync } from 'fs';
import { Role } from '../src/common/enums';
import { actor, createApp, Ctx, openTicket, PDF, PNG } from './helpers';

describe('Attachments', () => {
  let ctx: Ctx;
  beforeAll(async () => (ctx = await createApp()));
  afterAll(() => ctx.app.close());

  const upload = (auth: string, id: number, data: Buffer, filename: string, contentType?: string) =>
    ctx.http().post(`/tickets/${id}/attachments`).set('Authorization', auth).attach('file', data, { filename, contentType });

  it('accepts a real PNG and serves it back as a download, never inline', async () => {
    const alice = await actor(ctx, Role.Customer, 'alice');
    const t = await openTicket(ctx, alice.auth);
    const up = await upload(alice.auth, t.id, PNG, 'screenshot.png').expect(201);
    expect(up.body.mimeType).toBe('image/png');

    const dl = await ctx.http().get(`/attachments/${up.body.id}`).set('Authorization', alice.auth).expect(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects HTML disguised as an image, whatever the client claims the type is', async () => {
    const alice = await actor(ctx, Role.Customer, 'alice');
    const t = await openTicket(ctx, alice.auth);
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    await upload(alice.auth, t.id, html, 'photo.png', 'image/png').expect(415);
  });

  it('rejects executables, SVG and HTML files outright', async () => {
    const alice = await actor(ctx, Role.Customer, 'alice');
    const t = await openTicket(ctx, alice.auth);
    const exe = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0)]);
    await upload(alice.auth, t.id, exe, 'setup.exe').expect(415);
    await upload(alice.auth, t.id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'logo.svg').expect(415);
    await upload(alice.auth, t.id, Buffer.from('<h1>hi</h1>'), 'page.html').expect(415);
  });

  it('rejects a PDF renamed to .png (extension/content mismatch)', async () => {
    const alice = await actor(ctx, Role.Customer, 'alice');
    const t = await openTicket(ctx, alice.auth);
    await upload(alice.auth, t.id, PDF, 'invoice.png').expect(415);
    await upload(alice.auth, t.id, PDF, 'invoice.pdf').expect(201);
  });

  it('never uses the client file name on disk (path traversal)', async () => {
    const alice = await actor(ctx, Role.Customer, 'alice');
    const t = await openTicket(ctx, alice.auth);
    const before = new Set(readdirSync(process.env.UPLOAD_DIR!));
    const up = await upload(alice.auth, t.id, PNG, '../../../evil.png').expect(201);
    expect(up.body.name).toBe('evil.png');
    const created = readdirSync(process.env.UPLOAD_DIR!).filter((f) => !before.has(f));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/^[0-9a-f]{48}$/);
  });

  it('enforces the size limit', async () => {
    const alice = await actor(ctx, Role.Customer, 'alice');
    const t = await openTicket(ctx, alice.auth);
    const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024, 7)]);
    await upload(alice.auth, t.id, big, 'huge.png').expect(413);
  });

  it('applies ticket access rules to files: another customer gets 404', async () => {
    const alice = await actor(ctx, Role.Customer, 'alice');
    const bob = await actor(ctx, Role.Customer, 'bob');
    const agent = await actor(ctx, Role.Agent);
    const t = await openTicket(ctx, alice.auth);
    const up = await upload(alice.auth, t.id, PNG, 'a.png').expect(201);

    await ctx.http().get(`/attachments/${up.body.id}`).set('Authorization', bob.auth).expect(404);
    await ctx.http().get(`/attachments/${up.body.id}`).set('Authorization', agent.auth).expect(200);
    await upload(bob.auth, t.id, PNG, 'b.png').expect(404);
  });
});
