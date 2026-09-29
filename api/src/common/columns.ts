/** SQLite (used in tests and zero-setup dev) has no timestamptz; PostgreSQL does. */
export const DATE_TYPE = process.env.DATABASE_URL ? 'timestamptz' : 'datetime';
