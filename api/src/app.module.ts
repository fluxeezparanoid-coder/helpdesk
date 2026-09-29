import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditController } from './audit/audit.controller';
import { AuditModule } from './audit/audit.service';
import { JwtAuthGuard, RolesGuard } from './auth/auth.guards';
import { AuthModule } from './auth/auth.module';
import { databaseOptions } from './config/database';
import { StatsModule } from './stats/stats.service';
import { TicketsModule } from './tickets/tickets.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(databaseOptions()),
    // Global baseline limit; the credential endpoints override it with a stricter one.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.RATE_LIMIT ?? 120) }]),
    AuditModule,
    AuthModule,
    UsersModule,
    TicketsModule,
    StatsModule,
  ],
  controllers: [AuditController],
  providers: [
    // Order matters: rate-limit first, then authenticate, then authorise by role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
