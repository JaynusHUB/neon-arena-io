/**
 * logic/Pellets.ts — W Eject: uçan kütle pelletleri (referans MassFood).
 * render/ importu YOKTUR.
 *
 * Her yeterli hücre imlece bir pellet fırlatır (mass bedeli hücreden düşer).
 * Pellet sürtünmeyle yavaşlar; durunca NORMAL YEME dönüşür (rengi rastgele
 * tohuma döner — uçuş rengi korunmaz, tasarım notu). Uçarken YENİLEMEZ
 * (çarpışma yok); virüsü besleyebilir (Virus.ts). Global yem tavanına takılırsa
 * yere düşmeden söner.
 */
import { visualTheme } from '../theme/visualTheme';
import type { PlayerState } from './Player';
import { syncAggregates } from './Player';
import type { GameState } from './GameState';
import { spawnFood } from './Food';
import { radiusFromMass } from './Growth';

export interface PelletState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  /** uçuş rengi (ateşleyen hücrenin gövde rengi — theme'den, hardcoded yok) */
  color: string;
}

let nextPelletId = 1;

/**
 * W Eject — her yeterli hücreden imleç yönüne bir pellet.
 * Renk caller'dan gelir (oyuncu/bot paleti render dilinden).
 * RESMİ HIZ SINIRI: pellet başına 1 bütçe harcanır (sn'de 7 dolar);
 * bütçe biterse kalan hücreler bu basışta ateşleyemez.
 * Dönen = yaratılan pelletler (state.pellets'e push'lanır).
 */
export function firePellets(owner: PlayerState, angle: number, color: string): PelletState[] {
  const ej = visualTheme.game.eject;
  const out: PelletState[] = [];
  const snapshot = owner.cells.slice();
  for (const cell of snapshot) {
    if (!owner.cells.includes(cell)) continue;
    if (cell.mass < ej.minCellMass) continue;
    if (owner.ejectBudget < 1) break; // hız sınırı — bu basışta daha fazla yok
    owner.ejectBudget -= 1;
    cell.mass -= ej.pelletMass;
    cell.targetRadius = radiusFromMass(cell.mass);
    out.push({
      id: nextPelletId++,
      x: cell.x + Math.cos(angle) * cell.radius,
      y: cell.y + Math.sin(angle) * cell.radius,
      vx: Math.cos(angle) * ej.speed,
      vy: Math.sin(angle) * ej.speed,
      mass: ej.pelletMass,
      radius: ej.radius,
      color,
    });
  }
  syncAggregates(owner, 1);
  return out;
}

/** Pellet fiziği: hareket + sürtünme + duvar + yere düşme (normal yem). */
export function updatePellets(state: GameState, dt: number): void {
  const ej = visualTheme.game.eject;
  const damp = Math.exp(-ej.friction * dt);
  const w = state.world.width;
  const h = state.world.height;
  const keep: PelletState[] = [];

  for (const p of state.pellets) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= damp;
    p.vy *= damp;
    // Duvar: konum kırpılır, o eksendeki hız ölür
    if (p.x < p.radius) {
      p.x = p.radius;
      p.vx = 0;
    }
    if (p.x > w - p.radius) {
      p.x = w - p.radius;
      p.vx = 0;
    }
    if (p.y < p.radius) {
      p.y = p.radius;
      p.vy = 0;
    }
    if (p.y > h - p.radius) {
      p.y = h - p.radius;
      p.vy = 0;
    }
    const speed = Math.hypot(p.vx, p.vy);
    if (speed < ej.landSpeed) {
      // Yere düştü → normal yem (tavan doluysa söner)
      if (state.foods.length < visualTheme.game.maxFoodCount) {
        const f = spawnFood(state.world, { x: p.x, y: p.y });
        state.foods.push(f);
      }
      continue;
    }
    keep.push(p);
  }
  state.pellets = keep;
}
