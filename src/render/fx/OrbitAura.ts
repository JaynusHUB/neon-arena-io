/**
 * render/fx/OrbitAura.ts — AURA efekti (fx-orbiters): gezegen yörüngesi.
 *
 * Neden parçacık HAVUZU DEĞİL: aura SÜREKLİ açıktır (hücre durmasa bile
 * döner). Havuzdan sürekli üretim yapılsaydı 240 slot yutma/ölüm geri
 * bildirimini (POOF, şok dalgası, XP metni) boğardı. Bu yüzden saf çizim:
 * kalıcı bir nesne yok, sadece kare başına birkaç path.
 *
 * Görsel dil: her gövde kendi ELİPSİNDE (düz ortak daire değil), kendi
 * hızında — biri ters yönde — döner. Derinlik + hareket okunur.
 * Hareket KUYRUĞU, gövde halesi ve nabız yalnızca yeterince büyük hücrelerde
 * çizilir (LOD): 16 parçalı gövdede maliyet patlamasın.
 */
import { visualTheme } from '../../theme/visualTheme';

const TAU = Math.PI * 2;

/** Hareket kuyruğu segment sayısı (azalan alfa → kuyruk sönümlenir). */
const TRAIL_SEGMENTS = 3;
const TRAIL_ALPHA = [0.5, 0.22, 0.08];
/** Kuyruk segment kalınlıkları (ekran px, gövdeden içe doğru incelir). */
const TRAIL_WIDTH = [3.2, 2, 1.2];

/**
 * Yörünge aurasını çizer. `screenR` = hücrenin ekran yarıçapı (LOD kapısı).
 * Çağıran zaten `screenR >= lod.fullPx` dalındadır; burada ikinci eşik var.
 */
export function drawOrbitAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  timeSec: number,
  phase: number,
  screenR: number,
): void {
  const o = visualTheme.orbiters;
  const detail = screenR >= o.detailPx;
  // Rehber çizgi ve kuyruk EKRAN-sabit kalınlıkta: zoom'dan bağımsız okunur
  // (dünya px'lik ince çizgi uzakta kayboluyordu).
  const zoom = radius > 0 ? screenR / radius : 1;
  const baseR = radius * o.radiusRatio;
  const n = Math.min(o.count, o.bodies.length);

  ctx.save();
  for (let i = 0; i < n; i++) {
    const body = o.bodies[i];
    const a = baseR * body.r; // yarı-büyük eksen
    const b = a * o.squash; // yarı-küçük eksen (eziklik)
    const cosT = Math.cos(body.tilt);
    const sinT = Math.sin(body.tilt);
    // Parametrik açı: gövde kendi hız çarpanıyla döner (biri TERS yönde)
    const ang = timeSec * o.speed * body.speed + phase * body.speed + i * 2.1;

    if (detail) {
      // Yörünge rehberi — yörüngenin kendisi görünür olur (nerede döndüğü belli)
      ctx.globalAlpha = o.guideAlpha;
      ctx.strokeStyle = body.color;
      ctx.lineWidth = o.guideWidth / zoom;
      ctx.beginPath();
      ctx.ellipse(x, y, a, b, body.tilt, 0, TAU);
      ctx.stroke();

      // Haremet kuyruğu: gövdenin ARKASINDAki yay, dıştan içe sönümlenir
      for (let s = 0; s < TRAIL_SEGMENTS; s++) {
        const from = ang - (o.trailArc * (s + 1)) / TRAIL_SEGMENTS;
        const to = ang - (o.trailArc * s) / TRAIL_SEGMENTS;
        ctx.globalAlpha = TRAIL_ALPHA[s];
        ctx.lineWidth = (TRAIL_WIDTH[s] ?? TRAIL_WIDTH[0]) / zoom;
        ctx.beginPath();
        ctx.ellipse(x, y, a, b, body.tilt, from, to);
        ctx.stroke();
      }
    }

    // Gövde konumu: elips üzerinde → eğimle döndür
    const lx = Math.cos(ang) * a;
    const ly = Math.sin(ang) * b;
    const px = x + lx * cosT - ly * sinT;
    const py = y + lx * sinT + ly * cosT;

    // Nabız — gövde "soluyor"
    const pulse = 1 + o.pulseAmp * Math.sin(timeSec * o.pulseSpeed + i * 1.7);
    // Boyut hücre ORANINDAN gelir: büyüyen gövdede gezegen de büyür,
    // küçük zoom'da da okunur (sabit dünya px'i 2 ekran px'e düşüyordu).
    const size = radius * body.sizeRatio * pulse;

    if (detail) {
      // Dış hale (yumuşak) + iç hale → derinlik
      ctx.globalAlpha = o.glowAlpha * 0.5;
      ctx.fillStyle = body.color;
      ctx.beginPath();
      ctx.arc(px, py, size * o.glowScale, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = o.glowAlpha;
      ctx.beginPath();
      ctx.arc(px, py, size * 1.5, 0, TAU);
      ctx.fill();
    }

    // Çekirdek
    ctx.globalAlpha = 1;
    ctx.fillStyle = body.color;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
