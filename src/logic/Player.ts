/**
 * logic/Player.ts — Oyuncu durumu, hareket ve dünya sınırı (yassılaşma) mantığı.
 * render/ importu YOKTUR (mimari kural).
 * Büyüme formülünün kaynağı logic/Growth.ts'tir (mass lineer → radius √).
 *
 * ÇOK HÜCRELİ GÖVDE (11b split — referans player.js modeli):
 * - Oyuncu = cells[] dizisi (her hücre kendi mass/konum/hızına sahip).
 * - x/y/vx/vy/mass/radius/targetRadius/stage alanları GERİYE UYUMLULUK için
 *   tutulan TÜRETİLMİŞ aggregate'lerdir (kütle-ağırlıklı merkez + toplam mass);
 *   oyun mantığı HER ZAMAN cells[]'i okur. Kamera/payload/test bu alanları
 *   eskisi gibi kullanmaya devam eder.
 */
import { visualTheme } from '../theme/visualTheme';
import type { Vec2, WorldBounds } from './types';
import type { EffectSlot } from '../skins/effects';
import { NO_EFFECT } from '../skins/effects';
import { radiusFromMass, stageForMass } from './Growth';

/** Tek hücre — hareket + boost + mass'in sahibi (referans Cell). */
export interface CellState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** split fırlatma hızı (ekstra vektör, exp ile söner) */
  bvx: number;
  bvy: number;
  /** DOĞRUSAL madde (bu hücre) */
  mass: number;
  /** yumuşatılmış görünen çapa (bu hücre) */
  radius: number;
  /** mass'ten hedef çapa (bu hücre) */
  targetRadius: number;
}

export interface PlayerState {
  id: string;
  /** hücreler — gövdenin GERÇEĞİ (mantık burayı okur) */
  cells: CellState[];
  /** parça id sayacı (split ile artar, id'ler eşsiz kalır) */
  splitSeq: number;
  /** kendi parçalarının birleşebileceği sim zamanı (sn) — öncesi itişirler */
  timeToMerge: number;
  /** split sonrası bekleme (sn) — >0 iken yeni split YOK */
  splitCd: number;
  /** W ateşleme bütçesi (token bucket) — resmi sınır: sn başına max 7 pellet */
  ejectBudget: number;
  /** son nişan açısı (radyan) — split/eject yönü */
  aimAngle: number;
  /** OYUNCU ADI (isim ekranı) — hücre ortasında + leaderboard satırında görünür */
  name: string;
  /** aktif skin id (skins/registry; default = theme.skin.defaultId 'classic') */
  skin: string;
  /** kuşanılmış hücre efektleri — slot başına bağımsız ('none' = boş slot) */
  effects: Record<EffectSlot, string>;
  score: number;
  /** yenen yem sayısı (her yem +1) */
  foodEaten: number;
  /** son hareket yönü (radyan) — renderer yönü çizer */
  facing: number;
  /* ---- TÜRETİLMİŞ aggregate'ler (cells[]'den senkronlanır — salt-okunur kabul et) ---- */
  /** kütle-ağırlıklı merkez */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** TOPLAM madde (tüm hücreler) */
  mass: number;
  /** toplam mass'ten hedef çapa */
  targetRadius: number;
  /** yumuşatılmış görünen çapa (toplam) */
  radius: number;
  /** görsel evrim kademesi (toplam mass'ten) */
  stage: number;
}

export function massTotal(p: PlayerState): number {
  let m = 0;
  for (const c of p.cells) m += c.mass;
  return m;
}

export function createCell(x: number, y: number, mass: number, id: string): CellState {
  const radius = radiusFromMass(mass);
  return { id, x, y, vx: 0, vy: 0, bvx: 0, bvy: 0, mass, radius, targetRadius: radius };
}

