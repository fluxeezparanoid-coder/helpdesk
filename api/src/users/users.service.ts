import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.decorators';
import { AuthService } from '../auth/auth.service';
import { Role } from '../common/enums';
import { escapeLike } from '../common/like';
import { User } from '../entities/user.entity';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(query: ListUsersQuery) {
    const qb = this.repo
      .createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    if (query.role) qb.andWhere('u.role = :role', { role: query.role });
    if (query.q) {
      // Bound parameter + escaped wildcards: user input never becomes SQL text.
      qb.andWhere("(LOWER(u.name) LIKE :q ESCAPE '\\' OR LOWER(u.email) LIKE :q ESCAPE '\\')", {
        q: `%${escapeLike(query.q.toLowerCase())}%`,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((u) => this.auth.publicUser(u)), total, page: query.page, pageSize: query.pageSize };
  }

  /** Minimal directory of assignable staff, for the ticket assignee dropdown. */
  async staff() {
    const staff = await this.repo.find({ where: { role: In([Role.Agent, Role.Admin]), isActive: true }, order: { name: 'ASC' } });
    return staff.map((u) => ({ id: u.id, name: u.name, role: u.role }));
  }

  async create(dto: CreateUserDto, actor: AuthUser) {
    if (await this.repo.exists({ where: { email: dto.email } })) throw new ConflictException('Email is already registered');
    const user = await this.repo.save(
      this.repo.create({ email: dto.email, name: dto.name.trim(), passwordHash: await argon2.hash(dto.password), role: dto.role }),
    );
    await this.audit.log({ actor, action: 'user.create', entity: 'user', entityId: user.id, meta: { role: user.role } });
    return this.auth.publicUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (id === actor.id) throw new BadRequestException('You cannot change your own role or status');

    const before = { role: user.role, isActive: user.isActive };
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.isActive !== undefined) user.isActive = dto.isActive;
    await this.repo.save(user);

    if (!user.isActive) await this.auth.revokeAllForUser(user.id);
    await this.audit.log({
      actor,
      action: 'user.update',
      entity: 'user',
      entityId: user.id,
      meta: { before, after: { role: user.role, isActive: user.isActive } },
    });
    return this.auth.publicUser(user);
  }
}
