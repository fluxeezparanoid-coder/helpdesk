import { INestApplication, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';
import { Category, Priority, Role, SLA_HOURS, TicketStatus } from './common/enums';
import { Comment } from './entities/comment.entity';
import { Ticket } from './entities/ticket.entity';
import { User } from './entities/user.entity';

export const DEMO_PASSWORD = 'Demo#Helpdesk2026';

const SUBJECTS: [string, Category][] = [
  ['Cannot log in after password reset', Category.Account],
  ['Invoice shows the wrong VAT number', Category.Billing],
  ['Export to CSV times out', Category.Technical],
  ['Please change the email on my account', Category.Account],
  ['Charged twice for the March subscription', Category.Billing],
  ['Dashboard is blank in Firefox', Category.Technical],
  ['Two-factor codes are not accepted', Category.Account],
  ['How do I download all my invoices?', Category.Billing],
  ['API returns 500 on bulk import', Category.Technical],
  ['Feature request: dark mode', Category.Other],
  ['Webhook signature does not validate', Category.Technical],
  ['Cancel my plan at the end of the month', Category.Billing],
  ['Uploaded files disappear after refresh', Category.Technical],
  ['Add a teammate to our workspace', Category.Account],
  ['Slow page loads since yesterday', Category.Technical],
];

/** Small deterministic PRNG so the demo data is the same on every fresh database. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export async function seedIfEmpty(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  const users = ds.getRepository(User);
  if ((await users.count()) > 0) return;

  const log = new Logger('Seed');
  const hash = await argon2.hash(DEMO_PASSWORD);
  const mk = (email: string, name: string, role: Role) => users.create({ email, name, role, passwordHash: hash });

  const [admin, agentA, agentB, ...customers] = await users.save([
    mk('admin@helpdesk.demo', 'Alex Morgan', Role.Admin),
    mk('agent@helpdesk.demo', 'Sam Rivera', Role.Agent),
    mk('agent2@helpdesk.demo', 'Jo Chen', Role.Agent),
    mk('customer@helpdesk.demo', 'Taylor Brooks', Role.Customer),
    mk('customer2@helpdesk.demo', 'Riley Quinn', Role.Customer),
    mk('customer3@helpdesk.demo', 'Morgan Lee', Role.Customer),
  ]);

  const rand = rng(42);
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const hours = (h: number) => h * 3_600_000;
  const now = Date.now();
  const agents = [agentA, agentB, admin];
  const tickets = ds.getRepository(Ticket);
  const comments = ds.getRepository(Comment);

  for (let i = 0; i < 48; i++) {
    const [subject, category] = SUBJECTS[i % SUBJECTS.length];
    const ageH = Math.floor(rand() * 24 * 20) + 1; // up to 20 days old
    const createdAt = new Date(now - hours(ageH));
    const priority = rand() < 0.06 ? Priority.Urgent : pick([Priority.Low, Priority.Normal, Priority.Normal, Priority.Normal, Priority.High]);
    const [firstH, resolveH] = SLA_HOURS[priority];
    const requester = pick(customers);
    const agent = pick(agents);

    const roll = rand();
    let status: TicketStatus;
    if (ageH < 6) status = TicketStatus.Open;
    else if (ageH < 60) status = roll < 0.25 ? TicketStatus.Open : roll < 0.6 ? TicketStatus.InProgress : roll < 0.75 ? TicketStatus.WaitingCustomer : TicketStatus.Resolved;
    else if (roll < 0.06) status = TicketStatus.InProgress;
    else if (roll < 0.1) status = TicketStatus.WaitingCustomer;
    else status = roll < 0.55 ? TicketStatus.Resolved : TicketStatus.Closed;

    const answered = status !== TicketStatus.Open;
    const responseAfter = hours(Math.max(0.2, firstH * (0.3 + rand() * 1.2)));
    const firstRespondedAt = answered ? new Date(createdAt.getTime() + responseAfter) : null;
    const done = status === TicketStatus.Resolved || status === TicketStatus.Closed;
    const resolvedAt = done ? new Date(createdAt.getTime() + hours(resolveH * (0.2 + rand() * 1.1))) : null;

    const ticket = await tickets.save(
      tickets.create({
        subject,
        description: `${subject}.\n\nThis started ${Math.ceil(ageH / 24)} day(s) ago and is blocking our team. Happy to provide logs or screenshots if needed.`,
        status,
        priority,
        category,
        requesterId: requester.id,
        assigneeId: answered ? agent.id : rand() < 0.3 ? agent.id : null,
        firstResponseDueAt: new Date(createdAt.getTime() + hours(firstH)),
        resolveDueAt: new Date(createdAt.getTime() + hours(resolveH)),
        firstRespondedAt,
        resolvedAt: resolvedAt && resolvedAt.getTime() < now ? resolvedAt : done ? new Date(now - hours(1)) : null,
        createdAt,
        updatedAt: new Date(Math.min(now, (firstRespondedAt ?? createdAt).getTime() + hours(1))),
      }),
    );

    if (answered && firstRespondedAt) {
      await comments.save([
        comments.create({ ticketId: ticket.id, authorId: agent.id, body: 'Thanks for reaching out. I am looking into this now and will update you shortly.', createdAt: firstRespondedAt }),
        comments.create({ ticketId: ticket.id, authorId: agent.id, body: 'Internal: checked logs, looks like a known issue (see the incident channel). Follow up with engineering.', isInternal: true, createdAt: new Date(firstRespondedAt.getTime() + hours(0.5)) }),
      ]);
      if (done) {
        await comments.save(
          comments.create({ ticketId: ticket.id, authorId: requester.id, body: 'That fixed it, thank you for the quick help!', createdAt: new Date(firstRespondedAt.getTime() + hours(2)) }),
        );
      }
    }
  }
  log.log('Seeded demo data (6 users, 48 tickets). Demo password is in the README.');
}