export function createPlayer(world: WorldBounds, id = 'local', skin = visualTheme.skin.defaultId): PlayerState {
  const mass = visualTheme.growth.baseMass;
  const pos = randomSpawnPos(world);
  const p: PlayerState = {
    id,
    skin,
    effects: {
      trail: NO_EFFECT,
      consume: NO_EFFECT,
      split: NO_EFFECT,
      aura: NO_EFFECT,
      pellet: NO_EFFECT,
    },
    cells: [createCell(pos.x, pos.y, mass, `${id}:c0`)],
    splitSeq: 0,
    timeToMerge: 0,
    splitCd: 0,
    ejectBudget: visualTheme.game.eject.budgetCap,
    aimAngle: 0,
    name: '',
    score: 0,
    foodEaten: 0,
    facing: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    mass: 0,
    targetRadius: 0,
    radius: 0,
    stage: 0,
  };
  syncAggregates(p, 1);
  return p;
}

/** Aggregate'leri cells[]'den türet (kamera/payload/test uyumluluğu). */
export function syncAggregates(p: PlayerState, dt: number): void {
  let m = 0;
  let x = 0;
  let y = 0;
  let vx = 0;
  let vy = 0;
  for (const c of p.cells) {
    m += c.mass;
    x += c.x * c.mass;
    y += c.y * c.mass;
    vx += c.vx * c.mass;
    vy += c.vy * c.mass;
  }
  if (m > 0) {
    p.x = x / m;
    p.y = y / m;
    p.vx = vx / m;
    p.vy = vy / m;
  }
  p.mass = m;
  p.targetRadius = radiusFromMass(m);
  p.stage = stageForMass(m);
  const rk = 1 - Math.exp(-visualTheme.animation.radiusLerp * dt);
  if (p.radius <= 0) p.radius = p.targetRadius;
  else p.radius += (p.targetRadius - p.radius) * rk;
  if (Math.hypot(p.vx, p.vy) > 1) {
    p.facing = Math.atan2(p.vy, p.vx);
  }
}

/** Rastgele doğuş konumu — dünya kenarından game.spawnInsetRatio oranda içeride. */
export function randomSpawnPos(world: WorldBounds): Vec2 {
  const s = visualTheme.game.spawnInsetRatio;
  return {
    x: world.width * (s + Math.random() * (1 - s * 2)),
    y: world.height * (s + Math.random() * (1 - s * 2)),
  };
}

/**
 * Ayrık doğuş konumu — `avoid` listesindeki her noktadan olabildiğince uzakta.
 * spawnTries aday denenir, en iyi (en uzak) aday kazanır; ayrıklık tutmazsa
 * bile en iyi aday döner (asla takılmaz, asla merkez çakışması).
 */
export function pickSpawnPos(world: WorldBounds, avoid: readonly Vec2[]): Vec2 {
  const g = visualTheme.game;
  let best = randomSpawnPos(world);
  let bestD = minAvoidDist(best, avoid);
  if (bestD >= g.spawnSeparation) return best;
  for (let i = 1; i < g.spawnTries; i++) {
    const cand = randomSpawnPos(world);
    const d = minAvoidDist(cand, avoid);
    if (d > bestD) {
      best = cand;
      bestD = d;
      if (bestD >= g.spawnSeparation) break;
    }
  }
  return best;
}

function minAvoidDist(p: Vec2, avoid: readonly Vec2[]): number {
  let m = Infinity;
  for (const a of avoid) {
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d < m) m = d;
  }
  return m;
}

/**
 * Ölüm → Agar.io gibi yeniden doğuş: tüm alanlar tabana döner
 * (mass 100, skor 0, buff'lar sıfır, TEK hücre), yaşayanlardan uzakta başlar.
 */
export function respawnPlayer(p: PlayerState, world: WorldBounds, avoid: readonly Vec2[] = []): void {
  const skin = p.skin; // oyuncunun seçtiği skin ÖLÜMDE KORUNUR
  const effects = { ...p.effects }; // kuşanılmış efektler de korunur
  const name = p.name; // adı da korunur (yeniden yazmak gerekmesin)
  Object.assign(p, createPlayer(world, p.id));
  p.skin = skin;
  p.effects = effects;
  p.name = name;
  const pos = pickSpawnPos(world, avoid);
  for (const c of p.cells) {
    c.x = pos.x;
    c.y = pos.y;
  }
  p.facing = Math.random() * Math.PI * 2;
  syncAggregates(p, 1);
}

