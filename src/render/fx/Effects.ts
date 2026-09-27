/**
 * render/fx/Effects.ts — YUTMA / BÖLÜNME / ATIŞ efektlerinin emisyonu.
 *
 * Her efekt koreografik bir patlamadır:
 *   YUTMA   → çekirdek flaş → gecikmeli halka dalgası (4 kademe) → kırıntı + köz
 *   BÖLÜNME → çekirdek flaş → ince iç halka → kalın dış halka → patlama çizgileri
 *   ATIŞ    → namlu konisi (anlık) / uçuş izi (sürekli) / iniş patlaması (tek)
 *
 * SORUMLULUK AYRIMI (ölçümle doğrulandı):
 * - HALKA + ÇEKİRDEK FLAŞ → ImpactFx. Havuz oyunun ORTAK kaynağı; büyük bir
 *   oyuncu durduğunda çevresindeki yem fırtınası havuzu 240'a dolduruyor ve
 *   havuzdan basılan imza efekti o karede sessizce EZİLİYORDU (spark/glow
 *   sayacı 0). Satın alınmış efekt kaybolmamalı → kendi garantili katmanı.
 * - KIRINTI / KÖZ / ÇİZGİ / ALEV → ParticlePool. Bunlar ortam dokusudur;
 *   sıkışınca ezilmeleri doğru davranıştır, havuz bütçesiyle korunur.
 *
 * Tüm değerler visualTheme'den okunur; burada hex YOK.
 * AURA bu dosyada DEĞİL: parçacık kullanmaz, saf çizimdir → OrbitAura.ts.
 */
import { visualTheme } from '../../theme/visualTheme';
import type { ParticlePool } from '../ParticlePool';
import { at, emitBurst, emitRing } from './Emitter';

/**
 * YUTMA — Yutma Şoku (fx-shockwave) · ORTAK DOKU.
 * Kırıntı (dışa fırlayan çizgiler) + yükselen köz (sönen sıcak noktalar).
 * Halkalar ve çekirdek flaş ImpactFx'te çizilir.
 */
export function emitConsumeDebris(
  pool: ParticlePool,
  x: number,
  y: number,
  victimRadius: number,
): void {
  const w = visualTheme.shockwave;
  const sizeMul = 1 + Math.min(0.6, victimRadius / 400);

  // Yükselen köz — hacim dokusu. Kırıntı çizgileri ImpactFx'te.
  emitBurst(pool, x, y, {
    kind: 'dot',
    amount: w.emberCount,
    angle: null,
    spread: 0,
    speed: at(w.emberSpeed),
    life: at(w.emberLife),
    size: at(w.emberSize * sizeMul),
    color: w.colors.ember,
    alpha: 1,
    delay: 0.09,
    delayJitter: at(0.12),
    even: true,
    jitter: w.emberSize * 3,
  });
}

/**
 * ATIŞ — Alev Topu (fx-firepellets) · 1/3: NAMLU.
 * Hücre kenarından namlu yönüne KONİ (düz değil → namlu hissi).
 */
export function emitFireMuzzle(
  pool: ParticlePool,
  x: number,
  y: number,
  angle: number,
  cellRadius: number,
): void {
  const f = visualTheme.firepellet;
  // Namlu hücreyle ölçeklenir: 100 kütlelik hücrede temel boyut, 900 kütlelik
  // hücrede 3× (sabit boyut büyük gövdede iğne ucu gibi görünüyordu).
  const s = Math.max(1, Math.min(3, cellRadius / 100));

  // Kıvılcım konisi — kaotik dağılım (alev düzgün ışın değil)
  emitBurst(pool, x, y, {
    kind: 'spark',
    amount: f.flashCount,
    angle,
    spread: f.flashSpread,
    speed: at(f.flashSpeed * s),
    life: at(f.flashLife * 0.75),
    size: at(f.flashSize * s),
    color: f.inner,
    alpha: 1,
    delay: 0,
    delayJitter: at(0.02),
    even: false,
    jitter: f.flashSize * s,
  });
  // Namlunun parlak çekirdeği
  emitBurst(pool, x, y, {
    kind: 'glow',
    amount: 2,
    angle,
    spread: f.flashSpread * 0.5,
    speed: at(f.flashSpeed * 0.4 * s),
    life: at(f.flashLife),
    size: at(f.flashSize * 3 * s),
    color: f.core,
    alpha: 0.45,
    delay: 0,
    delayJitter: at(0.03),
    even: false,
    jitter: f.flashSize * s,
  });
}

export function emitFireTrail(pool: ParticlePool, x: number, y: number, vx: number, vy: number): void {
  const f = visualTheme.firepellet;
  const back = -0.5; // iz gövdenin biraz gerisinde
  const ox = x + vx * back;
  const oy = y + vy * back;

  emitBurst(pool, ox, oy, {
    kind: 'dot',
    amount: f.trailCount,
    angle: null,
    spread: 0,
    speed: f.trailSpeed,
    life: at(f.trailLife),
    size: at(f.trailSize),
    color: f.outer,
    alpha: 1,
    delay: 0,
    delayJitter: at(0),
    even: true,
    jitter: f.trailJitter,
  });
  // Çekirdek ateş noktası — daha sıcak, daha kısa ömürlü
  emitBurst(pool, ox, oy, {
    kind: 'glow',
    amount: 1,
    angle: null,
    spread: 0,
    speed: at(0),
    life: at(f.trailLife * 0.8),
    size: at(f.trailSize * 2.2),
    color: f.inner,
    alpha: 0.4,
    delay: 0,
    delayJitter: at(0),
    even: true,
    jitter: f.trailJitter * 0.5,
  });
}

/**
 * ATIŞ — Alev Topu · 3/3: İNİŞ PATLAMASI.
 * Pellet yere düşüp normal yeme dönüşürken tetiklenir (Game.ts izler).
 */
export function emitFireLanding(pool: ParticlePool, x: number, y: number): void {
  const f = visualTheme.firepellet;
  emitRing(pool, {
    x,
    y,
    color: f.inner,
    radius: f.landRingRadius,
    life: f.landRingLife,
    delay: 0,
  });
  emitBurst(pool, x, y, {
    kind: 'spark',
    amount: f.landCount,
    angle: null,
    spread: 0,
    speed: at(f.landSpeed),
    life: at(f.landLife),
    size: at(f.landSize),
    color: f.outer,
    alpha: 1,
    delay: 0.01,
    delayJitter: at(0.04),
    even: true,
    jitter: f.landSize,
  });
  emitBurst(pool, x, y, {
    kind: 'glow',
    amount: 1,
    angle: null,
    spread: 0,
    speed: at(0),
    life: at(f.landLife),
    size: at(f.landSize * 3),
    color: f.core,
    alpha: 0.4,
    delay: 0,
    delayJitter: at(0),
    even: true,
    jitter: 0,
  });
}
