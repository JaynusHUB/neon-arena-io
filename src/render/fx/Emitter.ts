/**
 * render/fx/Emitter.ts — tsParticles tarzı DEKLARATİF emisyon katmanı.
 *
 * Neden bu katman: efektler "hangi parçacık, ne kadar, hangi yöne" diye
 * SAYI YAZARAK`new` çağırmak yerine bir SİMGE (spec) tanımlar. Spec bir
 * patlamada BİR KEZ üretilir (partikül başına değil) → havuzun sıfır-GC sözü
 * bozulmaz, ama efekt tanımı okunur/ayarlanır olur.
 *
 * tsParts'den alınan ilkeler:
 * - Emitter her zaman TEK yerde (oyun döngüsü) yaşar; parçacık yaşam döngüsü
 *   havuzun sorumluluğundadır (ayrı update/render döngüsü YOK).
 * - Yön/yay/hız/ömür/boyut deklaratif aralıklardır.
 * - "even" dağılım: radyal şoklarda AÇILI DAĞILIM (rastgele değil) — rastgele
 *   açı kümelenip düzensiz görünür, eşit açı gerçek patlama gibi okunur.
 *
 * Tüm renk/boyut değerleri visualTheme'den gelir; burada hex YAZILMAZ.
 */
import type { ParticlePool } from '../ParticlePool';

const TAU = Math.PI * 2;

/** [min, max] aralığı. */
type Range = readonly [number, number];

const lerp = (r: Range, t: number): number => r[0] + (r[1] - r[0]) * t;

/**
 * Patlama/emisyon tanımı. `angle: null` → tam çevre (radyal).
 * `even: true` → açılar eşit dağıtılır (şok/kırıntı), `false` → rastgele
 * (alev/kıvılcım kaotik dağılır).
 */
export interface BurstSpec {
  kind: 'dot' | 'spark' | 'glow';
  amount: number;
  /** merkez açı (rad) — null ise 360° */
  angle: number | null;
  /** yay genişliği (rad) */
  spread: number;
  speed: Range;
  life: Range;
  size: Range;
  color: string;
  alpha: number;
  /** ortak gecikme + rastgele sapma (sn) — kademeli çiçeklenme için */
  delay: number;
  delayJitter: Range;
  even: boolean;
  /** DOĞUM NOKTASI saçılımı (px) — her parçacık merkezi ±jitter/2 içinde
   *  doğar. Alev/kıvılcım izi için: tek noktadan doğan parçacıklar DÜZ ÇİZGİ
   *  çiziyordu, saçılım alevi organik yapar. */
  jitter: number;
}

/** Tek halka tanımı (kademeli ripple'ın parçası). */
export interface RingSpec {
  x: number;
  y: number;
  color: string;
  radius: number;
  life: number;
  delay: number;
}

/** Aralık: sabit değer de Range olarak verilebilir. */
export const at = (v: number): Range => [v, v];

/**
 * Patlamayı havuza basar — partikül BAŞINA hiçbir nesne üretmez.
 * Spec bozuksa (amount <= 0) sessizce çıkar: efekt yoksa oyun akışı bozulmaz.
 */
export function emitBurst(pool: ParticlePool, x: number, y: number, s: BurstSpec): void {
  if (s.amount <= 0) return;
  for (let i = 0; i < s.amount; i++) {
    let dir: number;
    if (s.angle === null) {
      // 360° radyal: even ise eşit dağılım + küçük sapma, değilse tam rastgele
      dir = s.even
        ? (i / s.amount) * TAU + (Math.random() - 0.5) * (TAU / s.amount) * 0.35
        : Math.random() * TAU;
    } else if (s.even) {
      // Koni içinde eşit dağılım
      dir = s.angle + ((i + Math.random()) / s.amount - 0.5) * s.spread;
    } else {
      dir = s.angle + (Math.random() - 0.5) * s.spread;
    }
    const sp = lerp(s.speed, Math.random());
    const d = s.delay + lerp(s.delayJitter, Math.random());
    // Saçılım yoksa tam merkez (0 üretmek için Math.random çağrısı yapılmaz)
    const jx = s.jitter > 0 ? (Math.random() - 0.5) * s.jitter : 0;
    const jy = s.jitter > 0 ? (Math.random() - 0.5) * s.jitter : 0;
    pool.spawn(
      s.kind,
      x + jx,
      y + jy,
      Math.cos(dir) * sp,
      Math.sin(dir) * sp,
      s.color,
      lerp(s.size, Math.random()),
      lerp(s.life, Math.random()),
      d,
      s.alpha,
    );
  }
}

/** Tek ışık halkası (gecikmeli). */
export function emitRing(pool: ParticlePool, spec: RingSpec): void {
  pool.spawn('ring', spec.x, spec.y, 0, 0, spec.color, spec.radius, spec.life, spec.delay, 1);
}
