/**
 * render/DevourFx.ts — ADIM 11e YUTMA JELİ havuzu (ParticlePool deseni).
 *
 * İki efekti tutar, ikisi de SADECE `cell-eaten` olayından kurulur
 * (renderer state DEĞİŞTİRMEZ; renk/animasyon theme'den — hardcoded YASAK):
 *
 * - EMİLİM HAYALETI: yutulan hücre → yutanın merkezine kayarken yutanın
 *   boyuna şişip solar (agar.io Da() paketi birebir: ox/oy/oSize → nx/ny/nSize,
 *   smoothstep 0→1, alpha ×(1−progress)). Çizim: PlayerRenderer.drawGhosts.
 * - GULP: yutan hücrede membran genlik boost + hafif şişme, (1−t)² üstel
 *   sönüm → jel "gulp" sıçraması. Uygulama: drawCell (boostOf).
 *
 * KURALLAR:
 * - Bütün slotlar constructor'da TEK SEFER yaratılır; spawn/update nesne
 *   üretmez → sıfır GC baskısı, havuz ASLA büyümez.
 * - Aynı yutan aynı frame'de tekrar yutarsa gulp slotu TAZELER (istifleme yok).
 */
import { visualTheme } from '../theme/visualTheme';
import type { GameEvent } from '../logic/GameState';

type CellEatenEvent = Extract<GameEvent, { kind: 'cell-eaten' }>;

export interface AbsorbGhost {
  active: boolean;
  /** kaynak: kurban anı (x, y, r) */
  x: number;
  y: number;
  r: number;
  /** hedef: yutan anı (vanilla nx/ny/nSize — hayalet oraya kayar) */
  tx: number;
  ty: number;
  tr: number;
  /** membran fazı (kurban id hash'i — titreme kimliği korur) */
  phase: number;
  name: string;
  skin: string;
  /** -1 = oyuncu; ≥0 = bot palet sırası */
  botIndex: number;
  life: number;
  maxLife: number;
}

interface GulpSlot {
  active: boolean;
  id: string;
  life: number;
  /** yutulan/yutan oranından türeyen güç (theme.gulp min/max aralığında) */
  power: number;
}

export class DevourFx {
  private readonly ghosts: AbsorbGhost[] = [];
  private readonly gulps: GulpSlot[] = [];
  private gCursor = 0;
  private uCursor = 0;

  constructor(
    ghostCap: number = 8,
    gulpCap: number = 16,
  ) {
    for (let i = 0; i < ghostCap; i++) {
      this.ghosts.push({
        active: false,
        x: 0,
        y: 0,
        r: 1,
        tx: 0,
        ty: 0,
        tr: 1,
        phase: 0,
        name: '',
        skin: 'classic',
        botIndex: -1,
        life: 0,
        maxLife: 1,
      });
    }
    for (let i = 0; i < gulpCap; i++) {
      this.gulps.push({ active: false, id: '', life: 0, power: 0 });
    }
  }

  /** canlı hayaletler — renderer sırayla çizer (pool sırası = slot sırası) */
  get ghostList(): readonly AbsorbGhost[] {
    return this.ghosts;
  }

  /** cell-eaten olayından emilim hayaleti kur (respawn ÖNCESİ anlık görüntü). */
  spawnGhost(ev: CellEatenEvent): void {
    const slot = this.ghosts[this.gCursor];
    this.gCursor = (this.gCursor + 1) % this.ghosts.length;
    slot.active = true;
    slot.x = ev.x;
    slot.y = ev.y;
    slot.r = ev.victimR;
    slot.tx = ev.eaterX;
    slot.ty = ev.eaterY;
    slot.tr = ev.eaterR * visualTheme.absorb.targetRatio;
    slot.phase = visualTheme.cellWobble.phase(ev.victimId);
    slot.name = ev.victimName;
    slot.skin = ev.victimSkin;
    slot.botIndex = ev.victimBotIndex;
    slot.maxLife = visualTheme.absorb.life;
    slot.life = slot.maxLife;
  }

  /** yutana gulp — aynı yutan tekrar yutarsa mevcut slot tazelenir.
   *  Güç, yutulan/yutan yarıçap oranından gelir: denk lokma = büyük tepki. */
  spawnGulp(id: string, victimR: number, eaterR: number): void {
    let slot: GulpSlot | null = null;
    for (const s of this.gulps) {
      if (s.active && s.id === id) {
        slot = s;
        break;
      }
    }
    if (!slot) {
      slot = this.gulps[this.uCursor];
      this.uCursor = (this.uCursor + 1) % this.gulps.length;
    }
    const g = visualTheme.gulp;
    const ratio = eaterR > 0 ? victimR / eaterR : 0;
    slot.active = true;
    slot.id = id;
    slot.life = g.life;
    slot.power = Math.min(g.maxPower, Math.max(g.minPower, ratio * g.sizeGain));
  }

  /** yutan için anlık boost — güç × (1−t)² ease-out sönüm (yoksa 0). */
  boostOf(id: string): number {
    const g = visualTheme.gulp;
    for (const s of this.gulps) {
      if (s.active && s.id === id) {
        const k = Math.max(0, s.life) / g.life;
        return s.power * k * k;
      }
    }
    return 0;
  }

  /** her adımda bir kez — hayalet/gulp ömürlerini düşürür. */
  update(dt: number): void {
    for (const g of this.ghosts) {
      if (!g.active) continue;
      g.life -= dt;
      if (g.life <= 0) {
        g.active = false;
        g.life = 0;
      }
    }
    for (const s of this.gulps) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        s.id = ''; // string referansını bırak (eski yutan için boost kalmasın)
        s.life = 0;
        s.power = 0;
      }
    }
  }
}
