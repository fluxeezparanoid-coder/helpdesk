import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from '../entities/attachment.entity';
import { Comment } from '../entities/comment.entity';
import { Ticket } from '../entities/ticket.entity';
import { AttachmentsService } from './attachments.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [TypeOrmModule.forFeature([Ticket, Comment, Attachment])],
  controllers: [TicketsController],
  providers: [TicketsService, AttachmentsService],
})
export class TicketsModule {}
