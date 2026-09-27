/**
 * render/PlayerRenderer.ts — Hücreleri çizer (AGAR.IO BİREBİR).
 * State okur, değiştirmez. Renk/boyut/animasyon: theme.
 *
 * Stil kararları:
 * - Gövde: DÜZ dolgu + gövdeden %18 KOYU, KALIN kontur (theme.shadeColor).
 * - İsim: hücrenin İÇİNDE ortalanır, beyaz dolgu + siyah kontur,
 *   hücre yarıçapıyla ölçeklenir (theme.nameplateFontPx) — botlar dahil.
 * - Göz/gradyan/glow YOK (birebir clone).
 *
 * Z-SIRA (birebir clone gameLoop): Grid → Yem → Hayalet → Hücreler (küçük → büyük).
 *
 * Duvar modeli: kontur dünya sınırını aşarsa segmentler sınıra kırpılır →
 * hücre duvara bastığında YASSILAŞIR (clone regulatePoint).
 *
 * NOT: spawn kalkanı oyundan KOMPLE kaldırıldı (görsel + mantık) — doğuşta
 * dokunulmazlık yok, herkes herkesi anında yutabilir.
 */
import { visualTheme, nameplateFontPx, shadeColor } from '../theme/visualTheme';
import type { PlayerState, CellState } from '../logic/Player';
import type { BotState } from '../logic/Bot';
import type { WorldBounds } from '../logic/types';
import { getSkinImage, isSkinLoaded } from './SkinAssets';
import { drawOrbitAura } from './fx/OrbitAura';
import type { DevourFx } from './DevourFx';

/** Çizim görünümü — bir hücre + sahibinin görsel kimliği (çok hücreli gövde). */
export interface CellView {
  cell: CellState;
  pal: CellPalette;
  name: string;
  skin: string;
  ownerId: string;
  /** kuşanılmış hücre efekti (aura efektleri buradan okunur) */
  effect: string;
}

/** Hücre paleti — tüm değerler theme'den (hardcoded hex YASAK). */
export interface CellPalette {
  fill: string;
  stroke: string;
}

const PLAYER_PALETTE: CellPalette = {
  fill: visualTheme.color.playerFill,
  stroke: visualTheme.color.playerStroke,
};

/** Skin paleti — theme.skin.variants'tan (classic → null → bot paleti). */
function skinPalette(skinId: string): CellPalette | null {
  const v = visualTheme.skin.variant(skinId);
  if (!v) return null;
  return { fill: v.fill, stroke: v.ring };
}

/** bot paleti — dizi indeksi bot sırası; kontur gövdeden %18 koyu
 *  (agar.io kuralı — theme.shadeColor tek formül). */
function botPaletteAt(index: number): CellPalette {
  const pal = visualTheme.color.botPalette;
  const fill = pal[index % pal.length];
  return { fill, stroke: shadeColor(fill, 0.18) };
}

/** Gövde konturu — ADIM 11d JEL: sinus dalgalı çokgen (agar.io membranı).
 *  r(a) = radius + amp × sin(waves·a + rot + phase) → jelimsi titreme.
 *  Dünya sınırına taşıyan segmentler sınıra kırpılır → duvara YASSILAŞMA
 *  korunur (clone regulatePoint); nabız payı extent'te → duvar dışına taşma yok.
 *  ampMul/speedMul — ADIM 11e: gulp boost (yutan) / gerilim+hız (hayalet).
 *  squishAngle/squishAmp — TEMAS EZİLMESİ: temas ekseninde gauss dent,
 *  iki yanda side-bulge (üst üste binen hücreler birbirini iterken). */
function traceBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  world: WorldBounds,
  timeSec: number,
  phase: number,
  ampMul = 1,
  speedMul = 1,
  squishAngle = NaN,
  squishAmp = 0,
): void {
  const w = visualTheme.cellWobble;
  const n = w.points;
  const amp = radius * w.ampRatio * ampMul;
  const extent = radius + amp + squishAmp; // dalga + ezilme/şişme payı
  const crosses =
    x - extent < 0 || x + extent > world.width || y - extent < 0 || y + extent > world.height;
  const rot = timeSec * w.speed * speedMul;
  const hasSquish = squishAmp > 0 && !Number.isNaN(squishAngle);
  const c = visualTheme.contact;
  const inv2s2 = hasSquish ? 1 / (2 * c.sigma * c.sigma) : 0;
  ctx.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    let rr = radius + amp * Math.sin(w.waves * a + rot + phase);
    if (hasSquish) {
      // temas ekseninde EZİLME, ±90° yanlarda ŞİŞME (jel itişmesi)
      const d0 = angDiff(a, squishAngle);
      const dent = Math.exp(-d0 * d0 * inv2s2);
      const d1 = angDiff(a, squishAngle + Math.PI / 2);
      const d2 = angDiff(a, squishAngle - Math.PI / 2);
      const side =
        Math.exp(-d1 * d1 * inv2s2) + Math.exp(-d2 * d2 * inv2s2);
      rr += squishAmp * (c.sideBulge * side - dent);
    }
    let px = x + Math.cos(a) * rr;
    let py = y + Math.sin(a) * rr;
    if (crosses) {
      px = Math.min(world.width, Math.max(0, px));
      py = Math.min(world.height, Math.max(0, py));
    }
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Açısal fark — (−π, π] aralığına sarılır (temas çanı hesabı için). */
function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Gövde boyası — drawCell ile emilim hayaleti PAYLAŞIR (sprite clip + jelly
 *  kontur + kalın stroke): hayalet, yutulanın rengi/skin'iyle aynı dili konuşur.
 *  alpha caller'dadır (hayalet solar; canlı hücre opaque). */
function paintBody(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  pal: CellPalette,
  skin: string,
  world: WorldBounds,
  timeSec: number,
  phase: number,
  ampMul: number,
  speedMul: number,
  strokeMul = 1,
  squishAngle = NaN,
  squishAmp = 0,
): void {
  const t = visualTheme;
  const sprite = isSkinLoaded(skin) ? getSkinImage(skin) : null;
  const skinPal = skinPalette(skin);
  const bodyPal = skinPal ?? pal;

  if (sprite) {
    // Gövde: sprite'ı jelly konturunda kırp (duvara yassılaşan kenar dahil)
    ctx.save();
    traceBody(ctx, x, y, radius, world, timeSec, phase, ampMul, speedMul, squishAngle, squishAmp);
    ctx.clip();
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();

    // Kenar halkası (net stroke — theme.skin.ringWidthRatio)
    ctx.lineWidth = Math.max(2, radius * t.skin.ringWidthRatio * strokeMul);
    ctx.strokeStyle = bodyPal.stroke;
    traceBody(ctx, x, y, radius, world, timeSec, phase, ampMul, speedMul, squishAngle, squishAmp);
    ctx.stroke();
  } else {
    // Düz dolgu (gradyan/glow YOK) — jelly sinus kenarı
    ctx.fillStyle = bodyPal.fill;
    traceBody(ctx, x, y, radius, world, timeSec, phase, ampMul, speedMul, squishAngle, squishAmp);
    ctx.fill();

    // Kalın kontur — gövdeden %18 koyu (agar.io birebir)
    ctx.lineWidth = t.size.playerStrokeWidth * strokeMul;
    ctx.strokeStyle = bodyPal.stroke;
    ctx.stroke();
  }
}

/** İsim plakası — drawCell + emilim hayaleti paylaşır (alpha caller'dan gelir):
 *  beyaz dolgu + siyah kontur, yarıçapla ölçeklenir, hücrenin İÇİNDE ortalanır. */
function drawName(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  radius: number,
): void {
  const t = visualTheme;
  const np = t.nameplate;
  const fontPx = nameplateFontPx(radius);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${np.weight} ${fontPx}px ${t.hud.fontFamily}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(np.minBorder, fontPx * np.borderRatio);
  ctx.strokeStyle = np.stroke;
  ctx.strokeText(name, x, y);
  ctx.fillStyle = np.fill;
  ctx.fillText(name, x, y);
  ctx.textBaseline = 'alphabetic'; // sonraki çizimleri bozmasın
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  view: CellView,
  world: WorldBounds,
  timeSec: number,
  zoom: number,
  fx?: DevourFx,
  squishAngle = NaN,
  squishAmp = 0,
  squishOverlap = 0,
): void {
  const t = visualTheme;
  const cell = view.cell;
  const { x, y, radius } = cell;
  /** hücreye sabit jelly fazı — id hash (theme.cellWobble.phase TEK formül) */
  const phase = t.cellWobble.phase(cell.id);

  // ADIM 11e gulp — yutan GÖVDENİN tüm hücrelerinde membran sıçraması + şişme;
  // boost güç × (1−t)² ile söner (sadece hücre-yutma olayı tetikler).
  const boost = fx ? fx.boostOf(view.ownerId) : 0;
  const bodyR = radius * (1 + t.gulp.swell * boost);
  // TEMAS HEYECANI — itişen hücre daha hızlı/geniş titrer (yutmaya giden süreç)
  const excite = 1 + t.contact.excite * squishOverlap;
  const speed = 1 + t.contact.speedBoost * squishOverlap;
  const ampMul = (1 + t.gulp.amp * boost) * excite;

  // LOD — ekran yarıçapına göre kademe (miniklerde sprite/membran/isim yok)
  const screenR = bodyR * zoom;
  const lod = t.lod;
  const pal = skinPalette(view.skin) ?? view.pal;

  ctx.save();
  if (screenR < lod.tinyPx) {
    // MİNİK: düz daire + dolgu + ince kontur (isim YOK)
    ctx.fillStyle = pal.fill;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, radius * 0.12);
    ctx.strokeStyle = pal.stroke;
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (screenR < lod.fullPx) {
    // ORTA: düz dolgu (sprite YOK) + membran + kontur + isim
    ctx.fillStyle = pal.fill;
    traceBody(ctx, x, y, bodyR, world, timeSec, phase, ampMul, speed, squishAngle, squishAmp);
    ctx.fill();
    ctx.lineWidth = t.size.playerStrokeWidth;
    ctx.strokeStyle = pal.stroke;
    ctx.stroke();
    if (view.name) drawName(ctx, view.name, x, y, radius);
    ctx.restore();
    return;
  }
  // TAM: sprite + membran + flash + isim + yörünge
  paintBody(
    ctx,
    x,
    y,
    bodyR,
    view.pal,
    view.skin,
    world,
    timeSec,
    phase,
    ampMul,
    speed,
    1,
    squishAngle,
    squishAmp,
  );
  // YUTMA FLAŞI — yutan gövdede beyaz overlay çakar, boost'la söner
  if (boost > 0.01) {
    ctx.globalAlpha = Math.min(1, t.gulp.flashAlpha * boost);
    ctx.fillStyle = t.color.gulpFlash;
    traceBody(ctx, x, y, bodyR, world, timeSec, phase, ampMul, speed, squishAngle, squishAmp);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // İsim HER hücrede ortalanır (agar.io birebir — çok parçalı gövdede her parça)
  if (view.name) drawName(ctx, view.name, x, y, radius);
  // YÖRÜNGE (aura efekti): elips yörüngelerde dönen gezegenler + kuyruk + hale
  if (view.effect === 'fx-orbiters') drawOrbitAura(ctx, x, y, bodyR, timeSec, phase, screenR);
  ctx.restore();
}

/**
 * ADIM 11e — EMİLİM HAYALETLERİ (agar.io Da(): kurban, yutanın merkezine
 *  kayarak yutanın boyuna şişerken SOLAR; smoothstep 0→1, alpha 1→0).
 *  Hücrelerin ALTINA çizilir → yutan, kurbanın üstünden geçerek "yutar"
 *  (vanilla C[] dizisi q[]'den önce çizilir). z: Yem → BUNLAR → Hücreler.
 */
export function drawGhosts(
  ctx: CanvasRenderingContext2D,
  fx: DevourFx,
  world: WorldBounds,
  timeSec: number,
): void {
  const t = visualTheme;
  const a = t.absorb;
  const w = t.cellWobble;
  const speedMul = a.wobbleSpeed / w.speed; // hızlı titreme
  const tension = a.wobbleAmp / w.ampRatio; // yutulma gerilimi katkısı
  for (const g of fx.ghostList) {
    if (!g.active) continue;
    const s = 1 - Math.max(0, g.life) / g.maxLife; // 0 → 1
    const u = s * s * (3 - 2 * s); // vanilla smoothstep (updatePos)
    const x = g.x + (g.tx - g.x) * u;
    const y = g.y + (g.ty - g.y) * u;
    const r0 = g.r * a.startScale; // ilk karede "yutuldum" şişmesi
    const r = r0 + (g.tr - r0) * u; // yutanın boyuna şişme (vanilla oSize→nSize)
    const alpha = 1 - u; // solar (vanilla ×(1 − progress))
    const pal =
      skinPalette(g.skin) ?? (g.botIndex >= 0 ? botPaletteAt(g.botIndex) : PLAYER_PALETTE);

    ctx.save();
    ctx.globalAlpha = alpha;
    paintBody(
      ctx,
      x,
      y,
      r,
      pal,
      g.skin,
      world,
      timeSec,
      g.phase,
      1 + tension * (1 - s),
      speedMul,
      a.rimBoost,
      NaN,
      0,
    );
    if (g.name) drawName(ctx, g.name, x, y, r);
    ctx.restore();
  }
}

/**
 * Tüm HÜCRELER (oyuncu + botlar, çok parçalı gövdeler dahil) —
 * z-sıra: KÜÇÜK → BÜYÜK (birebir clone), isimler her hücrede ortalanır.
 * fx: gulp boost köprüsü (11e, gövde id'siyle).
 * TEMAS: her hücre için en derin komşu örtüşmeyi bulur → ezilme ekseni +
 * heyecan (render-only; mantık/state'e dokunulmaz).
 */
export function drawCells(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  bots: readonly BotState[],
  timeSec: number,
  world: WorldBounds,
  zoom: number,
  fx?: DevourFx,
): void {
  const entries: CellView[] = [];
  for (const cell of player.cells) {
    entries.push({ cell, pal: PLAYER_PALETTE, name: player.name, skin: player.skin, ownerId: player.id, effect: player.effects.aura });
  }
  bots.forEach((b, i) => {
    const pal = skinPalette(b.skin) ?? botPaletteAt(i);
    for (const cell of b.cells) {
      entries.push({ cell, pal, name: b.name, skin: b.skin, ownerId: b.id, effect: 'none' });
    }
  });
  entries.sort((a, b) => a.cell.radius - b.cell.radius); // küçük → büyük

  const c = visualTheme.contact;
  for (let i = 0; i < entries.length; i++) {
    const A = entries[i].cell;
    let best = 0;
    let bestAng = NaN;
    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const B = entries[j].cell;
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const sum = A.radius + B.radius;
      const dist = Math.hypot(dx, dy);
      if (dist < sum && dist > 0.001) {
        const ov = 1 - dist / sum;
        if (ov > best) {
          best = ov;
          bestAng = Math.atan2(dy, dx);
        }
      }
    }
    drawCell(
      ctx,
      entries[i],
      world,
      timeSec,
      zoom,
      fx,
      bestAng,
      best * A.radius * c.dentRatio,
      best,
    );
  }
}
