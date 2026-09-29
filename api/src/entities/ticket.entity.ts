import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DATE_TYPE } from '../common/columns';
import { Category, Priority, TicketStatus } from '../common/enums';
import { Attachment } from './attachment.entity';
import { Comment } from './comment.entity';
import { User } from './user.entity';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: TicketStatus.Open })
  status: TicketStatus;

  @Index()
  @Column({ type: 'varchar', length: 20, default: Priority.Normal })
  priority: Priority;

  @Column({ type: 'varchar', length: 20, default: Category.Other })
  category: Category;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  requesterId: string;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'requesterId' })
  requester: User;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  assigneeId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigneeId' })
  assignee: User | null;

  @Column({ type: DATE_TYPE })
  firstResponseDueAt: Date;

  @Column({ type: DATE_TYPE })
  resolveDueAt: Date;

  @Column({ type: DATE_TYPE, nullable: true })
  firstRespondedAt: Date | null;

  @Column({ type: DATE_TYPE, nullable: true })
  resolvedAt: Date | null;

  @OneToMany(() => Comment, (c) => c.ticket)
  comments: Comment[];

  @OneToMany(() => Attachment, (a) => a.ticket)
  attachments: Attachment[];

  @CreateDateColumn({ type: DATE_TYPE })
  createdAt: Date;

  @UpdateDateColumn({ type: DATE_TYPE })
  updatedAt: Date;
}
