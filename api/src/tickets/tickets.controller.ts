import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser, CurrentUser, Roles } from '../auth/auth.decorators';
import { Role } from '../common/enums';
import { AttachmentsService, MAX_UPLOAD_BYTES } from './attachments.service';
import { CreateCommentDto, CreateTicketDto, ListTicketsQuery, UpdateTicketDto } from './tickets.dto';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@Controller()
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly attachments: AttachmentsService,
  ) {}

  @Get('tickets')
  @ApiOperation({ summary: 'List tickets. Customers see only their own; staff see the whole queue.' })
  list(@Query() query: ListTicketsQuery, @CurrentUser() user: AuthUser) {
    return this.tickets.list(query, user);
  }

  @Post('tickets')
  @ApiOperation({ summary: 'Open a ticket. SLA deadlines are computed from the priority.' })
  create(@Body() dto: CreateTicketDto, @CurrentUser() user: AuthUser) {
    return this.tickets.create(dto, user);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Ticket with thread and attachments. Internal notes are hidden from customers.' })
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.tickets.get(id, user);
  }

  @Roles(Role.Agent, Role.Admin)
  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Change status, priority, category or assignee (staff). Status follows a transition table.' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTicketDto, @CurrentUser() user: AuthUser) {
    return this.tickets.update(id, dto, user);
  }

  @Roles(Role.Customer)
  @HttpCode(200)
  @Post('tickets/:id/close')
  @ApiOperation({ summary: 'Customer closes their own ticket' })
  close(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.tickets.customerTransition(id, 'close', user);
  }

  @Roles(Role.Customer)
  @HttpCode(200)
  @Post('tickets/:id/reopen')
  @ApiOperation({ summary: 'Customer reopens a resolved ticket' })
  reopen(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.tickets.customerTransition(id, 'reopen', user);
  }

  @Post('tickets/:id/comments')
  @ApiOperation({ summary: 'Reply on a ticket. Staff replies stop the first-response SLA clock.' })
  comment(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateCommentDto, @CurrentUser() user: AuthUser) {
    return this.tickets.addComment(id, dto, user);
  }

  @Post('tickets/:id/attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({ summary: 'Upload a file (PNG, JPEG, GIF, WebP, PDF, text; max 5 MB). Type is verified from the bytes.' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(@Param('id', ParseIntPipe) id: number, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthUser) {
    return this.attachments.upload(id, file, user);
  }

  @Get('attachments/:id')
  @ApiOperation({ summary: 'Download an attachment (always served as a download, never rendered inline)' })
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const { att, data } = await this.attachments.open(id, user);
    res.set({
      'Content-Type': att.mimeType,
      'Content-Length': String(data.length),
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(att.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.end(data);
  }
}
