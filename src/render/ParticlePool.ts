/**
 * render/ParticlePool.ts — Önceden ayrılmış parçacık havuzu (object pool).
 *
 * KURALLAR:
 * - Bütün slotlar constructor'da TEK SEFER yaratılır.
 * - burst()/ring() çalışma sırasında HİÇ nesne üretmez; ölü slotları
 *   ring cursor ile geri kullanır → sıfır GC baskısı, havuz ASLA büyümez.
 * - Renkler theme referansıdır (kopya string yok).
 */
import { visualTheme } from '../theme/visualTheme';

/** Çizilen parçacık türleri. */
export type ParticleKind = 'dot' | 'ring' | 'spark' | 'glyph' | 'glow';

interface Particle {
  active: boolean;
  /** glow: yumuşak hale (galaktik iz çekirdeğinin çevresi) */
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  /** BAŞLAMAMA GECİKMESİ (sn): > 0 iken parçacık ne hareket eder ne çizilir.
   *  Kademeli/koreografli efektlerin (şok dalgası katmanları, sonic çift halka,
   *  namlu flaşı→iz zinciri) aynı karede üst üste binmek yerine SIRAYA
   *  binmesini sağlar — gecikmesiz çok halka "tek kalın halka" gibi okunur. */
  delay: number;
  /** dot: yarıçap, ring: hedef yarıçap, spark: kol uzunluğu, glyph: font px,
   *  glow: hale yarıçapı */
  size: number;
  color: string; // theme rengine referans
  /** glow taban alfası (çift katman halo için) */
  alpha: number;
  /** glyph: çizilen rün karakteri (sabit referans, alloc yok) */
  text: string;
  /** glyph dönüş açısı + hızı (rad, rad/sn) */
  rot: number;
  vr: number;
}

export class ParticlePool {
  private readonly items: Particle[] = [];
  private cursor = 0;

  constructor(private readonly capacity: number = visualTheme.particles.maxAlive) {
    for (let i = 0; i < this.capacity; i++) {
      this.items.push({
        active: false,
        kind: 'dot',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        delay: 0,
        size: 1,
        color: visualTheme.color.transparent,
        alpha: 1,
        text: '',
        rot: 0,
        vr: 0,
      });
    }
  }

  get alive(): number {
    let n = 0;
    for (const p of this.items) if (p.active) n++;
    return n;
  }

  get cap(): number {
    return this.capacity;
  }

  /** Teşhis: tür bazında canlı sayı (hangi efekt havuzu dolduruyor?).
   *  main-loop DIŞINDA çağrılır (test/hata ayıklama köprüsü). */
  countsByKind(): Record<string, number> {
    const out: Record<string, number> = { dot: 0, ring: 0, spark: 0, glyph: 0, glow: 0 };
    for (const p of this.items) if (p.active) out[p.kind] = (out[p.kind] ?? 0) + 1;
    return out;
  }

