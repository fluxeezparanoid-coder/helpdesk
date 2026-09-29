import { BadRequestException, ConflictException, Injectable, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.decorators';
import { TicketStatus } from '../common/enums';
import { Attachment } from '../entities/attachment.entity';
import { detectType, extensionMatches, sanitiseFileName } from './file-type';
import { TicketsService } from './tickets.service';

const MAX_PER_TICKET = 10;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@Injectable()
export class AttachmentsService {
  private readonly dir = resolve(process.env.UPLOAD_DIR ?? './uploads');

  constructor(
    @InjectRepository(Attachment) private readonly repo: Repository<Attachment>,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
  ) {}

  async upload(ticketId: number, file: Express.Multer.File | undefined, user: AuthUser) {
    const ticket = await this.tickets.findAccessible(ticketId, user);
    if (!file) throw new BadRequestException('Attach a file in the "file" field');
    if (ticket.status === TicketStatus.Closed) throw new ConflictException('Ticket is closed');
    if ((await this.repo.count({ where: { ticketId } })) >= MAX_PER_TICKET) {
      throw new ConflictException(`A ticket can have at most ${MAX_PER_TICKET} attachments`);
    }

    const name = sanitiseFileName(file.originalname);
    const detected = detectType(file.buffer);
    if (!detected) throw new UnsupportedMediaTypeException('Unsupported file type. Allowed: PNG, JPEG, GIF, WebP, PDF, plain text');
    if (!extensionMatches(name, detected)) {
      throw new UnsupportedMediaTypeException('File content does not match its extension');
    }

    // Random on-disk name: the client's file name never touches the filesystem.
    const storedName = randomBytes(24).toString('hex');
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(join(this.dir, storedName), file.buffer, { mode: 0o600 });

    const saved = await this.repo.save(
      this.repo.create({ ticketId, uploaderId: user.id, originalName: name, storedName, mimeType: detected.mime, size: file.size }),
    );
    await this.audit.log({ actor: user, action: 'attachment.upload', entity: 'ticket', entityId: ticketId, meta: { name, mime: detected.mime, size: file.size } });
    return { id: saved.id, name: saved.originalName, mimeType: saved.mimeType, size: saved.size, createdAt: saved.createdAt };
  }

  async open(id: string, user: AuthUser) {
    const att = await this.repo.findOne({ where: { id } });
    if (!att) throw new NotFoundException('Attachment not found');
    // Same access rule as the ticket itself: customers only reach their own tickets' files.
    await this.tickets.findAccessible(att.ticketId, user);
    const data = await fs.readFile(join(this.dir, att.storedName)).catch(() => {
      throw new NotFoundException('Attachment not found');
    });
    return { att, data };
  }
}
