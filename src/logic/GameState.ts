/**
 * logic/GameState.ts — Tüm oyun durumunun sahibi (authoritative state).
 * render/ importu YOKTUR. Renderer burayı okur, asla değiştirmez.
 *
 * Oyuncu + botlar AYNI sistemden geçer:
 * - updatePlayer → hareket + dünya sınırı (Collision)
 * - updateFoods  → aynı yem çekişi (ilk temas eden alır)
 * - applyGrowth  → aynı Growth formülü (mass lineer → radius √)
 */
import { visualTheme } from '../theme/visualTheme';
import type { Vec2, WorldBounds } from './types';
import { createPlayer, updatePlayer, syncAggregates } from './Player';
import type { PlayerState } from './Player';
import { createFoodField, updateFoods, spawnFood } from './Food';
import type { FoodCellEntry } from './Food';
import { foodMassGain, addCellMass } from './Growth';
import { createBots, decideBotTarget } from './Bot';
import { resolveDevour } from './Devour';
import { createViruses, updateViruses } from './Virus';
import type { VirusState } from './Virus';
import { updatePellets } from './Pellets';
import type { PelletState } from './Pellets';
import type { BotState } from './Bot';
import type { FoodState } from './Food';

export interface GameState {
  world: WorldBounds;
  player: PlayerState;
  /** rakip hücreler — BotState, PlayerState'i extend eder (aynı Growth/Collision) */
  bots: BotState[];
  foods: FoodState[];
  /** virüsler (yeşil dikenli denge mekaniği) + uçan kütle pelletleri (W) */
  viruses: VirusState[];
  pellets: PelletState[];
  /** koşu istatistiği (ölüm ekranı: en iyi mass + başlangıç) */
  run: { startSec: number; bestMass: number };
  /** oyuncu hücresiz kaldı mı (ölüm ekranı açıkken true, respawn'a kadar) */
  playerDead: boolean;
  /** ölüm raporu (null = hayatta) — skor/en iyi/süre/katil */
  death: DeathInfo | null;
  /** toplama zinciri olay kuyruğu — renderer aynı frame bunu tüketir (POOF/büyümе) */
  events: GameEvent[];
  /** hücre-yutma (Agar.io) açık mı — test hook'u sahne için dondurabilir */
  combatEnabled: boolean;
  timeSec: number;
}

export type GameEvent =
  | {
      kind: 'food-collected';
      x: number;
      y: number;
      score: number;
      growTo: number;
      /** yemin hue'u (0..359) — renderer POOF'u aynı renkten patlatır */
      hue: number;
      /** yiyen oyuncunun kendisi mi (XP sadece oyuncuya işler) */
      mine: boolean;
    }
  /** bir hücre yutuldu → altın patlama + (oyuncu ölünce) ekran flaşı.
   *  ADIM 11e — renderer bu alanlardan emilim hayaleti + yutan gulp'ı kurar
   *  (anlık görüntü: respawn ÖNCESİ snapshot; state değiştirilmez).
   *  victimMass: XP ödülü buradan (progression ayrı katman). */
  | {
      kind: 'cell-eaten';
      x: number;
      y: number;
      victimIsPlayer: boolean;
      /** yutan kimlik — gulp tepkisi bu hücreye uygulanır (render) */
      eaterId: string;
      /** yutan anlık görüntü — hayaletin kayacağı HEDEF */
      eaterX: number;
      eaterY: number;
      eaterR: number;
      /** kurban anlık görüntü (x,y + bunlar) — hayaletin KAYNAĞI */
      victimId: string;
      victimR: number;
      /** kurban mass'i (XP ödülü buradan hesaplanır) */
      victimMass: number;
      victimName: string;
      victimSkin: string;
      /** -1 = oyuncu; ≥0 = bot palet sırası (hayalet palet çözümü render'da) */
      victimBotIndex: number;
    }
  /** 🦠 virüs yenildi/patladı → yeşil burst (sessiz aksiyon yok) */
  | { kind: 'virus-eaten'; x: number; y: number; mine: boolean }
  /** 💥 split patlaması → beyaz halka (sessiz aksiyon yok) */
  | { kind: 'split-burst'; x: number; y: number };

