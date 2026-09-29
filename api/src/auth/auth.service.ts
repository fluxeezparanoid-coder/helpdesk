import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Role } from '../common/enums';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../entities/user.entity';
import { LoginDto, RegisterDto } from './auth.dto';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const REFRESH_TTL_DAYS = 7;

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  /** Hashed once at startup; compared against when the email is unknown so response time doesn't reveal which emails exist. */
  private dummyHash: Promise<string> = argon2.hash('not-a-real-password');

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDto) {
    if (await this.users.exists({ where: { email: dto.email } })) {
      throw new ConflictException('Email is already registered');
    }
    // Role is never read from the request body: everyone who self-registers is a customer.
    const user = await this.users.save(
      this.users.create({
        email: dto.email,
        name: dto.name.trim(),
        passwordHash: await argon2.hash(dto.password),
        role: Role.Customer,
      }),
    );
    await this.audit.log({ actor: user, action: 'user.register', entity: 'user', entityId: user.id });
    return this.publicUser(user);
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: ReturnType<AuthService['publicUser']> }> {
    const user = await this.users.findOne({ where: { email: dto.email } });

    if (!user) {
      await argon2.verify(await this.dummyHash, dto.password);
      await this.audit.log({ action: 'auth.login_failed', meta: { email: dto.email } });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.log({ actor: user, action: 'auth.login_blocked_locked' });
      throw new HttpException('Too many failed attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok || !user.isActive) {
      if (!ok) {
        user.failedLogins += 1;
        if (user.failedLogins >= MAX_FAILED_LOGINS) {
          user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
          user.failedLogins = 0;
          await this.audit.log({ actor: user, action: 'auth.account_locked' });
        }
        await this.users.save(user);
      }
      await this.audit.log({ actor: user, action: 'auth.login_failed' });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.failedLogins > 0 || user.lockedUntil) {
      user.failedLogins = 0;
      user.lockedUntil = null;
      await this.users.save(user);
    }
    await this.audit.log({ actor: user, action: 'auth.login' });
    return { ...(await this.issueTokens(user, randomUUID())), user: this.publicUser(user) };
  }

  /** Refresh-token rotation: each token works once. Presenting a used one revokes the whole login family. */
  async refresh(rawToken: string): Promise<TokenPair> {
    const record = await this.tokens.findOne({ where: { tokenHash: sha256(rawToken) } });
    if (!record) throw new UnauthorizedException('Invalid refresh token');

    if (record.revokedAt) {
      await this.tokens.update({ familyId: record.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
      await this.audit.log({ action: 'auth.refresh_reuse_detected', entity: 'user', entityId: record.userId });
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (record.expiresAt < new Date()) throw new UnauthorizedException('Invalid refresh token');

    const user = await this.users.findOne({ where: { id: record.userId } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid refresh token');

    record.revokedAt = new Date();
    await this.tokens.save(record);
    return this.issueTokens(user, record.familyId);
  }

  async logout(rawToken: string): Promise<void> {
    const record = await this.tokens.findOne({ where: { tokenHash: sha256(rawToken) } });
    if (record) await this.tokens.update({ familyId: record.familyId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.tokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  publicUser(u: User) {
    return { id: u.id, email: u.email, name: u.name, role: u.role, isActive: u.isActive, createdAt: u.createdAt };
  }

  private async issueTokens(user: User, familyId: string): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    const refreshToken = randomBytes(48).toString('base64url');
    await this.tokens.save(
      this.tokens.create({
        userId: user.id,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000),
        revokedAt: null,
      }),
    );
    return { accessToken, refreshToken, expiresIn: 900 };
  }
}
