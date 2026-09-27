/**
 * logic/Virus.ts — Yeşil dikenli denge mekaniği (RESMİ agar.io: yeme ve split
 * AYRI olaylar). render/ importu YOKTUR.
 *
 * Kurallar:
 * 1) YEME (koşulsuz): hücre virüsten BÜYÜKSE VE değiyorsa → virüs HER ZAMAN
 *    silinir, mass'i hücreye + skoru sahibine eklenir (16/16 DAHİL).
 * 2) SPLIT (koşullu): SADECE parça sayısı 16'dan azsa radial patlama;
 *    tavanda bu adım atlanır (yeme devam eder).
 * 3) Küçük/eşit hücre → altına saklanır (etkileşim YOK).
 * - Uçan pellet (W) SADECE duran virüsü besler; eşikte top + tabana dönüş.
 * - Şişkinlik yavaşça tabana iner (deflate) — saha temiz kalır.
 * Sayı sabit tutulur (yenilen/patlayan rastgele yeniden doğar).
 */
import { visualTheme } from '../theme/visualTheme';
import type { WorldBounds } from './types';
import type { PlayerState } from './Player';
import { virusSplit, syncAggregates } from './Player';
import { addCellMass, radiusFromMass } from './Growth';
import type { GameState } from './GameState';

export interface VirusState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
}

let nextVirusId = 1;

export function createVirus(world: WorldBounds, mass?: number): VirusState {
  const m = mass ?? visualTheme.game.virus.baseMass;
  const r = radiusFromMass(m);
  return {
    id: nextVirusId++,
    x: r + Math.random() * (world.width - r * 2),
    y: r + Math.random() * (world.height - r * 2),
    vx: 0,
    vy: 0,
    mass: m,
    radius: r,
  };
}

export function createViruses(world: WorldBounds, count: number): VirusState[] {
  const out: VirusState[] = [];
  for (let i = 0; i < count; i++) out.push(createVirus(world));
  return out;
}

function burst(state: GameState, x: number, y: number, mine: boolean): void {
  state.events.push({ kind: 'virus-eaten', x, y, mine });
}