/**
 * Dünya sınırı (hücre seviyesi) — referans game-logic.js
 * adjustForBoundaries(cell, radius/3, 0): merkez yarıçapın r/3'ü kadar duvara
 * sokulabilir → kontur duvara TAŞAR; renderer taşan konturu kırpıp hücreyi
 * YASSILAŞTIRIR. Merkez sınırı aşamaz (r/3'te DURUR), hız sıfırlanır.
 */
export function clampCellToWorld(c: CellState, world: WorldBounds): void {
  const inset = c.radius * visualTheme.game.wallCenterRatio;
  if (c.x < inset) {
    c.x = inset;
    c.vx = 0;
  }
  if (c.x > world.width - inset) {
    c.x = world.width - inset;
    c.vx = 0;
  }
  if (c.y < inset) {
    c.y = inset;
    c.vy = 0;
  }
  if (c.y > world.height - inset) {
    c.y = world.height - inset;
    c.vy = 0;
  }
}

/**
 * Hücre taban hızı — TEK formül (hareket + split boost aynı kaynaktan):
 * baseSpeed ÷ slowDown(mass). Mass büyüdükçe logaritmik yavaşlar.
 */
export function cellBaseSpeed(mass: number): number {
  const mv = visualTheme.movement;
  const slowDown =
    Math.log(Math.max(visualTheme.growth.baseMass, mass) / visualTheme.growth.baseMass) /
      Math.log(mv.slowBase) +
    1;
  return mv.baseSpeed / slowDown;
}

/**
 * Hareket + decay + kendi-parça fiziği — referans agar.io-clone Cell.move:
 * - Her hücre AYNI hedefe yürür; slowDown KENDİ mass'inden (büyük parça yavaş).
 * - Split boost'u (bvx/bvy) exp ile söner → fırlayan parça durulur.
 * - Parçalar: timeToMerge öncesi İTİŞİR, sonrası BİRLEŞİR (referans
 *   pushAwayCollidingCells / mergeCollidingCells).
 * - Mass decay: eşiğin üstündeki hücre mass kaybeder (endgame baskısı).
 */
export function updatePlayer(
  p: PlayerState,
  target: Vec2 | null,
  dt: number,
  world: WorldBounds,
  timeSec: number,
): void {
  const mv = visualTheme.movement;
  const sp = visualTheme.game.split;
  const dc = visualTheme.game.decay;

  for (const c of p.cells) {
    let desiredVx = 0;
    let desiredVy = 0;

    if (target) {
      const dx = target.x - c.x;
      const dy = target.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) {
        // Hücre taban hızı (hareket + split boost TEK formül)
        const speed = cellBaseSpeed(c.mass);
        // referans: dist < (MIN_DISTANCE + radius) → delta *= dist/(MIN_DISTANCE+radius)
        const glide = mv.glideDistance + c.radius;
        const ease = dist < glide ? dist / glide : 1;
        desiredVx = (dx / dist) * speed * ease;
        desiredVy = (dy / dist) * speed * ease;
      }
    }

    // Framerate'den bağımsız yumuşatma: 1 - e^(-k·dt)
    const k = 1 - Math.exp(-mv.velocityLerp * dt);
    c.vx += (desiredVx - c.vx) * k;
    c.vy += (desiredVy - c.vy) * k;

    // Split boost sönümü
    const bk = Math.exp(-sp.boostDecay * dt);
    c.bvx *= bk;
    c.bvy *= bk;

    c.x += (c.vx + c.bvx) * dt;
    c.y += (c.vy + c.bvy) * dt;

    clampCellToWorld(c, world);

    // Mass decay — eşik üstü hücre erir
    if (c.mass > dc.minMass) {
      c.mass = Math.max(dc.minMass, c.mass - c.mass * dc.rate * dt);
      c.targetRadius = radiusFromMass(c.mass);
    }

    // Büyüme animasyonu: mass → √ → hedef çapa, ease ile kısa animasyon
    c.targetRadius = radiusFromMass(c.mass);
    const rk = 1 - Math.exp(-visualTheme.animation.radiusLerp * dt);
    c.radius += (c.targetRadius - c.radius) * rk;
  }

  // Kendi parçaları: birleşme zamanı gelmediyse itiş, geldiyse birleş
  if (p.cells.length > 1) {
    if (timeSec >= p.timeToMerge) mergeOwnCells(p);
    else pushOwnCells(p, dt, world);
  }

  // Efekt geri sayımı (split beklemesi)
  p.splitCd = Math.max(0, p.splitCd - dt);
  // W bütçesi dolar (resmi hız sınırı — token bucket)
  const ej = visualTheme.game.eject;
  p.ejectBudget = Math.min(ej.budgetCap, p.ejectBudget + ej.ratePerSec * dt);

  syncAggregates(p, dt);
}

