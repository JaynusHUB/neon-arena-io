/**
 * server/src/db/client.ts — PostgreSQL bağlantısı (tembel, env yoksa null).
 * DB'siz de sunucu AYAKTA KALIR (oyun etkilenmez, sadece kayıt yapılmaz).
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.ts';

let pool: Pool | null = null;

export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!pool) {
    pool = new Pool({ connectionString: url });
    pool.on('error', (err) => console.error('[db] pool error', err.message));
  }
  return drizzle(pool, { schema });
}
