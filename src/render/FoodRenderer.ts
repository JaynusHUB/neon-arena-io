/**
 * render/FoodRenderer.ts — AGAR.IO BİREBİR yem (referans drawFood):
 * DÜZ hsl(hue,100%,50%) dolgu; DIŞ ÇİZGİ (stroke) ve glif YOK.
 * Üstüne SADECE ÇİZİM ANINDA blob outline (theme.foodWobble): çevrede
 * SEGMENTS nokta, her nokta bağımsız çift-sinüsle oynar, aralar
 * quadraticCurveTo ile yumuşatılır — state'e DOKUNULMAZ.
 * State okur, değiştirmez. Renk: theme (hue seed'den theme formülüyle).
 *
 * Korunan juice: toplama çekilişi (ease-in ile küçülerek yutulma) —
 * sessiz aksiyon yok kuralı gereği yem yutulurken görünür geri bildirim şart.
 * Viewport culling: 4000 yemden yalnızca görünen çizilir → 60fps.
 */
import { visualTheme } from '../theme/visualTheme';
import type { FoodState } from '../logic/Food';
import type { PelletState } from '../logic/Pellets';
import type { Camera } from './Camera';

const TAU = Math.PI * 2;

/** Blob çevre nokta sayısı (8 = organik şekil, ucuz eğri). */
const SEGMENTS = 8;
/** Çizim scratch'i — modül seviyesinde TEK SEFER ayrılır; yem başına
 *  nesne/dizi üretimi YOK (çizim senkron, tek thread → paylaşım güvenli). */
const BX = new Float64Array(SEGMENTS);
const BY = new Float64Array(SEGMENTS);

export function drawFoods(
  ctx: CanvasRenderingContext2D,
  foods: FoodState[],
  cam: Camera,
  viewW: number,
  viewH: number,
  nowSec: number,
): void {
  const t = visualTheme;
  const zoom = cam.zoom;
  // Görünür dünya dikdörtgeni + culling payı
  const margin = t.size.foodRadius * 2.3;
  const halfW = viewW / (2 * zoom);
  const halfH = viewH / (2 * zoom);
  const left = cam.x - halfW - margin;
  const right = cam.x + halfW + margin;
  const top = cam.y - halfH - margin;
  const bottom = cam.y + halfH + margin;

  for (const food of foods) {
    if (food.x < left || food.x > right || food.y < top || food.y > bottom) continue;
    drawFoodBody(ctx, food, nowSec);
  }
}

/** Tek yem — referans düz dolgu + SADECE ÇİZİM ANINDA blob outline:
 *  food.x/y/radius OKUNUR, asla yazılmaz (çarpışma gerçek konumdadır).
 *  Her çevre noktası kendi açısından türeyen bağımsız çift-sinüsle oynar
 *  (iki farklı frekans/faz üst üste); aralar quadraticCurveTo ile yumuşar.
 *  Scratch buffer kullanılır (yem başına dizi üretimi YOK — çıktı aynı). */
function drawFoodBody(ctx: CanvasRenderingContext2D, food: FoodState, nowSec: number): void {
  const t = visualTheme;
  const hue = t.color.food.hueOf(food.seed);

  // Toplama çekilişi: küçülerek yutulma (pop/kesme yok — ease-in) — BOZULMADI
  const shrink = food.pull > 0 ? 1 - t.animation.easeInCubic(food.pull) : 1;
  const rBase = food.radius * shrink;
  if (rBase <= 0.05) return;

  const phase = food.seed * TAU;

  // her açı noktası için FARKLI miktarda dalgalanma → düzensiz "gummy" hissi
  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * TAU;
    const wobble =
      0.06 * Math.sin(angle * 3 + nowSec * 1.3 + phase) +
      0.035 * Math.sin(angle * 5 - nowSec * 0.8 + phase * 1.9);
    const r = rBase * (1 + wobble);
    BX[i] = food.x + Math.cos(angle) * r;
    BY[i] = food.y + Math.sin(angle) * r;
  }

  // noktalar arasından quadratic curve ile yumuşak geçiş (köşeleri gizler)
  ctx.beginPath();
  ctx.moveTo((BX[SEGMENTS - 1] + BX[0]) / 2, (BY[SEGMENTS - 1] + BY[0]) / 2);
  for (let i = 0; i < SEGMENTS; i++) {
    const j = (i + 1) % SEGMENTS;
    ctx.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[j]) / 2, (BY[i] + BY[j]) / 2);
  }
  ctx.closePath();

  ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
  ctx.fill();
}

/** Uçan pelletler (W) — normalde ateşleyen renginde düz daireler.
 *  Alev Topu kuşanılıyken 4 katmanlı gerçek alev: yumuşak hale → dış alev
 *  (HIZA GÖRE UZAMIŞ elips) → sıcak çekirdek → beyaz nokta. Uçuş izi ve iniş
 *  patlaması parçacık havuzundan gelir (Game.ts), burada yalnız gövde çizilir. */
export function drawPellets(
  ctx: CanvasRenderingContext2D,
  pellets: readonly PelletState[],
  fiery: boolean,
  timeSec: number,
): void {
  if (!fiery) {
    for (const p of pellets) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, TAU);
      ctx.fill();
    }
    return;
  }
  const f = visualTheme.firepellet;
  for (let i = 0; i < pellets.length; i++) {
    const p = pellets[i];
    // GÖRSEL yarıçap: mantık yarıçapından büyük çizilir (renderScale).
    // Çarpışma/mantık yarıçapı DEĞİŞMEZ — kosmetik projeksiyon.
    const r = p.radius * f.renderScale;
    // Titreşim: pellet başına ayrı faz (senkron alev olmaz)
    const flick = 1 + f.flickAmp * Math.sin(timeSec * f.flickSpeed + i * 2.1);
    const rr = r * flick;
    // Uzama yalnız hıza bağlı: yavaşlayan pellet yuvarlaklaşır
    const sp = Math.hypot(p.vx, p.vy);
    const stretch = 1 + (f.stretch - 1) * Math.min(1, sp / 520);

    ctx.save();
    ctx.translate(p.x, p.y);
    if (sp > 1) ctx.rotate(Math.atan2(p.vy, p.vx));

    // 1) Yumuşak hale — "yanıyor" hissi (düşük alfa, geniş)
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = f.outer;
    ctx.beginPath();
    ctx.arc(0, 0, rr * 2.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // 2) Dış alev — hıza göre uzamış elips
    ctx.fillStyle = f.outer;
    ctx.beginPath();
    ctx.ellipse(0, 0, rr * stretch, rr, 0, 0, TAU);
    ctx.fill();

    ctx.restore();

    // 3) Çekirdek katmanları hıza bağlı DEĞİL (yuvarlak kalır → sıcak nokta)
    ctx.fillStyle = f.inner;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr * 0.62, 0, TAU);
    ctx.fill();
    ctx.fillStyle = f.core;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr * 0.3, 0, TAU);
    ctx.fill();
  }
}
