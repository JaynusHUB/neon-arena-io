/**
 * logic/Bot.ts — Yapay rakip hücreler.
 * render/ importu YOKTUR. Aynı Growth/Collision sistemini kullanırlar:
 * PlayerState olarak doğar → updatePlayer ile hareket eder (aynı hız/ease/sınır),
 * updateFoods ile yem yer, applyGrowth ile büyür (gerçek oyuncu gibi).
 *
 * Davranış (basit — pathfinding YOK), öncelik sırası:
 *   1) KAÇ   — kendinden büyük biri fleeRadius içinde → doğrudan uzağa
 *   2) SALDIR — kendinden küçük biri chaseRadius içinde → ona yönel
 *   3) YEM   — foodSearchRadius içindeki en yakın yeme
 *   4) GEZ   — hiçbiri yoksa rastgele gezinme hedefi
 */
import { visualTheme } from '../theme/visualTheme';
import type { Vec2, WorldBounds } from './types';
import { createPlayer, pickSpawnPos, syncAggregates } from './Player';
import type { PlayerState } from './Player';
import type { FoodState } from './Food';

export interface BotState extends PlayerState {
  /** leaderboard + isim plakası adı */
  name: string;
  /** gezinme hedefi (yem/prey yokken) */
  wander: Vec2;
  /** gezinme hedefi yenileme sayacı (sn) */
  wanderTimer: number;
  /** yumuşatılmış nişan hedefi — ham hedefe doğru kademeli döner
   *  (ani yön sıçraması YOK; game.bot.turnDamping ile lerp) */
  aim: Vec2;
}

/** İsim havuzundan rastgele isimler (havuz uzunluğu ≥ botCount garanti). */
const BOT_NAMES = [
  'VIPER', 'NOVA', 'ZENITH', 'ECHO', 'BLAZE', 'ORBIT',
  'CIPHER', 'DRIFT', 'PULSE', 'KARMA', 'HEX', 'VOLT',
  'FANG', 'RAPTOR', 'GHOST', 'TITAN', 'NEBULA', 'QUARK',
  'VORTEX', 'ONYX', 'JINX', 'PIXEL', 'ROGUE', 'SABER',
  'TALON', 'UMBRA', 'WASP', 'YETI', 'ZEPHYR', 'COBRA',
  'HYDRA', 'FALCON', 'GRIZZLY', 'HAVOC', 'IRON', 'JAGUAR',
  'KRAKEN', 'LYNX', 'MAMBA', 'NOMAD', 'OCELOT', 'PANDA',
  'QUEST', 'RAVEN', 'SCORPION', 'TEMPEST', 'URSA', 'VEX',
  'XENON', 'YUKON', 'ZODIAC', 'BANDIT', 'COYOTE', 'DAGGER',
  'EMBER', 'FLINT', 'GECKO', 'HORNET', 'IVY', 'JET',
];

/** count adet bot — PlayerState gövdesi + bot alanları, BİRBİRİNDEN AYRIK spawnda.
 *  AGAR.IO BİREBİR: botlar SADECE 'classic' (düz renkli, prosedürel palet)
 *  hücre olarak doğar — gerçek agar.io'da rakip hücreler AI sprite/skin
 *  taşımaz, düz dolgu + koyu kontur kullanır (botPaletteAt, PlayerRenderer).
 *  Skin sistemi SADECE oyuncunun kendi seçimiyle (skin menüsü) devreye girer.
 *  KRİTİK: hücrenin KONUMU da ayrık noktaya yazılır (sadece aggregate değil) —
 *  yoksa syncAggregates herkesi merkeze çeker (üst üste doğuş bug'ı). */
export function createBots(world: WorldBounds, count: number, avoid: readonly Vec2[] = []): BotState[] {
  const b = visualTheme.game.bot;
  const bots: BotState[] = [];
  const placed: Vec2[] = [...avoid];
  for (let i = 0; i < count; i++) {
    const base = createPlayer(world, `bot-${i}`);
    const pos = pickSpawnPos(world, placed);
    placed.push(pos);
    for (const c of base.cells) {
      c.x = pos.x;
      c.y = pos.y;
    }
    syncAggregates(base, 1);
    const poolName = BOT_NAMES[i % BOT_NAMES.length];
    bots.push({
      ...base,
      skin: visualTheme.skin.defaultId, // 'classic' — agar.io birebir düz hücre
      // havuz bittiğinde eşsizlik korunur
      name: i < BOT_NAMES.length ? poolName : `${poolName}${i}`,
      wander: { x: pos.x, y: pos.y },
      wanderTimer: Math.random() * b.wanderRestSec,
      aim: { x: pos.x, y: pos.y },
    });
  }
  return bots;
}

