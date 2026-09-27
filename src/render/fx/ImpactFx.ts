/**
 * render/fx/ImpactFx.ts — İMZA EFEKTLERİ (BÖLÜNME / YUTMA) için garantili sahne.
 *
 * Neden ayrı bir sistem? Parçacık havuzu (ParticlePool) oyunun ORTAK kaynağı:
 * yem POOF'ları, bot patlamaları, izler, alev kuyrukları hep oradan beslenir ve
 * `fxBudgetPerStep` ile kısılır. Büyük bir oyuncu durduğunda çevresindeki yem
 * fırtınası havuzu 240'a doldurur — ve satın alınmış bir imza efekti
 * (Şok Dalgası 600 coin) o karede sessizce EZİLİR. Ölçüldü: yutma anında havuz
 * doymuşken spark/glow sayacı 0'a düşüyor, efekt hiç görünmüyordu.
 *
 * Buradaki efektler:
 * - Sabit küçük kapasite (16 slot) → havuzla ASLA yarışmaz.
 * - Kalın halka havuzun `ringWidth`'ından BAĞIMSIZ çizilir: gümbürtü okunur,
 *   ince halka ise "opsiyonel efekt" gibi durur.
 * - Kademeler gecikmeli doğar (havuzla aynı dil: üst üste binen halka tek halka
 *   gibi okunur).
 * - Slotlar constructor'da BİR KEZ üretilir → sıfır GC.
 *
 * KIRINTI/KÖZ detayları havuzda kalır: onlar ortam dokusudur, sıkışınca
 * ezilmeleri doğru davranıştır. Buradaki katman yalnız efektin OKUNABİLİR
 * kalmasını garanti eder.
 */
import { visualTheme } from '../../theme/visualTheme';

/** Efekt türü — tema bloklarına bağlanır. */
export type ImpactKind = 'sonic' | 'shock';

interface Impact {
  active: boolean;
  kind: ImpactKind;
  /** cizgilerin baslangic acisi (0..TAU) — tekrar eden patlamalar ayni
   *  aciyi kullanirsa "kopyalanmis" durur */
  phase: number;
  x: number;
  y: number;
  /** hedef yarıçap (dünya px) — gövde/kurban ölçeğinden türetilir */
  radius: number;
  life: number;
  /** başlama ömrü (kademe zamanlaması buradan okunur) */
  total: number;
  /** gecikme: süre dolana dek hiç çizilmez */
  delay: number;
  /** çekirdek flaş yarıçapı (dünya px) */
  coreSize: number;
}

const CAPACITY = 16;
const TAU = Math.PI * 2;

/** Kademe başına ekran-sabit kalınlık (px) — imzaya göre. */
const RING_WIDTH = { sonicInner: 3, sonicOuter: 7, shock: 4.5 };

/**
 * İki temanın ortak alanlarına NORMALİZE edilmiş hali. Neden: `sonic` ve
 * `shockwave` blokları farklı anahtar adları taşıyor (kendi dilinde); tek bir
 * `ImpactStyle` üzerinden okumak hem tip birliğini hem de kare başına stilleri
 * yeniden hesaplamayı (tahsis) ortadan kaldırır. `visualTheme` çalışma
 * boyunca DEĞİŞMEZ → modül yüklenirken bir kez çözülür.
 */
interface ImpactStyle {
  radiusRatio: number;
  baseRadius: number;
  layers: number;
  layerDelay: number;
  layerSpread: number;
  totalLife: number;
  falloff: number;
  coreLife: number;
  coreAlpha: number;
  coreColor: string;
  ringColors: readonly string[];
  /** çekirdek flaşın gövde yarıçapına göre ek payı */
  coreScale: number;
  /** çekirdek flaş taban yarıçapı (dünya px) */
  coreBase: number;
  /** kademe kalınlıkları (dıştan içe) — ekran px */
  widths: readonly number[];
  /** radyal sarsıntı çizgileri: gövdeden DIŞA doğru uzayan çizgiler */
  lineCount: number;
  lineLife: number;
  /** çizgi kolu uzunluğu = yarıçapın oranı (dışa doğru kısaldıkça hız izi) */
  lineLen: number;
  /** çizgi kalınlığı (ekran px) */
  lineWidth: number;
  lineColor: string;
}

const SONIC_STYLE: ImpactStyle = (() => {
  const s = visualTheme.sonic;
  return {
    radiusRatio: s.radiusRatio,
    baseRadius: s.baseRadius,
    layers: 2,
    layerDelay: s.outerDelay,
    layerSpread: s.outerSpread,
    totalLife: s.outerLife,
    falloff: 1,
    coreLife: s.coreLife,
    coreAlpha: s.coreAlpha,
    coreColor: s.colors.core,
    ringColors: [s.colors.inner, s.colors.outer],
    coreScale: 0.2,
    coreBase: s.coreSize,
    widths: [RING_WIDTH.sonicInner, RING_WIDTH.sonicOuter],
    lineCount: s.lineCount,
    lineLife: s.lineLife,
    lineLen: s.lineLen,
    lineWidth: s.lineWidth,
    lineColor: s.lineColor,
  };
})();

