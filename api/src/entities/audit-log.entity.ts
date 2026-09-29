import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATE_TYPE } from '../common/columns';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 254, nullable: true })
  actorEmail: string | null;

  @Index()
  @Column({ type: 'varchar', length: 60 })
  action: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  entity: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  entityId: string | null;

  @Column({ type: 'text', nullable: true })
  meta: string | null;

  @CreateDateColumn({ type: DATE_TYPE })
  createdAt: Date;
}