/** Virüs adımı: hareket + pellet besleme + hücre etkileşimi + kota koruma. */
export function updateViruses(state: GameState, dt: number): void {
  const v = visualTheme.game.virus;
  const damp = Math.exp(-v.motionFriction * dt);
  const w = state.world.width;
  const h = state.world.height;

  // 1) Uçan virüsler sürtünmeyle durulur + şişkinlik yavaşça tabana iner
  //    (eski W denemeleri sahayı kalıcı bozmaz — diken hep patlar durumda)
  for (const virus of state.viruses) {
    if (virus.mass > v.baseMass) {
      virus.mass = Math.max(v.baseMass, virus.mass - v.deflatePerSec * dt);
      virus.radius = radiusFromMass(virus.mass);
    }
    if (virus.vx !== 0 || virus.vy !== 0) {
      virus.x += virus.vx * dt;
      virus.y += virus.vy * dt;
      virus.vx *= damp;
      virus.vy *= damp;
      if (virus.x < virus.radius) {
        virus.x = virus.radius;
        virus.vx = 0;
      }
      if (virus.x > w - virus.radius) {
        virus.x = w - virus.radius;
        virus.vx = 0;
      }
      if (virus.y < virus.radius) {
        virus.y = virus.radius;
        virus.vy = 0;
      }
      if (virus.y > h - virus.radius) {
        virus.y = h - virus.radius;
        virus.vy = 0;
      }
      if (Math.hypot(virus.vx, virus.vy) < v.settleSpeed) {
        virus.vx = 0;
        virus.vy = 0;
      }
    }
  }

  // 1b) Virüs-virüs itişmesi — uçan virüs duranları sürükler (zincir topu)
  for (let i = 0; i < state.viruses.length; i++) {
    for (let j = i + 1; j < state.viruses.length; j++) {
      const a = state.viruses[i];
      const b = state.viruses[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const sum = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= sum * sum || d2 < 0.001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const aSp = Math.hypot(a.vx, a.vy);
      const bSp = Math.hypot(b.vx, b.vy);
      if (aSp < 1 && bSp < 1) continue; // ikisi de durgunsa dokunma
      // Hareketli olanın normal hızının yarısı durana geçer
      const mover = aSp >= bSp ? a : b;
      const still = mover === a ? b : a;
      const vn = mover.vx * nx * (mover === a ? 1 : -1) + mover.vy * ny * (mover === a ? 1 : -1);
      if (vn > 0) {
        still.vx += nx * vn * 0.5 * (mover === a ? 1 : -1);
        still.vy += ny * vn * 0.5 * (mover === a ? 1 : -1);
        mover.vx *= 0.7;
        mover.vy *= 0.7;
      }
      // Örtüşme çözümü — iç içe geçmesinler
      const overlap = (sum - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
    }
  }

  // 2) Pellet beslemesi — SADECE DURAN virüs beslenir (uçan top pellet
  //    yemez → zincirleme çoğalma imkânsız: top, arkasındaki pellet akımıyla
  //    tekrar şişip yeni top doğuramaz). Virüs şişer, eşiği aşarsa pelletin
  //    geldiği yönde YENİ virüs fırlatır ve tabana döner.
  for (const p of state.pellets.slice()) {
    let eaten = false;
    for (const virus of state.viruses) {
      if (virus.vx !== 0 || virus.vy !== 0) continue; // uçan virüs beslenemez
      const dx = p.x - virus.x;
      const dy = p.y - virus.y;
      const rr = virus.radius + p.radius;
      if (dx * dx + dy * dy >= rr * rr) continue;
      virus.mass += p.mass;
      if (virus.mass > v.maxMass) virus.mass = v.maxMass; // kaçak şişme yok
      virus.radius = radiusFromMass(virus.mass);
      burst(state, virus.x, virus.y, false); // besleme — XP yok (yeme değil)
      // TOP: eşiği AŞAĞIDAN YUKARI geçerken BİR KEZ ateşler, sonra tabana
      // döner (birikim yok → makineli tüfek imkânsız). Toplam tavanı aşmaz.
      if (
        virus.mass - p.mass < v.shotThreshold &&
        virus.mass >= v.shotThreshold &&
        state.viruses.length < v.maxTotal
      ) {
        virus.mass = v.baseMass;
        virus.radius = radiusFromMass(virus.mass);
        const d = Math.hypot(p.vx, p.vy) || 1;
        state.viruses.push({
          id: nextVirusId++,
          x: virus.x,
          y: virus.y,
          vx: (p.vx / d) * v.shotSpeed,
          vy: (p.vy / d) * v.shotSpeed,
          mass: v.shotMass,
          radius: radiusFromMass(v.shotMass),
        });
      }
      eaten = true;
      break;
    }
    if (eaten) {
      const idx = state.pellets.indexOf(p);
      if (idx >= 0) state.pellets.splice(idx, 1);
    }
  }

  // 3) Hücre etkileşimi — YEME + SPLIT iki ayrı olay (resmi agar.io):
  //    1) YEME koşulsuz: büyük hücre değiyorsa virüs HER ZAMAN silinir,
  //       mass hücreye + skor sahibine (16/16 dahil).
  //    2) SPLIT koşullu: sadece parça < 16 ise radial patlama; tavanda
  //       bu adım atlanır (yeme devam eder, sessizlik yok).
  //    Küçük/eşit hücre saklanır. Sürtme patlatır/yedirir (boşluk sorunu yok).
  const actors: PlayerState[] = [state.player, ...state.bots];
  const maxCells = visualTheme.game.split.maxCells;
  for (let vi = state.viruses.length - 1; vi >= 0; vi--) {
    const virus = state.viruses[vi];
    let consumed = false;
    for (const owner of actors) {
      const snapshot = owner.cells.slice();
      for (const cell of snapshot) {
        if (!owner.cells.includes(cell)) continue;
        if (cell.mass <= virus.mass) continue; // küçük/eşit → saklan
        const dx = virus.x - cell.x;
        const dy = virus.y - cell.y;
        const touch = cell.radius + virus.radius * v.popTouch;
        if (dx * dx + dy * dy >= touch * touch) continue; // değmiyorsa dokunma
        // 1) YEME — koşulsuz (tavan dinlemez)
        addCellMass(cell, virus.mass);
        owner.score += Math.round(virus.mass);
        burst(state, virus.x, virus.y, owner.id === state.player.id);
        // 2) SPLIT — sadece yer varsa
        if (owner.cells.length < maxCells) {
          const idx = owner.cells.indexOf(cell);
          if (idx >= 0) virusSplit(owner, idx, state.timeSec);
        }
        consumed = true;
        break;
      }
      if (consumed) break;
    }
    if (consumed) {
      // Yenilen virüsün yerine yenisi doğar (kota sabit)
      state.viruses[vi] = createVirus(state.world);
    }
  }

  for (const a of actors) syncAggregates(a, 1);
}

/** test/payload için canlı virüs sayısı. */
export function virusCount(state: GameState): number {
  return state.viruses.length;
}
