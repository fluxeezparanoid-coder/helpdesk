import { randomUUID } from 'crypto';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { DATE_TYPE } from '../common/columns';
import { Role } from '../common/enums';

@Entity('users')
export class User {
  /**
   * App-generated UUID stored as varchar(36), so the foreign keys that reference it
   * (requesterId, assigneeId, authorId) have the same type on PostgreSQL and SQLite.
   */
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string = randomUUID();

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, default: Role.Customer })
  role: Role;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  failedLogins: number;

  @Column({ type: DATE_TYPE, nullable: true })
  lockedUntil: Date | null;

  @CreateDateColumn({ type: DATE_TYPE })
  createdAt: Date;
}
