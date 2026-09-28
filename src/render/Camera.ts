/**
 * render/Camera.ts — Oyuncuyu takip eden yumuşak kamera + dinamik zoom.
 * Sadece state okur; state'i değiştirmez.
 */
import { visualTheme } from '../theme/visualTheme';

export interface Camera {
  x: number;
  y: number;
  /** 1 = native ölçek, <1 = uzaklaşma (oyuncu büyüdükçe düşer) */
  zoom: number;
}

export function createCamera(x: number, y: number): Camera {
  return { x, y, zoom: 1 };
}

/** Kamerayı hedefe (oyuncuya) doğru yumuşakça kaydırır — ASLA direkt set:
 *  camera += (hedef - camera) × k, k 60fps'de = cameraFrameDamping (0.1).
 *  k = 1 - (1 - d)^(60·dt) → framerate'den bağımsız eşdeğer yumuşaklık. */
export function followCamera(cam: Camera, targetX: number, targetY: number, dt: number): void {
  const d = visualTheme.animation.cameraFrameDamping; // 60fps'de kare başına damping
  const k = 1 - Math.pow(1 - d, Math.max(dt, 0) * 60);
  cam.x += (targetX - cam.x) * k;
  cam.y += (targetY - cam.y) * k;
}

/**
 * Oyuncu boyutuna göre zoom: radius'a DOĞRUDAN orantılı değil, sönümlü eğri.
 *   zoom = clamp(baseZoom × (baseRadius / radius)^zoomDamping, minZoom, maxZoom)
 *
 * exponent 0.4 < 1 → büyüdükçe yumuşak uzaklaşma (radius'la çizgisel değil):
 * küçükken ekran kaplamaz, çok büyüyünce anlamsızca uzaklaşıp harita görüşü
 * kaybolmaz. radius ease ile yumuşatıldığı için bu hesap da frame frame
 * yumuşaktır. (DPR/ tarayıcı zoom telafisi game/Game.ts'te bu değere çarpılır.)
 */
export function updateCameraZoom(cam: Camera, radius: number): void {
  const c = visualTheme.camera;
  const baseR = visualTheme.size.playerBaseRadius;
  const desired = c.baseZoom * Math.pow(baseR / Math.max(radius, 1), c.zoomDamping);
  cam.zoom = Math.min(c.maxZoom, Math.max(c.minZoom, desired));
}
