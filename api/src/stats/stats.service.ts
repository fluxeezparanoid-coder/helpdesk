import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles } from '../auth/auth.decorators';
import { Priority, Role, TicketStatus } from '../common/enums';
import { Ticket } from '../entities/ticket.entity';

const ACTIVE = [TicketStatus.Open, TicketStatus.InProgress, TicketStatus.WaitingCustomer];
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class StatsService {
  constructor(@InjectRepository(Ticket) private readonly tickets: Repository<Ticket>) {}

  async overview() {
    const rows = await this.tickets.find({
      select: {
        id: true,
        status: true,
        priority: true,
        assigneeId: true,
        createdAt: true,
        resolvedAt: true,
        firstRespondedAt: true,
        firstResponseDueAt: true,
        resolveDueAt: true,
      },
    });
    const now = Date.now();

    const byStatus = Object.fromEntries(Object.values(TicketStatus).map((s) => [s, 0])) as Record<string, number>;
    const byPriority = Object.fromEntries(Object.values(Priority).map((p) => [p, 0])) as Record<string, number>;
    let overdue = 0;
    let unassigned = 0;
    let responseMs = 0;
    let responded = 0;

    for (const t of rows) {
      byStatus[t.status]++;
      byPriority[t.priority]++;
      const active = ACTIVE.includes(t.status);
      if (active && !t.assigneeId) unassigned++;
      if (active && ((!t.firstRespondedAt && t.firstResponseDueAt.getTime() < now) || t.resolveDueAt.getTime() < now)) overdue++;
      if (t.firstRespondedAt) {
        responseMs += t.firstRespondedAt.getTime() - t.createdAt.getTime();
        responded++;
      }
    }

    const days: Record<string, { date: string; created: number; resolved: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const key = dayKey(new Date(now - i * 86_400_000));
      days[key] = { date: key, created: 0, resolved: 0 };
    }
    for (const t of rows) {
      const c = days[dayKey(t.createdAt)];
      if (c) c.created++;
      if (t.resolvedAt) {
        const r = days[dayKey(t.resolvedAt)];
        if (r) r.resolved++;
      }
    }

    return {
      total: rows.length,
      active: rows.filter((t) => ACTIVE.includes(t.status)).length,
      overdue,
      unassigned,
      avgFirstResponseMinutes: responded ? Math.round(responseMs / responded / 60_000) : null,
      byStatus,
      byPriority,
      last14Days: Object.values(days),
    };
  }
}

@ApiTags('stats')
@ApiBearerAuth()
@Roles(Role.Agent, Role.Admin)
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Queue overview: counts, overdue tickets, average first response, 14-day trend (staff)' })
  overview() {
    return this.stats.overview();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
