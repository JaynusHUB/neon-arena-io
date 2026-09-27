/**
 * logic/Devour.ts — Hücre-yutma (Agar.io kuralı) + ölüm ekonomisi.
 * render/ importu YOKTUR.
 *
 * Kural (HÜCRE ÇİFTİ başına, 11b çok hücreli):
 *   1) a.mass ≥ b.mass × massRatio  (belirgin fark — küçük farkla yeme yok)
 *   2) derin örtüşürler: mesafe < a.radius − b.radius × overlapFrac
 * Sonuç: yiyen HÜCRE mass + sahibi skor kazanır (temas anında, client'tan değil),
 * yutulan hücre SİLİNİR; sahibi hücresiz kalırsa AYNI instance rastgele
 * konumda yeniden doğar (botCount/leaderboard canlı kalır). Mass'in bir kısmı
 * ölüm noktasında yem olarak saçılır (intikam yolu) ve olay bırakılır →
 * renderer altın patlama + hayalet + gulp, oyuncu ölünce ekran flaşı patlatır.
 * Kendi hücreleri birbirini YİYEMEZ (merge/push Player.ts'tedir).
 */
import { visualTheme } from '../theme/visualTheme';
import type { PlayerState, CellState } from './Player';
import { syncAggregates } from './Player';
import { respawnBot } from './Bot';
import type { BotState } from './Bot';
import type { GameEvent, GameState } from './GameState';
import type { Vec2 } from './types';
import { spawnFood } from './Food';
import { foodMassGain, addCellMass } from './Growth';

export function resolveDevour(state: GameState): void {
  const d = visualTheme.game.devour;
  const actors: PlayerState[] = [state.player, ...state.bots];

  for (const eater of actors) {
    if (eater.cells.length === 0) continue; // ölü gövde ne yer ne yenir
    for (const victim of actors) {
      if (eater === victim) continue;
      if (victim.cells.length === 0) continue;
      // Hücre snapshot'ları (yutma sırasında diziler değişir → guards ile korunur)
      const eCells = eater.cells.slice();
      const vCells = victim.cells.slice();
      let victimGone = false;
      for (const ec of eCells) {
        if (!eater.cells.includes(ec)) continue;
        for (const vc of vCells) {
          if (!victim.cells.includes(vc)) continue;
          // 1) mass oranı (hücre seviyesi)
          if (ec.mass < vc.mass * d.massRatio) continue;
          // 2) yeme mesafesi (derin örtüşme)
          const eatR = ec.radius - vc.radius * d.overlapFrac;
          if (eatR <= 0) continue;
          const dx = ec.x - vc.x;
          const dy = ec.y - vc.y;
          if (dx * dx + dy * dy >= eatR * eatR) continue;
          devourCell(state, eater, ec, victim, vc);
          if (victim.cells.length === 0) {
            victimGone = true;
            break;
          }
        }
        if (victimGone) break;
      }
    }
  }

  for (const a of actors) syncAggregates(a, 1);
}

