/**
 * render/BackgroundRenderer.ts — Zemin + agar.io kenar modeli (BEYAZ ZEMİN).
 * DÜNYA uzayında çizilir (Game kamera translate/scale'ini uygulamış olur).
 * Zoom'da görünür dünya bölgesi = viewW / cam.zoom kadar büyür.
 *
 * Karar (birebir agar.io):
 * 1) Zemin + sınırın DIŞI = saf BEYAZ (ızgarasız),
 * 2) İçeride soluk gri ızgara (#e0e0e0 — theme.color.grid),
 * 3) Sınır = İNCE NET SİYAH çizgi (theme.color.worldEdge).
 * Renk/ölçü tek kaynaktan: theme/visualTheme.ts (hardcoded hex YASAK).
 */
import { visualTheme } from '../theme/visualTheme';
import type { WorldBounds } from '../logic/types';
import type { Camera } from './Camera';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  world: WorldBounds,
  viewW: number,
  viewH: number,
): void {
  const t = visualTheme;
  const zoom = cam.zoom;

  // Zoom sonrası görünen dünya bölgesi
  const left = cam.x - viewW / (2 * zoom);
  const top = cam.y - viewH / (2 * zoom);
  const visW = viewW / zoom;
  const visH = viewH / zoom;

  // Ekranın TAMAMI = sınır dışı dahil saf beyaz (ızgarasız)
  ctx.fillStyle = t.color.worldVoid;
  ctx.fillRect(left, top, visW, visH);

  // Dünya ∩ görünür alan = zemin (beyaz) + ızgara (sadece dünya içinde)
  const x0 = Math.max(left, 0);
  const y0 = Math.max(top, 0);
  const x1 = Math.min(left + visW, world.width);
  const y1 = Math.min(top + visH, world.height);
  const inside = x0 < x1 && y0 < y1;
  if (inside) {
    ctx.fillStyle = t.color.background;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

    // Izgara — sadece dünya sınırları içinde, dünya sabit
    const step = t.size.gridStep;
    const startX = Math.floor(left / step) * step;
    const startY = Math.floor(top / step) * step;

    ctx.lineWidth = 1 / zoom; // ekranda sabit incelik

    for (let gx = startX; gx < left + visW + step; gx += step) {
      if (gx < 0 || gx > world.width) continue;
      const isMajor = Math.round(gx / step) % 5 === 0;
      ctx.strokeStyle = isMajor ? t.color.gridMajor : t.color.grid;
      ctx.beginPath();
      ctx.moveTo(gx, Math.max(top, 0));
      ctx.lineTo(gx, Math.min(top + visH, world.height));
      ctx.stroke();
    }

    for (let gy = startY; gy < top + visH + step; gy += step) {
      if (gy < 0 || gy > world.height) continue;
      const isMajor = Math.round(gy / step) % 5 === 0;
      ctx.strokeStyle = isMajor ? t.color.gridMajor : t.color.grid;
      ctx.beginPath();
      ctx.moveTo(Math.max(left, 0), gy);
      ctx.lineTo(Math.min(left + visW, world.width), gy);
      ctx.stroke();
    }
  }

  // Sınır — İNCE NET siyah çizgi (agar.io birebir; bulanık glow YOK)
  ctx.strokeStyle = t.color.worldEdge;
  ctx.lineWidth = t.size.worldEdgeWidth / zoom;
  ctx.strokeRect(0, 0, world.width, world.height);
}