const SHOCK_STYLE: ImpactStyle = (() => {
  const k = visualTheme.shockwave;
  return {
    radiusRatio: k.radiusRatio,
    baseRadius: k.baseRadius,
    layers: k.layers,
    layerDelay: k.layerDelay,
    layerSpread: k.layerSpread,
    totalLife: k.ringLife,
    falloff: k.ringLifeFalloff,
    coreLife: k.coreLife,
    coreAlpha: k.coreAlpha,
    coreColor: k.colors.core,
    ringColors: [k.colors.ringNear, k.colors.ringFar, k.colors.ringFar],
    coreScale: 0.35,
    coreBase: k.coreSize,
    widths: [RING_WIDTH.shock, RING_WIDTH.shock, RING_WIDTH.shock],
    lineCount: k.lineCount,
    lineLife: k.lineLife,
    lineLen: k.lineLen,
    lineWidth: k.lineWidth,
    lineColor: k.lineColor,
  };
})();

const styleFor = (kind: ImpactKind): ImpactStyle => (kind === 'sonic' ? SONIC_STYLE : SHOCK_STYLE);

export class ImpactFx {
  private readonly items: Impact[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < CAPACITY; i++) {
      this.items.push({
        active: false,
        kind: 'sonic',
        phase: 0,
        x: 0,
        y: 0,
        radius: 0,
        life: 0,
        total: 1,
        delay: 0,
        coreSize: 0,
      });
    }
  }

  /** Sahneye yeni imza efekti basar. `bodyRadius` gövde/kurban yarıçapıdır. */
  spawn(kind: ImpactKind, x: number, y: number, bodyRadius: number): void {
    const s = styleFor(kind);
    const p = this.take();
    p.active = true;
    p.kind = kind;
    p.phase = Math.random() * Math.PI * 2;
    p.x = x;
    p.y = y;
    p.radius = bodyRadius * s.radiusRatio + s.baseRadius;
    p.total = s.totalLife;
    p.life = p.total;
    p.delay = 0;
    p.coreSize = s.coreBase + bodyRadius * s.coreScale;
  }

  /** Boş slot önceliği (ParticlePool.take ile aynı ders). */
  private take(): Impact {
    for (let i = 0; i < CAPACITY; i++) {
      const idx = (this.cursor + i) % CAPACITY;
      if (!this.items[idx].active) {
        this.cursor = (idx + 1) % CAPACITY;
        return this.items[idx];
      }
    }
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % CAPACITY;
    return p;
  }

  update(dt: number): void {
    for (const p of this.items) {
      if (!p.active) continue;
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) continue;
        p.delay = 0;
      }
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D, zoom: number): void {
    const t = visualTheme;
    ctx.save();
    for (const p of this.items) {
      if (!p.active || p.delay > 0) continue;
      const s = styleFor(p.kind);
      const since = p.total - p.life; // geçen süre

      // --- kademeli halkalar ---
      for (let i = 0; i < s.layers; i++) {
        if (since < i * s.layerDelay) continue; // kademe sırası gelmedi
        const lt = Math.min(1, (since - i * s.layerDelay) / (p.total * Math.pow(s.falloff, i)));
        if (lt >= 1) continue;
        const r = p.radius * Math.pow(s.layerSpread, i) * t.animation.easeOutCubic(lt);
        if (r < 1) continue;
        const fade = 1 - lt;
        ctx.globalAlpha = Math.pow(fade, 1.4);
        ctx.strokeStyle = s.ringColors[i] ?? s.ringColors[0];
        // Ekran-sabit kalınlık: dünya px'e çevrilir (yakınlaşınca incelmesin)
        ctx.lineWidth = Math.max(1, ((s.widths[i] ?? s.widths[0]) * (0.35 + fade * 0.65)) / zoom);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // --- radyal sarsıntı çizgileri (gövdeden dışa uzayan çizgi) ---
      // Havuzdaki `spark` nokta-merkezli "+" çiziyordu ve yem alanının renk
      // gürültüsüne karışıyordu; burada gerçek bir çizgi olarak okunur.
      if (s.lineCount > 0) {
        const lt = since / s.lineLife;
        if (lt < 1) {
          const travel = t.animation.easeOutCubic(Math.min(1, lt));
          const outer = p.radius * travel;
          const arm = p.radius * s.lineLen * (1 - lt);
          const inner = Math.max(0, outer - arm);
          if (outer - inner > 2) {
            const fade = 1 - lt;
            ctx.globalAlpha = Math.pow(fade, 1.2);
            ctx.strokeStyle = s.lineColor;
            ctx.lineWidth = Math.max(1, (s.lineWidth * (0.45 + fade * 0.55)) / zoom);
            ctx.beginPath();
            const step = TAU / s.lineCount;
            for (let i = 0; i < s.lineCount; i++) {
              const a = p.phase + i * step;
              const ca = Math.cos(a);
              const sa = Math.sin(a);
              ctx.moveTo(p.x + ca * inner, p.y + sa * inner);
              ctx.lineTo(p.x + ca * outer, p.y + sa * outer);
            }
            ctx.stroke();
          }
        }
      }

      // --- çekirdek flaş: kendi (kısa) ömrüyle söner ---
      const ct = since / s.coreLife;
      if (ct < 1) {
        ctx.globalAlpha = t.animation.easeOutCubic(1 - ct) * s.coreAlpha;
        ctx.fillStyle = s.coreColor;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.coreSize * (0.6 + ct * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Teşhis/test: canlı imza efekti sayısı. */
  get alive(): number {
    let n = 0;
    for (const p of this.items) if (p.active) n++;
    return n;
  }

  /** Test köprüsü: katmanı boşalt (sahne izolasyonu). */
  reset(): void {
    for (const p of this.items) p.active = false;
  }
}
