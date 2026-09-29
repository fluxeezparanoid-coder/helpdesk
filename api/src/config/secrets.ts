import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';

let devFallback: string | undefined;

/**
 * The signing key must come from the environment in production. In development a
 * random key is generated per process (tokens die on restart) rather than shipping a default.
 */
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    return secret;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production');
  if (!devFallback) {
    devFallback = randomBytes(48).toString('base64url');
    new Logger('Config').warn('JWT_SECRET not set: using a random per-process key (development only)');
  }
  return devFallback;
}
