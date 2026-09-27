/**
 * progression/xp.ts — Kalıcı XP/Seviye katmanı (SCORE ve COIN'den ayrı).
 *
 * - SCORE: maçlık, sıfırlanır. COIN: harcanabilir. XP: hesaba bağlı KALICI
 *   ilerleme (localStorage — backend yokken tarayıcıda yaşar).
 * - Eğri: L → L+1 için gereken = round(80 × L^1.55), tavan 200. seviye.
 * - Kurallar/mantık YOK — saf cüzdan+seviye hesabı (market.ts disiplini).
 */
import { visualTheme } from '../theme/visualTheme';

function key(): string {
  return visualTheme.xp.storageKey;
}

/** L → L+1 için gereken XP (eğri tek kaynak). */
export function xpForLevel(level: number): number {
  const x = visualTheme.xp;
  return Math.max(1, Math.round(x.curveBase * Math.pow(Math.max(1, level), x.curveExp)));
}

/** Toplam XP → seviye (tavanlı). */
export function levelFor(totalXp: number): number {
  const max = visualTheme.xp.maxLevel;
  let acc = 0;
  for (let l = 1; l <= max; l++) {
    acc += xpForLevel(l);
    if (totalXp < acc) return l;
  }
  return max;
}

/** Seviye içi ilerleme: {level, into, needed} (bar buradan beslenir). */
export function xpProgress(totalXp: number): { level: number; into: number; needed: number } {
  const max = visualTheme.xp.maxLevel;
  let acc = 0;
  for (let l = 1; l <= max; l++) {
    const need = xpForLevel(l);
    if (totalXp < acc + need || l === max) {
      return { level: l, into: Math.max(0, totalXp - acc), needed: need };
    }
    acc += need;
  }
  return { level: max, into: 0, needed: 1 };
}

/** Kayıtlı toplam XP (yoksa 0). */
export function getTotalXP(): number {
  try {
    const v = Number(localStorage.getItem(key()));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch {
    return 0;
  }
}

/**
 * XP ekler → {gained: atlanılan seviye, level, total}. Seviye tavanında
 * XP birikmeye devam eder (kayıp yok), seviye 200'de durur.
 */
export function addXP(n: number): { gained: number; level: number; total: number } {
  const before = levelFor(getTotalXP());
  const total = getTotalXP() + Math.max(0, Math.floor(n));
  try {
    localStorage.setItem(key(), String(total));
  } catch {
    /* storage yok → ilerleme sadece oturumda (0 okunur) */
  }
  const level = levelFor(total);
  return { gained: Math.max(0, level - before), level, total };
}

/* ---------- Sunum katmanı (saf okuma — kural/mantık yok) ---------- */

/** Seviye → rank rengi (ulaşılan en yüksek kilometre taşı, yoksa xp.textColor). */
export function rankColor(level: number): string {
  const x = visualTheme.xp;
  let c: string = x.textColor;
  for (const m of x.milestones) {
    if (level >= m.level) c = m.color;
  }
  return c;
}

/** Seviye → unvan (xp.tiers, tierSpan seviyede bir; tavana kilitlenir). */
export function tierFor(level: number): string {
  const x = visualTheme.xp;
  const i = Math.min(x.tiers.length - 1, Math.max(0, Math.floor((level - 1) / x.tierSpan)));
  return x.tiers[i];
}
