import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.decorators';
import { Priority, Role, SLA_HOURS, STATUS_TRANSITIONS, TicketStatus } from '../common/enums';
import { escapeLike } from '../common/like';
import { Comment } from '../entities/comment.entity';
import { Ticket } from '../entities/ticket.entity';
import { User } from '../entities/user.entity';
import { CreateCommentDto, CreateTicketDto, ListTicketsQuery, UpdateTicketDto } from './tickets.dto';

const OPEN_STATUSES = [TicketStatus.Open, TicketStatus.InProgress, TicketStatus.WaitingCustomer];
const isStaff = (u: AuthUser) => u.role === Role.Agent || u.role === Role.Admin;

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- queries

  async list(query: ListTicketsQuery, user: AuthUser) {
    const qb = this.tickets
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.requester', 'requester')
      .leftJoinAndSelect('t.assignee', 'assignee');

    // Row-level scoping: a customer's query is always constrained to their own tickets,
    // regardless of which filters they pass.
    if (!isStaff(user)) qb.andWhere('t.requesterId = :me', { me: user.id });

    if (query.status) qb.andWhere('t.status = :status', { status: query.status });
    if (query.priority) qb.andWhere('t.priority = :priority', { priority: query.priority });
    if (query.category) qb.andWhere('t.category = :category', { category: query.category });
    if (query.assigneeId) qb.andWhere('t.assigneeId = :assigneeId', { assigneeId: query.assigneeId });
    if (query.mine && isStaff(user)) qb.andWhere('t.assigneeId = :me2', { me2: user.id });
    if (query.unassigned) qb.andWhere('t.assigneeId IS NULL');

    if (query.overdue) {
      qb.andWhere('t.status IN (:...openStatuses)', { openStatuses: OPEN_STATUSES });
      qb.andWhere('((t.firstRespondedAt IS NULL AND t.firstResponseDueAt < :now) OR t.resolveDueAt < :now)', { now: new Date() });
    }

    if (query.q) {
      // The search term is a bound parameter and its LIKE wildcards are escaped:
      // "' OR 1=1 --" is just text to look for, and "%" doesn't match everything.
      qb.andWhere("(LOWER(t.subject) LIKE :q ESCAPE '\\' OR LOWER(t.description) LIKE :q ESCAPE '\\')", {
        q: `%${escapeLike(query.q.toLowerCase())}%`,
      });
    }

    qb.orderBy(`t.${query.sortBy}`, query.order)
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((t) => this.toSummary(t)), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: number, user: AuthUser) {
    const ticket = await this.findAccessible(id, user, true);
    const staff = isStaff(user);
    const comments = (ticket.comments ?? [])
      .filter((c) => staff || !c.isInternal)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => ({
        id: c.id,
        body: c.body,
        isInternal: c.isInternal,
        createdAt: c.createdAt,
        author: { id: c.author.id, name: c.author.name, role: c.author.role },
      }));
    const attachments = (ticket.attachments ?? []).map((a) => ({
      id: a.id,
      name: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
    }));
    return { ...this.toSummary(ticket), description: ticket.description, comments, attachments };
  }

  // -------------------------------------------------------------- mutations

  async create(dto: CreateTicketDto, user: AuthUser) {
    const priority = dto.priority ?? Priority.Normal;
    if (priority === Priority.Urgent && !isStaff(user)) {
      throw new BadRequestException('Only staff can set urgent priority');
    }
    const now = new Date();
    const [firstDue, resolveDue] = this.slaDeadlines(now, priority);
    const ticket = await this.tickets.save(
      this.tickets.create({
        subject: dto.subject.trim(),
        description: dto.description.trim(),
        priority,
        category: dto.category,
        requesterId: user.id,
        assigneeId: null,
        status: TicketStatus.Open,
        firstResponseDueAt: firstDue,
        resolveDueAt: resolveDue,
        firstRespondedAt: null,
        resolvedAt: null,
      }),
    );
    await this.audit.log({ actor: user, action: 'ticket.create', entity: 'ticket', entityId: ticket.id, meta: { priority } });
    return this.get(ticket.id, user);
  }

  async update(id: number, dto: UpdateTicketDto, user: AuthUser) {
    const ticket = await this.findAccessible(id, user);
    const changes: Record<string, unknown> = {};

    if (dto.status !== undefined && dto.status !== ticket.status) {
      const allowed = STATUS_TRANSITIONS[ticket.status];
      if (!allowed.includes(dto.status)) {
        throw new ConflictException(`Cannot move a ${ticket.status} ticket to ${dto.status}`);
      }
      changes.status = [ticket.status, dto.status];
      ticket.status = dto.status;
      if (dto.status === TicketStatus.Resolved) ticket.resolvedAt = new Date();
      if (dto.status === TicketStatus.Open) ticket.resolvedAt = null;
    }

    if (dto.priority !== undefined && dto.priority !== ticket.priority) {
      changes.priority = [ticket.priority, dto.priority];
      ticket.priority = dto.priority;
      [ticket.firstResponseDueAt, ticket.resolveDueAt] = this.slaDeadlines(ticket.createdAt, dto.priority);
    }

    if (dto.category !== undefined && dto.category !== ticket.category) {
      changes.category = [ticket.category, dto.category];
      ticket.category = dto.category;
    }

    if (dto.assigneeId !== undefined && dto.assigneeId !== ticket.assigneeId) {
      await this.assertCanAssign(dto.assigneeId, ticket, user);
      changes.assigneeId = [ticket.assigneeId, dto.assigneeId];
      ticket.assigneeId = dto.assigneeId;
      ticket.assignee = null; // relation is reloaded below
    }

    if (Object.keys(changes).length > 0) {
      await this.tickets.save(ticket);
      await this.audit.log({ actor: user, action: 'ticket.update', entity: 'ticket', entityId: id, meta: changes });
    }
    return this.get(id, user);
  }

  /** Customers may close their own ticket, or reopen one that staff marked resolved. */
  async customerTransition(id: number, to: 'close' | 'reopen', user: AuthUser) {
    const ticket = await this.findAccessible(id, user);
    if (to === 'close') {
      if (ticket.status === TicketStatus.Closed) throw new ConflictException('Ticket is already closed');
      ticket.status = TicketStatus.Closed;
    } else {
      if (ticket.status !== TicketStatus.Resolved) throw new ConflictException('Only resolved tickets can be reopened');
      ticket.status = TicketStatus.Open;
      ticket.resolvedAt = null;
    }
    await this.tickets.save(ticket);
    await this.audit.log({ actor: user, action: `ticket.${to}`, entity: 'ticket', entityId: id });
    return this.get(id, user);
  }

  async addComment(id: number, dto: CreateCommentDto, user: AuthUser) {
    const ticket = await this.findAccessible(id, user);
    if (ticket.status === TicketStatus.Closed) throw new ConflictException('Ticket is closed');

    const staff = isStaff(user);
    // A customer cannot post internal notes, whatever the request body says.
    const internal = staff && dto.isInternal === true;

    await this.comments.save(this.comments.create({ ticketId: id, authorId: user.id, body: dto.body.trim(), isInternal: internal }));

    if (staff && !internal) {
      if (!ticket.firstRespondedAt) ticket.firstRespondedAt = new Date();
      if (ticket.status === TicketStatus.Open) ticket.status = TicketStatus.InProgress;
      if (!ticket.assigneeId) ticket.assigneeId = user.id;
    } else if (!staff) {
      if (ticket.status === TicketStatus.WaitingCustomer) ticket.status = TicketStatus.InProgress;
      if (ticket.status === TicketStatus.Resolved) {
        ticket.status = TicketStatus.Open;
        ticket.resolvedAt = null;
      }
    }
    await this.tickets.save(ticket);
    await this.audit.log({ actor: user, action: 'ticket.comment', entity: 'ticket', entityId: id, meta: { internal } });
    return this.get(id, user);
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Loads a ticket the caller may see. For customers, someone else's ticket is reported as
   * "not found" rather than "forbidden", so ticket numbers can't be probed for existence.
   */
  async findAccessible(id: number, user: AuthUser, withRelations = false): Promise<Ticket> {
    const ticket = await this.tickets.findOne({
      where: { id },
      relations: withRelations
        ? { requester: true, assignee: true, comments: { author: true }, attachments: true }
        : { requester: true, assignee: true },
    });
    if (!ticket || (!isStaff(user) && ticket.requesterId !== user.id)) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async assertCanAssign(assigneeId: string | null, ticket: Ticket, user: AuthUser) {
    if (user.role === Role.Customer) throw new ForbiddenException('Insufficient permissions');
    if (assigneeId === null) {
      if (user.role === Role.Agent && ticket.assigneeId !== user.id) {
        throw new ForbiddenException('Agents can only unassign themselves');
      }
      return;
    }
    if (user.role === Role.Agent && assigneeId !== user.id) {
      throw new ForbiddenException('Agents can only assign tickets to themselves');
    }
    const target = await this.users.findOne({ where: { id: assigneeId, role: In([Role.Agent, Role.Admin]), isActive: true } });
    if (!target) throw new BadRequestException('Assignee must be an active staff member');
  }

  private slaDeadlines(from: Date, priority: Priority): [Date, Date] {
    const [first, resolve] = SLA_HOURS[priority];
    return [new Date(from.getTime() + first * 3_600_000), new Date(from.getTime() + resolve * 3_600_000)];
  }

  private toSummary(t: Ticket) {
    const now = Date.now();
    const active = OPEN_STATUSES.includes(t.status);
    const firstResponseOverdue = active && !t.firstRespondedAt && t.firstResponseDueAt.getTime() < now;
    const resolveOverdue = active && t.resolveDueAt.getTime() < now;
    return {
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      category: t.category,
      requester: t.requester ? { id: t.requester.id, name: t.requester.name, email: t.requester.email } : null,
      assignee: t.assignee ? { id: t.assignee.id, name: t.assignee.name } : null,
      sla: {
        firstResponseDueAt: t.firstResponseDueAt,
        resolveDueAt: t.resolveDueAt,
        firstRespondedAt: t.firstRespondedAt,
        firstResponseOverdue,
        resolveOverdue,
        overdue: firstResponseOverdue || resolveOverdue,
      },
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      resolvedAt: t.resolvedAt,
    };
  }
}
