/**
 * logic/Food.ts — Yem varlıkları ve toplama zinciri mantığı (agar.io modeli).
 * render/ importu YOKTUR.
 *
 * Yem: TEK tip düz renkli nokta (1000 adet sahada, 1:1 respawn).
 * RENK mantıkta YOK — hue, seed'den theme.color.food.hueOf ile türetilir
 * (renderer/payload/test aynı formülü kullanır).
 *
 * Toplama zinciri (interaction-design): temas → kısa çekiliş (150ms) → çözüm
 * (skor/büyüme + olay → renderer POOF patlatır).
 */
import { visualTheme } from '../theme/visualTheme';
import type { Vec2, WorldBounds } from './types';
import type { PlayerState, CellState } from './Player';

/** Yemi yiyebilen hücre sözleşmesi — ÇOK HÜCRELİ (11b): yiyen BİR HÜCREDİR,
 *  skor/büyüme sahibine (owner) işlenir. */
export interface FoodCellEntry {
  owner: PlayerState;
  cell: CellState;
}

export interface FoodState {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** renderer/payload hue tohumu (0..1) — mantıkta renk yok, sadece tohum */
  seed: number;
  /** toplama çekilişi 0..1. 0 → serbest */
  pull: number;
  /** çekilişi başlatan hücre (kim yiyor) — pull > 0 iken dolu */
  puller: FoodCellEntry | null;
}

let nextFoodId = 1;

function randomPos(world: WorldBounds, margin: number): Vec2 {
  return {
    x: margin + Math.random() * (world.width - margin * 2),
    y: margin + Math.random() * (world.height - margin * 2),
  };
}

export interface SpawnOptions {
  /** verilirse rastgele yerine tam bu koordinata doğar (test) */
  x?: number;
  y?: number;
}

export function spawnFood(world: WorldBounds, opts?: SpawnOptions): FoodState {
  const radius = visualTheme.size.foodRadius;
  const pos: Vec2 =
    opts && opts.x !== undefined && opts.y !== undefined
      ? { x: opts.x, y: opts.y }
      : randomPos(world, radius); // referans util.randomPosition: rastgele konum, pay = radius
  return {
    id: nextFoodId++,
    x: pos.x,
    y: pos.y,
    radius,
    seed: Math.random(), // hue + glif tohumu (0..1)
    pull: 0,
    puller: null,
  };
}

export function createFoodField(world: WorldBounds, count: number): FoodState[] {
  const foods: FoodState[] = [];
  for (let i = 0; i < count; i++) {
    foods.push(spawnFood(world));
  }
  return foods;
}

/** Çakışma testi: merkezler arası mesafe < r1 + r2 */
export function overlaps(a: Vec2 & { radius: number }, b: Vec2 & { radius: number }): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.radius + b.radius;
  return dx * dx + dy * dy < rr * rr;
}

export interface FoodStepResult {
  /** bu adımda çözülen yemler + YİYEN hücre (skor/büyüme sahibine uygulanır) */
  resolved: (FoodCellEntry & { food: FoodState })[];
  remaining: FoodState[];
}

/**
 * Yem sahası adımı:
 * - temasta çekiliş başlat / devam ettir — hedef YİYEN hücredir (hücre seviyesi),
 * - çekiliş bitince çözüm: konum yiyen hücreye yapıştırılır.
 * Birden çok hücre yiyebilir: ilk temas eden çekilişi alır.
 * Konum interpolasyonu burada (logic), görsel ölçek/parça renderer'da.
 */
export function updateFoods(
  actors: readonly PlayerState[],
  cells: readonly FoodCellEntry[],
  foods: FoodState[],
  dt: number,
): FoodStepResult {
  const pullDur = visualTheme.animation.collectPullSec;
  const approach = 1 - Math.exp(-14 * dt); // framerate'den bağımsız yaklaşma
  const resolved: FoodStepResult['resolved'] = [];
  const remaining: FoodState[] = [];

  for (const food of foods) {
    const puller = food.puller;
    if (food.pull > 0 && puller !== null) {
      // Hücre hâlâ yaşıyor mu (birleşme/yutma ile silinmiş olabilir)?
      const ownerAlive = actors.includes(puller.owner);
      const cellAlive = ownerAlive && puller.owner.cells.includes(puller.cell);
      if (cellAlive) {
        const eater = puller.cell;
        food.pull = Math.min(1, food.pull + dt / pullDur);
        food.x += (eater.x - food.x) * approach;
        food.y += (eater.y - food.y) * approach;
        if (food.pull >= 1) {
          food.x = eater.x; // POOF tam yiyenin üzerinden patlar
          food.y = eater.y;
          resolved.push({ owner: puller.owner, cell: eater, food });
        } else {
          remaining.push(food);
        }
        continue;
      }
      // yiyen hücre yok oldu → çekilişi sıfırla
      food.pull = 0;
      food.puller = null;
    }

    // Temas: ilk değen hücre çekilişi alır
    food.puller = null;
    for (const entry of cells) {
      if (overlaps(entry.cell, food)) {
        food.pull = 0.0001; // çekiliş başladı (görsel ölçek renderer'da küçülür)
        food.puller = entry;
        break;
      }
    }
    remaining.push(food);
  }
  return { resolved, remaining };
}