/** Ölüm raporu — ölüm ekranı buradan beslenir (bir kez yazılır). */
export interface DeathInfo {
  score: number;
  bestMass: number;
  survivedSec: number;
  killer: string;
  /** katilin skin id'si (ölüm ekranı avatarı) */
  killerSkin: string;
  /** ölüm coin'i claim edildi mi (çift ödül yok) */
  coinsAwarded: boolean;
}

export function createGameState(): GameState {
  const world: WorldBounds = {
    width: visualTheme.size.worldWidth,
    height: visualTheme.size.worldHeight,
  };
  const player = createPlayer(world);
  // Botlar oyuncudan + birbirlerinden AYRIK doğar (üst üste spawn yok)
  const bots = createBots(world, visualTheme.game.botCount, [{ x: player.x, y: player.y }]);
  return {
    world,
    player,
    bots,
    foods: createFoodField(world, visualTheme.game.foodCount),
    viruses: createViruses(world, visualTheme.game.virus.count),
    pellets: [],
    run: { startSec: 0, bestMass: visualTheme.growth.baseMass },
    playerDead: false,
    death: null,
    events: [],
    combatEnabled: true,
    timeSec: 0,
  };
}

/**
 * Tek mantık adımı. Oyun döngüsü (game/) çağırır; renderer sadece state okur.
 *
 * Sıra: oyuncu hareket → bot karar+hareket → yemler (çözüm yiyene uygulanır).
 * Olaylar her adımda temizlenir; oyun döngüsü hemen sonra tüketir (POOF).
 */
export function stepState(state: GameState, pointerTarget: Vec2 | null, dt: number): void {
  // Olaylar her adımda temizlenir; oyun döngüsü hemen sonra tüketir.
  state.events.length = 0;

  // 1) Hareket — oyuncu (fare hedefi), botlar (kendi karar hedefi).
  //    updatePlayer içinde: hücre hareketi + decay + merge/push + aggregate senkronu.
  updatePlayer(state.player, pointerTarget, dt, state.world, state.timeSec);
  const actors: PlayerState[] = [state.player, ...state.bots];
  for (const bot of state.bots) {
    const target = decideBotTarget(bot, actors, state.foods, dt);
    updatePlayer(bot, target, dt, state.world, state.timeSec);
  }

  // 2) Uçan pelletler (W) — hareket/sürtünme/yere düşme + virüs besleme
  updatePellets(state, dt);

  // 3) Yemler — her HÜCRE yiyebilir; skor/büyüme hücrenin SAHİBİNE uygulanır
  const g = visualTheme.game;
  const entries: FoodCellEntry[] = [];
  for (const a of actors) {
    for (const cell of a.cells) entries.push({ owner: a, cell });
  }
  const { resolved, remaining } = updateFoods(actors, entries, state.foods, dt);
  if (resolved.length > 0) {
    state.foods = remaining;
    for (const { food, owner, cell } of resolved) {
      const score = g.scorePerFood;
      // mass LINEER kazanım (Growth.ts tek kaynak) → radius √ ile büyür
      owner.score += score;
      owner.foodEaten += 1;
      addCellMass(cell, foodMassGain());

      state.events.push({
        kind: 'food-collected',
        x: food.x,
        y: food.y,
        score,
        growTo: cell.targetRadius,
        hue: visualTheme.color.food.hueOf(food.seed),
        mine: owner.id === state.player.id,
      });
      // Sahayı sabit tut: toplanan yemin yerine aynı tipte YENİ yem
      state.foods.push(spawnFood(state.world));
    }
  }

  // 4) Hücre-yutma (Agar.io) — hücre ÇİFTLERİ arasında; ölüm → rastgele yeniden doğuş
  if (state.combatEnabled) resolveDevour(state);

  // 5) Virüsler — yeme/patlatma/fırlatma (yeşil denge mekaniği)
  if (state.combatEnabled) updateViruses(state, dt);

  // Güvenlik senkronu: tüm aggregate'ler cells[]'in gerçeğini yansıtsın
  for (const a of actors) syncAggregates(a, dt);

  // Koşu rekoru (ölüm ekranı: en iyi mass) — yaşayan oyuncu için
  if (!state.playerDead && state.player.mass > state.run.bestMass) {
    state.run.bestMass = state.player.mass;
  }

  state.timeSec += dt;
}
