/**
 * render/FloatText.ts — Dünya-üstü yüzen metinler (+X XP).
 *
 * Object pool (ParticlePool disiplini): slotlar constructor'da tek sefer,
 * spawn/update nesne üretmez, havuz ASLA büyümez. Metin yükselir + solar
 * (interaction-design: geri bildirim hareketi). Renk theme'den (coin
 * sarısından ayrışan XP moru). State'e dokunmaz.
 */
import { visualTheme } from '../theme/visualTheme';

interface FloatItem {
  active: boolean;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export class FloatTextPool {
  private readonly items: FloatItem[] = [];
  private cursor = 0;

  constructor(private readonly capacity: number = visualTheme.xp.floatCap) {
    for (let i = 0; i < this.capacity; i++) {
      this.items.push({ active: false, x: 0, y: 0, text: '', color: '#ffffff', life: 0, maxLife: 1 });
    }
  }

  /** (x, y) dünya konumunda metin patlat — string referansı taşınır. */
  spawn(x: number, y: number, text: string, color: string): void {
    const t = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    t.active = true;
    t.x = x;
    t.y = y;
    t.text = text;
    t.color = color;
    t.maxLife = visualTheme.xp.floatLife;
    t.life = t.maxLife;
  }

  /** her adımda bir kez — yükselme + ömür. */
  update(dt: number): void {
    const rise = visualTheme.xp.floatRise;
    for (const t of this.items) {
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y -= rise * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const x = visualTheme.xp;
    ctx.save();
    ctx.font = `700 ${x.floatSize}px ${visualTheme.hud.monoFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.items) {
      if (!t.active) continue;
      const k = Math.max(0, t.life) / t.maxLife;
      ctx.globalAlpha = k * k; // ease-out sönüm
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }
}