function devourCell(
  state: GameState,
  eater: PlayerState,
  ec: CellState,
  victim: PlayerState,
  vc: CellState,
): void {
  const d = visualTheme.game.devour;
  const victimMass = vc.mass;
  // Ölüm anı geometrisi (silme ÖNCESİ) — saçılma halkası buna göre kurulur
  const deathX = vc.x;
  const deathY = vc.y;
  const eaterR = ec.radius;
  const victimR = vc.radius;

  // Yiyen HÜCRE kazanır — mass devri; SKOR sahibine (Growth zinciri)
  addCellMass(ec, victimMass * d.gain);
  eater.score += Math.round(victimMass * d.scorePerMass);

  // ADIM 11e — emilim hayaleti + gulp için anlık görüntü:
  // hayalet kaynağı = kurban hücre, hedefi = yutan hücre.
  state.events.push({
    kind: 'cell-eaten',
    x: deathX,
    y: deathY,
    victimIsPlayer: victim.id === state.player.id,
    eaterId: eater.id,
    eaterX: ec.x,
    eaterY: ec.y,
    eaterR: ec.radius,
    victimId: vc.id,
    victimR: victimR,
    victimMass: victimMass,
    victimName: victim.name,
    victimSkin: victim.skin,
    victimBotIndex:
      victim.id === state.player.id ? -1 : state.bots.indexOf(victim as BotState),
  });

  // Ölüm ekonomisi: mass'in bir kısmı yem olarak saçılır (intikam yolu)
  scatterFood(state, ec.x, ec.y, deathX, deathY, eaterR, victimR, victimMass);

  // Yutulan hücre SİLİNİR
  const vi = victim.cells.indexOf(vc);
  if (vi >= 0) victim.cells.splice(vi, 1);

  // Ölen hücre çekmekte olduğu yemleri bırakır — aksi halde respawn sonrası
  // yem HARİTA BOYUNCA yeni konuma uçar (puller hücresi sabit kalır).
  for (const f of state.foods) {
    if (f.puller && f.puller.cell === vc) {
      f.puller = null;
      f.pull = 0;
    }
  }

  // Sahip hücresiz kaldı → OYUNCU ise ölüm ekranı (bekleyen respawn),
  // BOT ise yaşayanlardan uzakta anında yeniden doğuş (aynı instance →
  // palet/leaderboard sabit). Kısmi kayıpta kalan hücreler savaşmaya devam eder.
  if (victim.cells.length === 0) {
    if (victim.id === state.player.id) {
      state.playerDead = true;
      state.death = {
        score: victim.score,
        bestMass: Math.max(state.run.bestMass, victim.mass),
        survivedSec: Math.max(0, state.timeSec - state.run.startSec),
        killer: eater.name || '???',
        killerSkin: eater.skin,
        coinsAwarded: false,
      };
    } else {
      const live = livePositions(state, victim);
      respawnBot(victim as BotState, state.world, live);
    }
  }
}

/** Yaşayan aktörlerin konumları (kurban hariç) — ayrık respawn kaçınması. */
function livePositions(state: GameState, exclude: PlayerState): Vec2[] {
  const out: Vec2[] = [];
  const actors: PlayerState[] = [state.player, ...state.bots];
  for (const a of actors) {
    if (a === exclude || a.cells.length === 0) continue;
    out.push({ x: a.x, y: a.y });
  }
  return out;
}

/**
 * Ölüm saçılması — ölen mass'ine göre ölüm noktasında HALLKA biçiminde normal
 * yem bırakır: intikam yolu (rakip toplar ya da ölen geri döner). Halka,
 * yiyenin erişiminin DIŞINDA kurulur → yiyen kendi bırakılanını anında
 * vakumlamaz. Adet = mass × ratio / normal yem kazanımı, maxCount ile tavanlı.
 */
function scatterFood(
  state: GameState,
  eaterX: number,
  eaterY: number,
  deathX: number,
  deathY: number,
  eaterR: number,
  victimR: number,
  victimMass: number,
): void {
  const s = visualTheme.game.deathScatter;
  const normalGain = foodMassGain();
  // Global tavan — saçılma aditif; foods asla maxFoodCount'u aşamaz
  const capacity = Math.max(0, visualTheme.game.maxFoodCount - state.foods.length);
  const count = Math.min(
    capacity,
    Math.max(1, Math.min(s.maxCount, Math.round((victimMass * s.ratio) / normalGain))),
  );
  const base = (eaterR + victimR) * s.ringFactor;
  const margin = visualTheme.size.foodRadius * 2;
  const w = state.world.width;
  const h = state.world.height;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = base + (Math.random() * 2 - 1) * s.ringJitter;
    const rawX = deathX + Math.cos(angle) * dist;
    const rawY = deathY + Math.sin(angle) * dist;
    const fx = Math.max(margin, Math.min(w - margin, rawX));
    const fy = Math.max(margin, Math.min(h - margin, rawY));
    // Duvar kırpması HALKAYI YİYENİN İÇİNE çekebilir → anında vakum →
    // intikam yolu kapanır. Sadece clamp gerçekleştiyse ve sonuç yiyenin
    // erişimindeyse o pellet'i atla (kenar sahnesinde birkaç kayıp,
    // instant vacuum'dan iyidir). Clamp yoksa orijinal davranış korunur.
    const clamped = fx !== rawX || fy !== rawY;
    if (clamped) {
      const dx = fx - eaterX;
      const dy = fy - eaterY;
      const minKeep = eaterR + margin;
      if (dx * dx + dy * dy < minKeep * minKeep) continue;
    }
    state.foods.push(spawnFood(state.world, { x: fx, y: fy }));
  }
}

/** push'lanan olay tipi — GameEvent union'ı GameState.ts'te (type-only, cycle yok). */
export type { GameEvent };