  /** Test köprüsü: (x,y) merkezli yarıçap içindeki AKTİF parçacık sayısı.
   *  Global `alive` sayacı bot yemlerinden gürültülüdür; ölüm patlaması gibi
   *  yerel olaylar BU sayıyla kanıtlanır (sahne deterministik kalır). */
  countNear(x: number, y: number, radius: number): number {
    const r2 = radius * radius;
    let n = 0;
    for (const p of this.items) {
      if (!p.active) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= r2) n++;
    }
    return n;
  }

  /** Test köprüsü: yarıçap içindeki parçacıkları SÖNDÜR → sahne temiz başlar
   *  (ör. botun köşedeki saçılmış yemleri yiyip bırakmış olabileceği POOF'lar). */
  clearNear(x: number, y: number, radius: number): number {
    const r2 = radius * radius;
    let n = 0;
    for (const p of this.items) {
      if (!p.active) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= r2) {
        p.active = false;
        n++;
      }
    }
    return n;
  }

  /** POOF patlaması — renk/şiddet/ömür caller'dan theme ile gelir. */
  burst(x: number, y: number, color: string, count: number, speed: number, life: number, size: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      const angle = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.active = true;
      p.kind = 'dot';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * s;
      p.vy = Math.sin(angle) * s;
      p.life = life * (0.7 + Math.random() * 0.3);
      p.maxLife = p.life;
      p.size = size * (0.7 + Math.random() * 0.6);
      p.color = color;
      p.alpha = 1;
    }
  }

  /**
   * TEK parçacık yazma kapısı — emitter katmanının kullandığı en genel yol.
   * Gecikme + açık hız (dx/dy) destekler; yukarıdaki burst/ring/spark/glow
   * metotları bunun konu varyantlarıdır ve korunur.
   *
   * Parçacık BAŞINA hiçbir nesne üretilmez (saf ilkel yazım) → havuzun
   * sıfır-GC sözü bozulmaz.
   */
  spawn(
    kind: ParticleKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    life: number,
    delay = 0,
    alpha = 1,
  ): void {
    const p = this.take();
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.color = color;
    p.size = size;
    p.life = life;
    p.maxLife = life;
    p.delay = delay;
    p.alpha = alpha;
  }

  /** Işık halkası (toplama flash'ı) — genişleyerek söner. */
  ring(x: number, y: number, color: string, radius: number, life: number): void {
    const p = this.take();
    p.active = true;
    p.kind = 'ring';
    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.life = life;
    p.maxLife = life;
    p.size = radius;
    p.color = color;
    p.alpha = 1;
  }

  /** Yumuşak hale (premium iz çekirdeği) — iki koncentric katman, GRADYAN
   *  TAHSSİSİ YOK (her karede createRadialGradient = GC baskısı; oyun 240
   *  slotlu havuzda buna izin vermez). Katmanlar dıştan içe doğru sönümlenir. */
  glow(
    x: number,
    y: number,
    color: string,
    size: number,
    life: number,
    alpha: number,
    vx = 0,
    vy = 0,
  ): void {
    const p = this.take();
    p.active = true;
    p.kind = 'glow';
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.color = color;
    p.alpha = alpha;
  }

  /** Rün glifi (tematik iz) — dönen antik sembol, solarak söner.
   *  angleBase verilirse hız o yöne Sapmalı (spread radyan) dağılır,
   *  verilmezse tam rastgele (varsayılan). */
  glyph(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    life: number,
    size: number,
    spin: number,
    chars: readonly string[],
    angleBase = NaN,
    angleSpread = Math.PI * 2,
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      const dir = Number.isNaN(angleBase)
        ? Math.random() * Math.PI * 2
        : angleBase + (Math.random() - 0.5) * angleSpread;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.active = true;
      p.kind = 'glyph';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(dir) * s;
      p.vy = Math.sin(dir) * s;
      p.life = life * (0.7 + Math.random() * 0.3);
      p.maxLife = p.life;
      p.size = size * (0.8 + Math.random() * 0.4);
      p.color = color;
      p.text = chars[(Math.random() * chars.length) | 0] ?? '';
      p.rot = Math.random() * Math.PI * 2;
      p.vr = spin * (0.5 + Math.random());
      p.alpha = 1;
    }
  }

  /** Kıvılcım (yıldız izi) — artı işareti çizilir, küçülerek söner. */
  spark(x: number, y: number, color: string, count: number, speed: number, life: number, size: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.take();
      const angle = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      p.active = true;
      p.kind = 'spark';
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * s;
      p.vy = Math.sin(angle) * s;
      p.life = life * (0.7 + Math.random() * 0.3);
      p.maxLife = p.life;
      p.size = size * (0.7 + Math.random() * 0.6);
      p.color = color;
    }
  }

  /** Slot tahsisi — ÖNCE BOŞ slot (havuz açlığı / starvation olmasın).
   *
   *  Neden önemli: imleç yalnızca ilerletilir ve hedefteki AKTİF slot üzerine
   *  yazılırdı. Üretim ölümden hızlıysa (ör. bir saçılma halkasından 45 yem tek
   *  adımda çözülür) imleç havuzu birkaç karede tam tur yapıyor, her slotun
   *  ömrü tazeleniyor ve HİÇBİR parçacık ölmüyordu → havuz kalıcı 240'a
   *  kilitlenir; yutma/ölüm/level-up geri bildirimleri de boğulur.
   *
   *  Tarama sınırlıdır (maxScan): boş bulunamazsa imleçteki slot geri
   *  dönüştürülür (kapak sabit) → amorti maliyet O(1) kalır.
   */
  private take(): Particle {
    const n = this.capacity;
    const maxScan = n < 40 ? n : 40;
    for (let i = 0; i < maxScan; i++) {
      const idx = (this.cursor + i) % n;
      if (!this.items[idx].active) {
        this.cursor = (idx + 1) % n;
        // Geri kullanılan slotun ESKİ gecikmesi sıfırlanır (aksi halde yeni
        // parçacık görünmez başlar). Çağıran delay'ı bilerek yazabilir.
        this.items[idx].delay = 0;
        return this.items[idx];
      }
    }
    const p = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % n;
    p.delay = 0;
    return p;
  }

  update(dt: number): void {
    const damp = Math.exp(-visualTheme.particles.friction * dt);
    for (const p of this.items) {
      if (!p.active) continue;
      // Gecikme: süre dolana dek parçacık DÜNYADA değil — ömrü işlemez,
      // hareket etmez, çizilmez. Süre bitince tam güçle başlar.
      if (p.delay > 0) {
        p.delay -= dt;
        if (p.delay > 0) continue;
        p.delay = 0;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.kind === 'dot' || p.kind === 'spark' || p.kind === 'glyph' || p.kind === 'glow') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= damp;
        p.vy *= damp;
        if (p.kind === 'glyph') p.rot += p.vr * dt;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, zoom = 1): void {
    const t = visualTheme;
    ctx.save();
    for (const p of this.items) {
      if (!p.active) continue;
      if (p.delay > 0) continue; // henüz sırası gelmedi
      const t01 = 1 - p.life / p.maxLife; // 0 → 1
      // Yumuşak çıkış: temasta kalıp sonunda söner (ease-out sönüm)
      ctx.globalAlpha = t.animation.easeOutCubic(1 - t01 * t01 * t01);
      ctx.fillStyle = p.color;
      if (p.kind === 'dot') {
        const r = Math.max(0.3, p.size * (1 - t01 * 0.5));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        // Kıvılcım: eksen-kilitli artı işareti (transform YOK — ucuz)
        const r = Math.max(0.5, p.size * (1 - t01));
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, r * 0.35);
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y);
        ctx.lineTo(p.x + r, p.y);
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x, p.y + r);
        ctx.stroke();
      } else if (p.kind === 'glyph') {
        // Rün glifi: dönen antik sembol (sayısı az — save/translate serbest)
        if (p.text) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.font = `${Math.max(6, p.size).toFixed(1)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.text, 0, 0);
          ctx.restore();
        }
      } else if (p.kind === 'glow') {
        // Yumuşak hale: dış katman (geniş, çok düşük alfa) + iç katman.
        // Yarıçap doğumda küçük, ömür ilerledikçe büyür → yumuşak açılma.
        const grow = 0.5 + t01 * 0.5;
        const r = Math.max(0.5, p.size * grow);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * (1 - t01) * 0.45;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = p.alpha * (1 - t01) * 0.3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const r = Math.max(1, p.size * t.animation.easeOutCubic(t01));
        ctx.strokeStyle = p.color;
        // Halka çizgisi ekran-sabit (~3px): uzak zoom'da da okunur (dünya sınırı dili)
        ctx.lineWidth = Math.max(0.5, (t.particles.ringWidth * (1 - t01)) / zoom);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
