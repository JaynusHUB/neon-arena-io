/**
 * server/src/leaderboard.ts — Redis sorted-set leaderboard.
 * all-time + günlük + haftalık (orijinal mimari: Cache sorted set).
 * Redis yoksa sessizce devre dışı (oyun etkilenmez).
 */
import Redis from 'ioredis';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on('error', () => {
    /* Redis yoksa oyun durmaz — leaderboard atlanır */
  });
  return redis;
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function weekKey(d = new Date()): string {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}W${week}`;
}

/** Ölümde çağrılır: skoru üç tabloya işler. */
export async function recordScore(name: string, score: number): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.zadd('neon:lb:all', score, name);
    await r.zadd(`neon:lb:daily:${dayKey()}`, score, name);
    await r.zadd(`neon:lb:weekly:${weekKey()}`, score, name);
  } catch {
    /* leaderboard best-effort */
  }
}

/** İlk N (yüksekten düşüğe) — canlı tablo + all-time sayfası buradan. */
export async function top(board: 'all' | 'daily' | 'weekly', n = 10): Promise<{ name: string; score: number }[]> {
  const r = getRedis();
  if (!r) return [];
  const key = board === 'all' ? 'neon:lb:all' : board === 'daily' ? `neon:lb:daily:${dayKey()}` : `neon:lb:weekly:${weekKey()}`;
  try {
    const raw = await r.zrevrange(key, 0, n - 1, 'WITHSCORES');
    const out: { name: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      out.push({ name: raw[i], score: Number(raw[i + 1]) });
    }
    return out;
  } catch {
    return [];
  }
}