/**
 * Bot karar adımı — durumu değiştirir (yalnızca kendi wander/aim alanları),
 * yumuşatılmış hedef döndürür. Hareketin kendisi GameState.updatePlayer ile olur.
 * Öncelik: KAÇ > SALDIR > YEM > GEZ.
 * YUMUŞAK DÖNÜŞ: ham hedef her step'te hesaplanır ama bot.aim'e kademeli
 * döner (turnDamping) → hedef değişse bile yön ani sıçramaz (viraj eğrisi).
 */
export function decideBotTarget(
  bot: BotState,
  actors: readonly PlayerState[],
  foods: readonly FoodState[],
  dt: number,
): Vec2 | null {
  const b = visualTheme.game.bot;
  /** bu step'in ham (yumuşatılmamış) hedefi */
  let raw: Vec2;

  // 1) KAÇ — en yakın büyük tehidit
  let threat: PlayerState | null = null;
  let threatBest = Infinity;
  const fleeR2 = b.fleeRadius * b.fleeRadius;
  for (const a of actors) {
    if (a === bot || a.mass <= bot.mass) continue;
    const d2 = (a.x - bot.x) * (a.x - bot.x) + (a.y - bot.y) * (a.y - bot.y);
    if (d2 < fleeR2 && d2 < threatBest) {
      threat = a;
      threatBest = d2;
    }
  }

  // 2) SALDIR — en yakın küçük av
  let prey: PlayerState | null = null;
  let preyBest = Infinity;
  const chaseR2 = b.chaseRadius * b.chaseRadius;
  for (const a of actors) {
    if (a === bot || a.mass >= bot.mass) continue;
    const d2 = (a.x - bot.x) * (a.x - bot.x) + (a.y - bot.y) * (a.y - bot.y);
    if (d2 < chaseR2 && d2 < preyBest) {
      prey = a;
      preyBest = d2;
    }
  }

  // 3) EN YAKIN YEM
  let target: FoodState | null = null;
  let best = b.foodSearchRadius * b.foodSearchRadius;
  for (const f of foods) {
    const d2 = (f.x - bot.x) * (f.x - bot.x) + (f.y - bot.y) * (f.y - bot.y);
    if (d2 < best) {
      best = d2;
      target = f;
    }
  }

  if (threat) {
    const dx = bot.x - threat.x;
    const dy = bot.y - threat.y;
    const d = Math.hypot(dx, dy) || 1;
    const run = b.fleeRadius * 1.6; // tehdidin yarıçapının dışına kadar hedef
    raw = { x: bot.x + (dx / d) * run, y: bot.y + (dy / d) * run };
  } else if (prey) {
    raw = { x: prey.x, y: prey.y };
  } else if (target) {
    raw = { x: target.x, y: target.y };
  } else {
    // 4) GEZİNME — hedefe vardım ya da süre doldu → yeni rastgele hedef
    bot.wanderTimer -= dt;
    const wd2 = (bot.wander.x - bot.x) * (bot.wander.x - bot.x) + (bot.wander.y - bot.y) * (bot.wander.y - bot.y);
    if (wd2 < b.wanderArrive * b.wanderArrive || bot.wanderTimer <= 0) {
      bot.wander = {
        x: bot.x + (Math.random() - 0.5) * 2 * b.wanderRange,
        y: bot.y + (Math.random() - 0.5) * 2 * b.wanderRange,
      };
      bot.wanderTimer = b.wanderRestSec;
    }
    raw = { x: bot.wander.x, y: bot.wander.y };
  }

  // KADEMELİ DÖNÜŞ — aim, ham hedefe doğru 60fps'de kare başına
  // turnDamping kadar döner: k = 1 - (1 - d)^(60·dt) → ani sıçrama yok.
  const k = 1 - Math.pow(1 - b.turnDamping, Math.max(dt, 0) * 60);
  bot.aim.x += (raw.x - bot.aim.x) * k;
  bot.aim.y += (raw.y - bot.aim.y) * k;
  return bot.aim;
}

/**
 * Ölüm → yeniden doğuş: PlayerState alanları tabana döner (mass 100, skor 0);
 * bot alanları (name/wander/skin) fresh'te olmadığından KORUNUR —
 * kimlik (isim + rastgele skin) sabit kalır.
 */
export function respawnBot(bot: BotState, world: WorldBounds, avoid: readonly Vec2[] = []): void {
  const skin = bot.skin; // rastgele skin kimliği korunur
  const name = bot.name; // bot adı korunur (leaderboard kimliği sabit)
  Object.assign(bot, createPlayer(world, bot.id));
  bot.skin = skin;
  bot.name = name;
  const pos = pickSpawnPos(world, avoid);
  for (const c of bot.cells) {
    c.x = pos.x;
    c.y = pos.y;
  }
  bot.wander.x = pos.x;
  bot.wander.y = pos.y;
  bot.wanderTimer = Math.random() * visualTheme.game.bot.wanderRestSec;
  bot.aim.x = pos.x;
  bot.aim.y = pos.y;
  syncAggregates(bot, 1);
}
