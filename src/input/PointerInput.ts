/**
 * input/PointerInput.ts — Fare + dokunmatik girdi (referans canvas.js gameInput).
 * Sadece girdi toplar, oyun state'ine dokunmaz.
 *
 * REFERANS MODEL: hedef = imleç − ekran MERKEZİ (offset). Dünya hedefi her
 * adımda HÜCRE konumuna eklenir → kamera gecikmesi aim'i BOZMAZ; oyuncu
 * farenin ekran yönüne pürüzsüz kayar (kamera konumundan bağımsız).
 */
import type { Vec2 } from '../logic/types';
import type { Camera } from '../render/Camera';

export class PointerInput {
  /** Ekran koordinatında imleç (CSS px) */
  screenX = 0;
  screenY = 0;
  active = false;
  /** girdi açık mı — skin menüsü gibi overlay'ler açıkken kapatılır
   *  (göz atarken hücre sürüklenmesin); worldTarget bu bayrağa bakar */
  enabled = true;

  private readonly onPointerMove = (e: PointerEvent): void => {
    this.screenX = e.clientX;
    this.screenY = e.clientY;
    this.active = true;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.screenX = e.clientX;
    this.screenY = e.clientY;
    this.active = true;
  };

  attach(): void {
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
  }

  detach(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
  }

  /** Dünya hedefi = hücre + (imleç − ekran merkezi) / zoom.
   *  Hiç girdi yoksa null (oyuncu olduğu gibi durur). */
  worldTarget(
    player: { x: number; y: number },
    cam: Camera,
    viewW: number,
    viewH: number,
  ): Vec2 | null {
    if (!this.enabled || !this.active) return null;
    return {
      x: player.x + (this.screenX - viewW / 2) / cam.zoom,
      y: player.y + (this.screenY - viewH / 2) / cam.zoom,
    };
  }
}
