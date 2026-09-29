import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { DATE_TYPE } from '../common/columns';
import { Ticket } from './ticket.entity';
import { User } from './user.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int' })
  ticketId: number;

  @ManyToOne(() => Ticket, (t) => t.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket: Ticket;

  @Column({ type: 'varchar', length: 36 })
  authorId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'authorId' })
  author: User;

  @Column({ type: 'text' })
  body: string;

  /** Internal notes are visible to staff only. */
  @Column({ type: 'boolean', default: false })
  isInternal: boolean;

  @CreateDateColumn({ type: DATE_TYPE })
  createdAt: Date;
}
