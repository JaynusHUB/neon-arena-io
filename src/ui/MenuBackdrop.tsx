/**
 * ui/MenuBackdrop.tsx — Giriş menüsü canlı arka planı (interaction-design).
 *
 * Kayan neon ızgara + süzülen yarı-saydam blob'lar (tema paletinden):
 * "arena gecesi" hissi; menüye derinlik verir, oyunun arkasındaki donuk
 * dünyayı gizler. Tek canvas, transform/opacity-only animasyon (60fps),
 * unmount'ta rAF durur. prefers-reduced-motion → tek statik kare.
 * Renk/hız/sayı: theme.entryMenu.backdrop (hardcoded yok).
 */
import { useEffect, useRef } from 'react';
import { visualTheme } from '../theme/visualTheme';

const b = visualTheme.entryMenu.backdrop;
const DOTS = [
  visualTheme.color.playerFill,
  ...visualTheme.color.botPalette,
  visualTheme.xp.textColor,
];

interface Dot {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  c: string;
  a: number;
}

export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dots: Dot[] = [];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const seed = () => {
      dots = [];
      for (let i = 0; i < b.dotCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = b.dotSpeed * (0.4 + Math.random() * 0.8);
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 6 + Math.random() * (b.dotMaxR - 6),
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          c: DOTS[i % DOTS.length],
          a: 0.15 + Math.random() * (b.dotAlpha - 0.15),
        });
      }
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    let off = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) off = (off + b.gridSpeed * dt) % b.gridStep;

      // Zemin
      ctx.fillStyle = b.bg;
      ctx.fillRect(0, 0, w, h);

      // Kayan ızgara (çapraz süzülme)
      ctx.strokeStyle = b.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -b.gridStep + off; x < w + b.gridStep; x += b.gridStep) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + h * 0.25, h);
      }
      for (let y = -b.gridStep + off; y < h + b.gridStep; y += b.gridStep) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + w * 0.1);
      }
      ctx.stroke();

      // Süzülen blob'lar
      for (const d of dots) {
        if (!reduced) {
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          if (d.x < -d.r) d.x = w + d.r;
          if (d.x > w + d.r) d.x = -d.r;
          if (d.y < -d.r) d.y = h + d.r;
          if (d.y > h + d.r) d.y = -d.r;
        }
        ctx.globalAlpha = d.a;
        ctx.fillStyle = d.c;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!reduced) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="entry-bg" aria-hidden="true" />;
}
