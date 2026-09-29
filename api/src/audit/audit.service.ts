import { Global, Injectable, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

export interface AuditEntry {
  actor?: { id: string; email: string } | null;
  action: string;
  entity?: string;
  entityId?: string | number;
  meta?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.repo.save(
      this.repo.create({
        actorId: entry.actor?.id ?? null,
        actorEmail: entry.actor?.email ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId !== undefined ? String(entry.entityId) : null,
        meta: entry.meta ? JSON.stringify(entry.meta) : null,
      }),
    );
  }

  async list(page: number, pageSize: number, action?: string) {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    if (action) qb.andWhere('a.action = :action', { action });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }
}

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
