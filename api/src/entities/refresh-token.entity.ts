import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DATE_TYPE } from '../common/columns';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  userId: string;

  /** All tokens descended from one login share a family, so reuse can revoke the lot. */
  @Index()
  @Column({ type: 'varchar', length: 36 })
  familyId: string;

  /** SHA-256 of the opaque token; the raw value is never stored. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: DATE_TYPE })
  expiresAt: Date;

  @Column({ type: DATE_TYPE, nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: DATE_TYPE })
  createdAt: Date;
}
