import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-at-least-thirty-two-chars-long';
process.env.RATE_LIMIT = '100000';
process.env.AUTH_RATE_LIMIT = '100000';
process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'helpdesk-uploads-'));

// Default: in-memory SQLite. CI also runs the whole suite against PostgreSQL by passing DATABASE_URL.
if (process.env.DATABASE_URL) process.env.DB_DROP_SCHEMA = 'true';
else delete process.env.DATABASE_URL;