/** Birleşme: derin örtüşen kendi parçaları büyük olana gömülür. */
function mergeOwnCells(p: PlayerState): void {
  const mo = visualTheme.game.split.mergeOverlap;
  for (let i = 0; i < p.cells.length; i++) {
    const a = p.cells[i];
    if (!a) continue;
    for (let j = i + 1; j < p.cells.length; j++) {
      const b = p.cells[j];
      if (!b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = (a.radius + b.radius) * mo;
      if (dx * dx + dy * dy < rr * rr) {
        const big = a.mass >= b.mass ? a : b;
        const small = big === a ? b : a;
        big.mass += small.mass;
        big.targetRadius = radiusFromMass(big.mass);
        p.cells.splice(p.cells.indexOf(small), 1);
        j--;
      }
    }
  }
}

/** İtişme: birleşme zamanı gelmemiş örtüşen parçalar birbirinden uzaklaşır.
 *  Hız YARIÇAP-ÖLÇEKLİ ((r1+r2) × oran/sn) → dev parçalar da makul sürede
 *  ayrışır, minikler eski hızında kalır. */
function pushOwnCells(p: PlayerState, dt: number, world: WorldBounds): void {
  const ratio = visualTheme.game.split.pushRadiusRatio;
  for (let i = 0; i < p.cells.length; i++) {
    const a = p.cells[i];
    for (let j = i + 1; j < p.cells.length; j++) {
      const b = p.cells[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const sum = a.radius + b.radius;
      let d = Math.hypot(dx, dy);
      if (d >= sum) continue;
      if (d < 0.001) {
        dx = 0;
        dy = 1;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      const push = sum * ratio * dt;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      clampCellToWorld(a, world);
      clampCellToWorld(b, world);
    }
  }
}

/**
 * Hücre bölme çekirdeği (referans splitCell): hücreyi `pieces` parçaya böler
 * (orijinal + yeni hücreler), yeni parçalar verilen yön(ler)de boost'la fırlar.
 * dirs: tek açı (userSplit) ya da açı dizisi (virüs radial patlama).
 * Dönen değer = YARATILAN yeni parça sayısı.
 */
export function splitCellMass(
  owner: PlayerState,
  index: number,
  maxPieces: number,
  timeSec: number,
  dirs: number | number[],
): number {
  const sp = visualTheme.game.split;
  const cell = owner.cells[index];
  if (!cell) return 0;
  // Parça sonucu minSplitMass'in altına düşemez (referans maxAllowedPieces)
  const maxAllowed = Math.floor(cell.mass / sp.minSplitMass);
  const pieces = Math.min(maxAllowed, maxPieces);
  if (pieces < 2) return 0;
  const newMass = cell.mass / pieces;
  // Boost, bölünMEden ÖNCEKİ mass'in taban hızından (büyük hücre hızlı fırlar,
  // tabanına göre orantılı → göreli atılganlık her boyda aynı) + TABAN:
  // küçük hücrede taban tutmaz (değişiklik yok), büyükte sönük kalmaz.
  const boost = Math.max(cellBaseSpeed(cell.mass) * sp.boostMult, sp.minBoostSpeed);
  cell.mass = newMass;
  cell.targetRadius = radiusFromMass(newMass);

  const dirList = Array.isArray(dirs) ? dirs : [dirs];
  for (let k = 0; k < pieces - 1; k++) {
    const angle = dirList[k % dirList.length];
    owner.splitSeq++;
    const nc = createCell(cell.x, cell.y, newMass, `${owner.id}:c${owner.splitSeq}`);
    nc.vx = cell.vx;
    nc.vy = cell.vy;
    nc.bvx = Math.cos(angle) * boost;
    nc.bvy = Math.sin(angle) * boost;
    owner.cells.push(nc);
  }
  // Birleşme cezası: gövde büyüdükçe geç birleşir, parça arttıkça daha da uzar.
  //
  // ESKİ: min(max, base + mass×0.02)  +  16 parça istisnası → base
  //   SORUN 1 (ölü bölge): 15 + mass×0.02, 1.000 kütlede tavana (35sn) dayanıyor;
  //     1.000 kütlenin ÜSTÜNDE parametre hiç etki etmiyordu. Oyunun son evresi
  //     tam da orasıydı → büyük gövde hep aynı 35sn'yi bekliyordu.
  //   SORUN 2 (ters ödül): 16 parça istisnası parçaya EN KISA süreyi veriyordu.
  //     2 parça 35sn, 16 parça 15sn → bölmek ödüllendiriliyordu.
  //
  // YENİ: ln dağılımı tüm kitle aralığında yanıt verir (doygunluk yok) ve parça
  // sayısı CEZA olarak eklenir (bölmek artık ödül değil, taşıdığı risk).
  const massTerm =
    sp.mergeMassLogFactor * Math.log(1 + massTotal(owner) / visualTheme.growth.baseMass);
  const cellTerm = (owner.cells.length - 1) * sp.mergePerCellSec;
  owner.timeToMerge = timeSec + Math.min(sp.mergeMaxSec, sp.mergeBaseSec + massTerm + cellTerm);
  syncAggregates(owner, 1);
  return pieces - 1;
}

/**
 * Oyuncu split'i (Space — referans userSplit): HER hücreyi ikiye bölmeye
 * çalışır (en büyükten başlar mantığı yerine sırayla; 16 tavanı korunur).
 * Dönen değer = yaratılan parça sayısı.
 */
export function userSplit(owner: PlayerState, timeSec: number, angle: number): number {
  const sp = visualTheme.game.split;
  if (owner.splitCd > 0) return 0; // bekleme — çift basış israfı yok
  const n0 = owner.cells.length;
  if (n0 >= sp.maxCells) return 0;
  let created = 0;
  for (let i = 0; i < n0; i++) {
    const room = sp.maxCells - owner.cells.length;
    if (room <= 0) break;
    created += splitCellMass(owner, i, Math.min(2, room + 1), timeSec, angle);
  }
  if (created > 0) owner.splitCd = sp.cooldownSec;
  return created;
}

/**
 * Virüs patlaması (referans virusSplit): hücreyi mümkün olan EN ÇOK parçaya
 * böler (16 tavanına kadar), parçalar RADYAL fırlar. Dönen = yeni parça sayısı.
 */
export function virusSplit(owner: PlayerState, index: number, timeSec: number): number {
  const sp = visualTheme.game.split;
  const room = sp.maxCells - owner.cells.length;
  if (room <= 0) return 0;
  const cell = owner.cells[index];
  if (!cell) return 0;
  const maxAllowed = Math.floor(cell.mass / sp.minSplitMass);
  const pieces = Math.min(maxAllowed, room + 1);
  if (pieces < 2) return 0;
  const dirs: number[] = [];
  for (let k = 0; k < pieces - 1; k++) {
    dirs.push((k / (pieces - 1)) * Math.PI * 2);
  }
  return splitCellMass(owner, index, pieces, timeSec, dirs);
}

/**
 * Yem çözüldüğünde çağrılır — büyüme zincirinin tek giriş kapısı (oyuncu seviyesi,
 * geriye uyumluluk): skor/foodEaten oyuncuya, mass EN BÜYÜK hücreye işlenir.
 * (Normal akış hücre seviyesinde addCellMass ile yürür.)
 */
export function applyGrowth(p: PlayerState, foodScore: number, massGain: number): void {
  p.foodEaten += 1;
  p.score += foodScore;
  let big = p.cells[0];
  for (const c of p.cells) if (c.mass > big.mass) big = c;
  if (big) {
    big.mass += Math.max(1, massGain);
    big.targetRadius = radiusFromMass(big.mass);
  }
  syncAggregates(p, 1);
}

