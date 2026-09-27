/**
 * skins/market.ts — Coin ekonomisi + kalıcı envanter (localStorage).
 *
 * - Coin kazanımı: SADECE ölümde (DeathScreen claim eder — tek seferlik).
 * - Skin satın alma: bakiye + kilit kontrolü burada (UI sadece çağırır).
 * - classic her zaman açıktır. Kurallar/logic YOK — saf cüzdan+envanter.
 * - Formül/oranlar: theme.market (hardcoded sayı yok).
 */
import { visualTheme } from '../theme/visualTheme';
import { isValidSkin, skinPrice } from './registry';
import { isValidEffect, effectPrice, NO_EFFECT } from './effects';

const m = visualTheme.market;

function readCoins(): number {
  try {
    const v = Number(localStorage.getItem(m.coinsKey));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

function readOwned(): string[] {
  try {
    const raw = localStorage.getItem(m.ownedKey);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return ['classic'];
    const owned = arr.filter((x): x is string => typeof x === 'string' && isValidSkin(x));
    if (!owned.includes('classic')) owned.unshift('classic');
    return owned;
  } catch {
    return ['classic'];
  }
}

/** Güncel bakiye (coin). */
export function getCoins(): number {
  return readCoins();
}

/** Sahip olunan skin id'leri (classic dahil). */
export function getOwned(): string[] {
  return readOwned();
}

/** Skin açık mı (classic her zaman açık)? */
export function isOwned(id: string): boolean {
  if (id === 'classic') return true;
  return readOwned().includes(id);
}

/** Ölüm kazancı: floor(skor×perScore + enİyiMass×perMass + süre×perSec). */
export function earnForRun(score: number, bestMass: number, survivedSec: number): number {
  const t = visualTheme.market;
  return Math.max(
    0,
    Math.floor(score * t.perScore + bestMass * t.perMass + survivedSec * t.perSec),
  );
}

/** Bakiyeye coin ekler (ölüm ödülü) → yeni bakiye. */
export function addCoins(n: number): number {
  const next = readCoins() + Math.max(0, Math.floor(n));
  try {
    localStorage.setItem(m.coinsKey, String(next));
  } catch {
    /* storage yok → bakiye sadece oturumda (0 okunur) */
  }
  return next;
}

/**
 * Satın alma (skin VEYA efekt): bakiye yeterli + kilitli + geçerli id ise
 * düşer ve açılır. Dönüş: ok + yeni bakiye + neden (UI geri bildirimi için).
 */
export function buyItem(id: string): { ok: boolean; coins: number; reason: 'ok' | 'owned' | 'poor' | 'bad' } {
  if (id === NO_EFFECT) return { ok: false, coins: readCoins(), reason: 'owned' }; // 'yok' satılmaz
  const valid = isValidSkin(id) || isValidEffect(id);
  if (!valid) return { ok: false, coins: readCoins(), reason: 'bad' };
  if (isOwned(id)) return { ok: false, coins: readCoins(), reason: 'owned' };
  const price = isValidSkin(id) ? skinPrice(id) : effectPrice(id);
  const coins = readCoins();
  if (coins < price) return { ok: false, coins, reason: 'poor' };
  const owned = readOwned();
  owned.push(id);
  try {
    localStorage.setItem(m.coinsKey, String(coins - price));
    localStorage.setItem(m.ownedKey, JSON.stringify(owned));
  } catch {
    return { ok: false, coins, reason: 'bad' };
  }
  return { ok: true, coins: coins - price, reason: 'ok' };
}

