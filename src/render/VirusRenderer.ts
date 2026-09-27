/**
 * render/VirusRenderer.ts — Virüsler (yeşil dikenli daireler).
 * State okur, değiştirmez. Renk/boyut/animasyon: theme.game.virus.
 *
 * Dil: dönen dikenli kontur (triangular dalga) + düz yeşil dolgu + koyu
 * kenar. Hücrelerden SONRA çizilir → küçük hücre virüsün altına saklanır
 * (agar.io birebir: saklanan hücre görünmez).
 */
import { visualTheme, shadeColor } from '../theme/visualTheme';
import type { VirusState } from '../logic/Virus';

export function drawViruses(
  ctx: CanvasRenderingContext2D,
  viruses: readonly VirusState[],
  timeSec: number,
): void {
  const v = visualTheme.game.virus;
  const rot = timeSec * v.spin;
  const stroke = v.stroke || shadeColor(v.fill, 0.25);

  for (const virus of viruses) {
    const R = virus.radius;
    const n = v.points;
    ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      // Üçgen dalga: keskin diken profili (sinüs değil — agar.io virüsü sivri)
      const tri = (Math.asin(Math.sin(v.spikes * a + rot)) * 2) / Math.PI;
      const rr = R * (1 + v.spikeAmp * tri);
      const px = virus.x + Math.cos(a) * rr;
      const py = virus.y + Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = v.fill;
    ctx.fill();
    ctx.lineWidth = Math.max(2, R * v.ringWidthRatio);
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}
