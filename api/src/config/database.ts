import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { Attachment } from '../entities/attachment.entity';
import { Comment } from '../entities/comment.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { Ticket } from '../entities/ticket.entity';
import { User } from '../entities/user.entity';

export const ENTITIES = [User, RefreshToken, Ticket, Comment, Attachment, AuditLog];

/**
 * PostgreSQL when DATABASE_URL is set (production, docker-compose);
 * otherwise SQLite so the API and tests run with zero setup.
 */
export function databaseOptions(): TypeOrmModuleOptions {
  const url = process.env.DATABASE_URL;
  if (url) {
    return {
      type: 'postgres',
      url,
      entities: ENTITIES,
      synchronize: process.env.DB_SYNCHRONIZE !== 'false',
      dropSchema: process.env.DB_DROP_SCHEMA === 'true', // tests only: start every app from an empty schema
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    };
  }
  return {
    type: 'better-sqlite3',
    database: process.env.SQLITE_PATH ?? ':memory:',
    entities: ENTITIES,
    synchronize: true,
  };
}
