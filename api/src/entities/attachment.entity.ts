import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DATE_TYPE } from '../common/columns';
import { Ticket } from './ticket.entity';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int' })
  ticketId: number;

  @ManyToOne(() => Ticket, (t) => t.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket: Ticket;

  @Column({ type: 'varchar', length: 36 })
  uploaderId: string;

  /** Display name only, sanitised. Never used to build a filesystem path. */
  @Column({ type: 'varchar', length: 200 })
  originalName: string;

  /** Random name on disk, no extension. */
  @Column({ type: 'varchar', length: 64 })
  storedName: string;

  /** Type detected from the file content, not from the client-supplied header. */
  @Column({ type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ type: 'int' })
  size: number;

  @CreateDateColumn({ type: DATE_TYPE })
  createdAt: Date;
}
