/**
 * game/Game.ts — Ana döngü: input → logic step → render.
 * React'ten bağımsız (React sadece HUD için). Test hook'ları burada.
 *
 * Toplama zinciri görsel tarafı: stepState'in bıraktığı food-collected
 * olayından POOF parçacık patlaması + ışık halkası AYNI adımda patlatılır
 * (particle object pool — nesne üretimi yok).
 */
import { visualTheme } from '../theme/visualTheme';
import { createGameState, stepState } from '../logic/GameState';
import type { GameState, DeathInfo } from '../logic/GameState';
import { respawnPlayer } from '../logic/Player';
import { spawnFood } from '../logic/Food';
import { createCamera, followCamera, updateCameraZoom, clampCameraToWorld } from '../render/Camera';
import type { Camera } from '../render/Camera';
import { drawBackground } from '../render/BackgroundRenderer';
import { drawFoods, drawPellets } from '../render/FoodRenderer';
import { drawCells, drawGhosts } from '../render/PlayerRenderer';
import { ParticlePool } from '../render/ParticlePool';
import { FloatTextPool } from '../render/FloatText';
import { DevourFx } from '../render/DevourFx';
import { drawViruses } from '../render/VirusRenderer';
import { preloadSkins, isSkinLoaded } from '../render/SkinAssets';
import { SKINS, isValidSkin } from '../skins/registry';
import { getCoins, earnForRun, addCoins } from '../skins/market';
import { getTotalXP, addXP, xpProgress } from '../progression/xp';
import { NO_EFFECT, isValidEffect, slotOf, EFFECT_SLOTS } from '../skins/effects';
import type { EffectSlot } from '../skins/effects';
import { PointerInput } from '../input/PointerInput';
import { userSplit, createCell, syncAggregates } from '../logic/Player';
import { firePellets } from '../logic/Pellets';
import { radiusFromMass } from '../logic/Growth';
import { ImpactFx } from '../render/fx/ImpactFx';
import { emitConsumeDebris, emitFireMuzzle, emitFireTrail, emitFireLanding } from '../render/fx/Effects';

declare global {
  interface Window {
    /** develop-web-game test hook'u: oyun state'inin metin özeti */
    render_game_to_text?: () => string;
    /** develop-web-game test hook'u: deterministik zaman ilerletme */
    advanceTime?: (ms: number) => void;
    /** test hook'u: belirli koordinata yem doğurur → id döner */
    test_spawn_food?: (x: number, y: number) => number;
    /** test hook'u: id'li yemi sahadan kaldırır */
    test_remove_food?: (id: number) => boolean;
    /** test hook'u: oyuncu çevresindeki yemleri temizler (parazitlenme önleme) → kaç tanesi */
    test_clear_near_player?: (radius: number) => number;
    /** test hook'u: oyuncuyu tam koordinata ışınlar */
    test_set_player_pos?: (x: number, y: number) => boolean;
    /** test hook'u: botu (index) tam koordinata ışınlar — davranış sahnesi için */
    test_set_bot_pos?: (index: number, x: number, y: number) => boolean;
    /** test hook'u: botun (index) skinini zorla — görsel sahneleme */
    test_set_bot_skin?: (index: number, id: string) => boolean;
    /** test hook'u: hücre-yutma (combat) aç/kapa — deterministik test sahnesi */
    test_set_combat?: (enabled: boolean) => boolean;
    /** test hook'u: mass'i zorla ('player' veya bot index) — yutma sahneleme */
    test_set_mass?: (who: 'player' | number, mass: number) => boolean;
    /** test hook'u: yarıçap içindeki aktif parçacık sayısı (yerel ölüm patlaması kanıtı) */
    test_count_particles?: (x: number, y: number, radius: number) => number;
    /** test hook'u: yarıçap içindeki parçacıkları söndür → sahne temiz başlar */
    test_clear_particles?: (x: number, y: number, radius: number) => number;
    /** test hook'u: yoldaki yem çekilişlerini iptal et → kaç tane */
    test_reset_pulls?: () => number;
    /** test hook'u: ölüm ekranındayken tekrar doğur → başarılı mı */
    test_respawn?: () => boolean;
    /** test hook'u: (x,y) merkezli yarıçapta VİRÜS TEMİZLE — kaç tane
     *  silindi. Yeme sahneleri için şart: `virus-eaten` yiyenin kütlesine
     *  virüs kütlesini doğrudan ekler ve **skor vermez**, dolayısıyla kütle
     *  ve skor kontrolleri virüsü fark edemez (ölçüldü: 8d'de tam +100). */
    test_clear_viruses_near?: (x: number, y: number, radius: number) => number;
    test_particle_kinds?: () => Record<string, number>;
    /** test hook'u: efekti kuşan (sahne düzeni) — 'none' tüm slotları boşaltır.
     *  Sahip olma denetimi YOK (test köprüsü doğrudan state yazar). */
    test_set_effect?: (id: string) => boolean;
    /** test hook'u: canlı imza efekti (BÖLÜNME/YUTMA) sayısı — garantili
     *  katmanın havuzdan bağımsız çalıştığının kanıtı. `reset` verilirse önce
     *  katman boşaltılır (sahne izolasyonu). */
    test_impact_count?: (reset?: boolean) => number;
  }
}

/** HUD snapshot'ı — bkz. Game.getHudSnapshot() */
export interface HudSnapshot {
  score: number;
  /** DOĞRUSAL madde (baseMass = 100 = başlangıç) */
  mass: number;
  foodEaten: number;
  /** aktif skin id (SkinMenu seçimi — localStorage ile kalıcı) */
  skin: string;
  /** canlı sıralama girdileri: YOU + botlar — leaderboard GERÇEK kaynağı */
  entries: ReadonlyArray<{ name: string; score: number; mass: number; isYou: boolean }>;
  /** cüzdan bakiyesi (coin) */
  coins: number;
  /** kuşanılmış hücre efektleri (slot → id) */
  effects: Record<EffectSlot, string>;
  /** XP ilerlemesi (kalıcı seviye katmanı) */
  xp: { level: number; into: number; needed: number; total: number };
}

/** Ölüm ekranı snapshot'ı (null = hayatta) — React burayı polling ile okur. */
export interface DeathSnapshot {
  dead: boolean;
  spectating: boolean;
  death: DeathInfo | null;
}

/** Efekt kuşanımı anahtarı (localStorage) — slot başına id haritası (JSON). */
const EFFECT_KEY = 'neon-arena.effect';

/** Kayıtlı efekt haritasını okur (eski tek-string kayıtları trail slotuna taşır). */
function loadEffects(): Record<EffectSlot, string> {
  const blank: Record<EffectSlot, string> = {
    trail: NO_EFFECT,
    consume: NO_EFFECT,
    split: NO_EFFECT,
    aura: NO_EFFECT,
    pellet: NO_EFFECT,
  };
  try {
    const raw = localStorage.getItem(EFFECT_KEY);
    if (!raw) return blank;
    // Eski format: tek id string → kendi slotuna taşınır
    if (isValidEffect(raw) && raw !== NO_EFFECT) {
      const slot = slotOf(raw);
      if (slot) blank[slot] = raw;
      return blank;
    }
    const obj: unknown = JSON.parse(raw);
    if (typeof obj !== 'object' || obj === null) return blank;
    const rec = obj as Record<string, unknown>;
    for (const slot of Object.keys(blank) as EffectSlot[]) {
      const v = rec[slot];
      if (typeof v === 'string' && isValidEffect(v)) blank[slot] = v;
    }
    return blank;
  } catch {
    return blank;
  }
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input = new PointerInput();
  private state: GameState;
  private readonly cam: Camera;
  /** önceden ayrılmış parçacık havuzu — constructor'da tek sefer */
  private readonly particles = new ParticlePool();
  /** yüzen XP metinleri havuzu — constructor'da tek sefer */
  private readonly floats = new FloatTextPool();
  /** ADIM 11e — yutma-jeli havuzu: emilim hayaletleri + yutan gulp boost'u */
  private readonly fx = new DevourFx();
  /** ölüm sonrası izleme modu (spectate) — kamera lidere takılır, kontrol yok */
  private spectating = false;
  /** F3 debug overlay (virüs kuralı teşhisi) */
  private debug = false;
  /** neon iz emisyon sayacı (sn) */
  private trailAcc = 0;
  /** Galaktik iz yol takibi: hücre id → son frame DÜNYA konumu. Yolun iki ucu
   *  arasına parçacık serpilir (nokta dizisi değil, sürekli şerit). */
  private readonly trailLast = new Map<string, { x: number; y: number }>();
  /** Alev Topu: pellet id → iz sayacı (sn) + son konum (x/y ayrı haritada:
   *  kare başına `{x,y}` nesnesi üretmemek için). Listeden düşen id = yere
   *  ulaştı → iniş patlaması. */
  private readonly fireAcc = new Map<number, number>();
  private readonly fireLastX = new Map<number, number>();
  private readonly fireLastY = new Map<number, number>();
  /** İMZA efektleri (BÖLÜNME/YUTMA) — havuzdan BAĞIMSIZ garantili katman.
   *  Satın alınmış efekt yem fırtınasında sessizce ezilmemeli. */
  private readonly impactFx = new ImpactFx();
  /** oyuncu ölümü ekran flaşı — kalan süre (sn), 0 = kapalı */
  private deathFlash = 0;

  private viewW = 0;
  private viewH = 0;
  private dpr = 1;
  /** Sayfa yüklenirken kaydedilen referans DPR — tarayıcı zoom telafi çarpanının tabanı */
  private readonly refDpr = window.devicePixelRatio || 1;
  /** `(resolution: Xdppx)` izleyicisi — Ctrl+zoom devicePixelRatio'yu değiştirir */
  private mq: MediaQueryList | null = null;

  private rafId = 0;
  private lastTime = 0;
  private virtualTimeMode = false;
  /** İsim ekranı PLAY'e basıldı mı — başlamadan step İŞLENMEZ (donuk sahne) */
  private started = false;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context alınamadı');
    this.ctx = ctx;

    this.state = createGameState();
    this.cam = createCamera(this.state.player.x, this.state.player.y);

    // Kayıtlı skin tercihi (localStorage) — ölüm/yenileme boyunca korunur
    try {
      const stored = localStorage.getItem(visualTheme.skin.storageKey);
      if (isValidSkin(stored)) this.state.player.skin = stored as string;
      // Kayıtlı efekt haritası — skin ile aynı kalıcılık
      this.state.player.effects = loadEffects();
      // Kayıtlı oyuncu adı — isim ekranındaki input varsayılanı da bunu gösterir
      const storedName = localStorage.getItem(visualTheme.startScreen.nameStorageKey);
      if (storedName) this.state.player.name = storedName;
    } catch {
      /* özel mod/gizli sekme: storage yok → default skin/isim */
    }
    preloadSkins(SKINS);

    this.input.attach();
    this.resize();

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    // Ctrl+tekerlek = tarayıcı sayfa zoom'u → oyun görüşünü bozar, engelle
    window.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
    this.armDprWatch();

    // OYUN DÖNGÜSÜ — constructor'ın sonunda başlatılır. DİKKAT: bu satır
    // test kancalarının İÇİNDE olmamalı; kancalar üretimde atlanıyor ve
    // döngü de atlanırsa oyun hiç çizmez (HUD çalışır, oyun donuk kalır).
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);

    // TEST KANCA KAPISI — üretimde window'a 18 kanca açılmasın. Gerekçe:
    // konsoldan `test_set_mass` ile oyun bozulabilir. Veri riski yok
    // (istemci-oyun, sunucu yok) ama server/ denemesi leaderboard'a
    // dönüşürse hile vektörü olur. Vite DEV'de veya VITE_TEST_HOOKS=1 ile açık.
    if (import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1') this.installTestHooks();
  }

  /** Test kancalarını window'a kurar (DEV veya VITE_TEST_HOOKS=1'de çağrılır). */
  private installTestHooks(): void {
    window.render_game_to_text = () => JSON.stringify(this.textPayload());
    window.advanceTime = (ms: number) => this.advanceTime(ms);
    window.test_spawn_food = (x, y) => {
      const food = spawnFood(this.state.world, { x, y });
      this.state.foods.push(food);
      return food.id;
    };
    window.test_remove_food = (id) => {
      const before = this.state.foods.length;
      this.state.foods = this.state.foods.filter((f) => f.id !== id);
      return this.state.foods.length < before;
    };
    window.test_clear_near_player = (radius) => {
      const p = this.state.player;
      const before = this.state.foods.length;
      const rr = radius * radius;
      this.state.foods = this.state.foods.filter(
        (f) => (f.x - p.x) * (f.x - p.x) + (f.y - p.y) * (f.y - p.y) > rr,
      );
      return before - this.state.foods.length;
    };
    window.test_set_player_pos = (x, y) => {
      const p = this.state.player;
      // ÇOK HÜCRELİ (11b): TÜM hücreler aynı delta ile kayar (formasyon korunur)
      const dx = x - p.x;
      const dy = y - p.y;
      for (const c of p.cells) {
        const inset = c.radius * visualTheme.game.wallCenterRatio;
        c.x = Math.max(inset, Math.min(this.state.world.width - inset, c.x + dx));
        c.y = Math.max(inset, Math.min(this.state.world.height - inset, c.y + dy));
        c.vx = 0;
        c.vy = 0;
        c.bvx = 0;
        c.bvy = 0;
      }
      syncAggregates(p, 1);
      return true;
    };
    window.test_set_bot_pos = (index, x, y) => {
      const bot = this.state.bots[index];
      if (!bot) return false;
      const dx = x - bot.x;
      const dy = y - bot.y;
      for (const c of bot.cells) {
        const inset = c.radius * visualTheme.game.wallCenterRatio;
        c.x = Math.max(inset, Math.min(this.state.world.width - inset, c.x + dx));
        c.y = Math.max(inset, Math.min(this.state.world.height - inset, c.y + dy));
        c.vx = 0;
        c.vy = 0;
        c.bvx = 0;
        c.bvy = 0;
      }
      syncAggregates(bot, 1);
      return true;
    };
    window.test_set_bot_skin = (index, id) => {
      const bot = this.state.bots[index];
      if (!bot || !isValidSkin(id)) return false;
      bot.skin = id;
      return true;
    };
    window.test_set_effect = (id) => {
      if (!isValidEffect(id)) return false;
      if (id === NO_EFFECT) {
        for (const slot of EFFECT_SLOTS) this.state.player.effects[slot] = NO_EFFECT;
        return true;
      }
      const slot = slotOf(id);
      if (!slot) return false;
      this.state.player.effects[slot] = id;
      return true;
    };
    window.test_clear_viruses_near = (x, y, radius) => {
      const rr = radius * radius;
      const before = this.state.viruses.length;
      this.state.viruses = this.state.viruses.filter(
        (v) => (v.x - x) * (v.x - x) + (v.y - y) * (v.y - y) > rr,
      );
      return before - this.state.viruses.length;
    };
    window.test_impact_count = (reset?: boolean) => {
      if (reset) this.impactFx.reset();
      return this.impactFx.alive;
    };
    window.test_set_combat = (enabled) => {
      this.state.combatEnabled = enabled;
      return true;
    };
    window.test_set_mass = (who, mass) => {
      const target = who === 'player' ? this.state.player : this.state.bots[who];
      if (!target || !(mass > 0)) return false;
      // ÇOK HÜCRELİ (11b): mass tüm gövdeye değil TEK hücreye yazılır —
      // test sahnesi deterministik başlasın diye gövde tek hücreye indirgenir.
      const cx = target.x;
      const cy = target.y;
      target.splitSeq++;
      target.cells = [createCell(cx, cy, mass, `${target.id}:c${target.splitSeq}`)];
      target.timeToMerge = 0;
      syncAggregates(target, 1);
      return true;
    };
    window.test_count_particles = (x, y, radius) => this.particles.countNear(x, y, radius);
    window.test_clear_particles = (x, y, radius) => this.particles.clearNear(x, y, radius);
    window.test_reset_pulls = () => {
      let n = 0;
      for (const f of this.state.foods) {
        if (f.pull > 0 || f.puller !== null) {
          f.pull = 0;
          f.puller = null;
          n++;
        }
      }
      return n;
    };
    window.test_respawn = () => {
      if (!this.state.playerDead) return false;
      this.respawn();
      return true;
    };
    window.test_particle_kinds = () => this.particles.countsByKind();
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.input.detach();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('wheel', this.onWheel, true);
    this.mq?.removeEventListener('change', this.onDprChange);
    delete window.render_game_to_text;
    delete window.advanceTime;
    delete window.test_spawn_food;
    delete window.test_remove_food;
    delete window.test_clear_near_player;
    delete window.test_set_player_pos;
    delete window.test_set_bot_pos;
    delete window.test_set_bot_skin;
    delete window.test_set_combat;
    delete window.test_set_mass;
    delete window.test_count_particles;
    delete window.test_clear_particles;
    delete window.test_reset_pulls;
    delete window.test_respawn;
    delete window.test_particle_kinds;
    // Aşağıdaki üçü de kuruluyordu ama SİLİNMİYORDU: destroy() sonrası
    // window'da kalıp closure üzerinden ÖLÜ Game örneğini (dünya + 60 bot +
    // canvas referansı) tutuyor, hiç toplanamıyordu. Liste kurulumla
    // birebir eşlenmeli — installTestHooks'a yeni kanca eklenince buraya da ekle.
    delete window.test_set_effect;
    delete window.test_clear_viruses_near;
    delete window.test_impact_count;
    this.canvas.remove();
  }

  private readonly onResize = (): void => this.resize();

  private readonly onWheel = (e: WheelEvent): void => {
    // Ctrl+tekerlek / trackpad pinch → tarayıcı sayfa zoom'u: varsayılan davranışı iptal et
    if (e.ctrlKey) e.preventDefault();
  };

  /**
   * matchMedia(`(resolution: ${dpr}dppx)`) — tarayıcı zoom'u dpr'ı değiştirince
   * change olayı gelir. Olay TEK DEĞERLİĞİNE göredir; yeniden silahlandırılır.
   */
  private armDprWatch(): void {
    this.mq?.removeEventListener('change', this.onDprChange);
    this.mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.mq.addEventListener('change', this.onDprChange);
  }

  private readonly onDprChange = (): void => {
    this.resize(); // dpr + canvas backing store güncellenir
    this.armDprWatch(); // yeni dpr değerine göre yeniden kur
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // İsim girişi gibi input'larda oyun kısayolu çalışmaz (Space isimde kalsın)
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void this.canvas.requestFullscreen();
    } else if (e.code === 'Space') {
      // SPACE SPLIT — basılı tutunca tekrarlamaz (tek basış = tek split)
      e.preventDefault();
      if (!e.repeat && this.started) this.doSplit();
    } else if (e.code === 'KeyW') {
      // W EJECT — basılı tutunca tekrarlamaz (tek basış = tek volley)
      if (!e.repeat && this.started) this.doEject();
    } else if (e.code === 'Enter') {
      // Ölüyken Enter → anında tekrar oyna (ölüm ekranı butonuna alternatif)
      if (this.started && this.state.playerDead) this.respawn();
    } else if (e.code === 'F3') {
      // Debug overlay: virüs kuralı canlı teşhisi (neden patlamadı?)
      e.preventDefault();
      this.debug = !this.debug;
    }
  };

  /** Virüs kuralı teşhisi — updateViruses döngüsünün BİREBİR aynası
   *  (önce temas, sonra büyüklük, sonra tavan). Salt-okunur, overlay/payload için.
   *  Sebep görünür: PATLAMALI / TAVAN / SAKLAN / temas yok. */
  private virusDebugLines(): string[] {
    const p = this.state.player;
    if (this.state.playerDead) return ['DEAD'];
    if (p.cells.length === 0) return ['hücre yok'];
    if (this.state.viruses.length === 0) return ['virüs yok'];
    const v = visualTheme.game.virus;
    const maxCells = visualTheme.game.split.maxCells;
    const head = `${p.cells.length} parça mass:${Math.round(p.mass)}`;
    let popDist = -1;
    let popNeed = -1;
    let capped = false;
    let smallN = 0;
    let smallBest = 0;
    let smallVirus = 0;
    for (const virus of this.state.viruses) {
      for (const c of p.cells) {
        const dist = Math.hypot(virus.x - c.x, virus.y - c.y);
        const touch = c.radius + virus.radius * v.popTouch;
        if (dist >= touch) continue; // değmiyor
        if (c.mass <= virus.mass) {
          // Değen parça küçük → saklanır (doğru); en büyüğünü raporla
          smallN++;
          if (c.mass > smallBest) {
            smallBest = c.mass;
            smallVirus = virus.mass;
          }
          continue;
        }
        if (p.cells.length >= maxCells) {
          capped = true;
          continue;
        }
        popDist = dist;
        popNeed = touch;
      }
      if (popDist >= 0) break;
    }
    if (popDist >= 0) {
      return [head, `PATLAMALI! dist=${popDist.toFixed(0)} touch=${popNeed.toFixed(0)}`];
    }
    if (capped) {
      return [head, `TAVAN ${p.cells.length}/${maxCells} — YENİR, split yok`];
    }
    if (smallN > 0) {
      return [
        head,
        `${smallN} değen parça küçük → SAKLAN (parça≤${Math.round(smallBest)} virüs:${Math.round(smallVirus)})`,
      ];
    }
    return [head, 'temas yok — daha derine it'];
  }

  /** Nişan açısı — imlecin ekran-merkezine göre yönü (kamera rotasyonu yok). */
  private aimAngle(): number {
    if (this.input.active) {
      return Math.atan2(
        this.input.screenY - this.viewH / 2,
        this.input.screenX - this.viewW / 2,
      );
    }
    return this.state.player.facing;
  }

  /** Space Split — tüm hücreleri imleç yönünde ikiye bölmeye çalışır. */
  private doSplit(): void {
    const p = this.state.player;
    if (p.cells.length === 0) return;
    const made = userSplit(p, this.state.timeSec, this.aimAngle());
    if (made > 0) {
      // Split patlaması — beyaz halka (olay kuyruğu frame dışı kaybolur →
      // direkt havuza basılır, sessiz aksiyon yok). Sonic kuşanılıyken
      // SES DUVARI boom'u: çift halka + patlama çizgileri, gövdeye ölçekli
      // (eskiden sabit 220 idi → 100 kütlelik hücre de 900 kütlelik hücre de
      // aynı boom'u alıyordu).
      const pt = visualTheme.particles;
      if (p.effects.split === 'fx-sonic') {
        this.impactFx.spawn('sonic', p.x, p.y, p.radius);
      }
      this.particles.ring(p.x, p.y, visualTheme.color.gulpFlash, pt.ringRadius, pt.ringLife);
    }
  }

  /** W Eject — her yeterli hücreden imlece bir pellet (ateşleyen renginde).
   *  Alev Topu kuşanılıyorsa her namludan koni biçiminde flaş çıkar. */
  private doEject(): void {
    const p = this.state.player;
    const color = visualTheme.color.playerFill;
    const angle = this.aimAngle();
    const made = firePellets(p, angle, color);
    for (const pellet of made) this.state.pellets.push(pellet);
    if (p.effects.pellet === 'fx-firepellets') {
      // Namlu başına koni: hücre kenarından namlu yönüne, gövde boyutunda
      for (const cell of p.cells) {
        emitFireMuzzle(
          this.particles,
          cell.x + Math.cos(angle) * cell.radius,
          cell.y + Math.sin(angle) * cell.radius,
          angle,
          cell.radius,
        );
      }
    }
  }

  /** Alev Topu — uçuş izi + iniş patlaması (mantık değişmez, sadece görsel).
   *
   *  İz, pellet başına ADIM GECİKMELİ üretilir (firepellet.trailInterval): her
   *  karede iki nokta basmak 7 pellet/sn'de havuzu gereksiz doldururdu.
   *
   *  İniş tespiti OYUN katmanında: pellet id'leri geçen kareden tutulur,
   *  listeden DÜŞEN id = yere ulaştı. Pellets.ts'ye dokunulmaz (logic kuralı
   *  değişmez) — sadece görsel tetiklenir. Konum iki SAYI haritasında tutulur
   *  (kare başına `{x,y}` nesnesi üretmemek için).
   */
  private updateFirePellets(dt: number): void {
    if (this.state.player.effects.pellet !== 'fx-firepellets') {
      if (this.fireAcc.size || this.fireLastX.size) {
        this.fireAcc.clear();
        this.fireLastX.clear();
        this.fireLastY.clear();
      }
      return;
    }
    const fp = visualTheme.firepellet;

    // 1) Bu adımda listede OLMAYAN ama geçen karede olan pellet = yere ulaştı
    for (const [id, lx] of this.fireLastX) {
      if (this.state.pellets.some((p) => p.id === id)) continue;
      emitFireLanding(this.particles, lx, this.fireLastY.get(id) ?? lx);
      this.fireAcc.delete(id);
      this.fireLastX.delete(id);
      this.fireLastY.delete(id);
    }

    // 2) Uçan pelletler: konum kaydı + gecİkmeli iz
    for (const pellet of this.state.pellets) {
      this.fireLastX.set(pellet.id, pellet.x);
      this.fireLastY.set(pellet.id, pellet.y);
      const acc = (this.fireAcc.get(pellet.id) ?? 0) + dt;
      if (acc >= fp.trailInterval) {
        this.fireAcc.set(pellet.id, acc - fp.trailInterval);
        emitFireTrail(this.particles, pellet.x, pellet.y, pellet.vx, pellet.vy);
      } else {
        this.fireAcc.set(pellet.id, acc);
      }
    }
  }

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.canvas.width = Math.floor(this.viewW * this.dpr);
    this.canvas.height = Math.floor(this.viewH * this.dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // sekme arka plandaysa clamp
    this.lastTime = now;

    // Sigorta: resize/matchMedia olayları kaçarsa bile her frame'de yakala
    // (2 skaler karşılaştırma — ölçü maliyeti yok denecek kadar az)
    if (window.devicePixelRatio !== this.dpr || window.innerWidth !== this.viewW) this.resize();

    if (!this.virtualTimeMode) {
      this.step(dt);
    }
    // Ölüm flaşı gerçek zamanda da sönsün (virtual adımlar arası dahil)
    if (this.deathFlash > 0) this.deathFlash = Math.max(0, this.deathFlash - dt);

    this.render();

    this.rafId = requestAnimationFrame(this.frame);
  };

  private step(dt: number): void {
    // İsim ekranı açıkken dünya DONUKTUR (adım işlenmez, sahne sabit kalır)
    if (!this.started) return;
    // Ölüyken kontrol YOK (hedef null) — dünya yaşamaya devam eder
    const dead = this.state.playerDead;
    const target = dead
      ? null
      : this.input.worldTarget(this.state.player, this.cam, this.viewW, this.viewH);
    // Nişan açısı her adımda tazelenir (split/eject yönü)
    if (target) {
      this.state.player.aimAngle = Math.atan2(
        target.y - this.state.player.y,
        target.x - this.state.player.x,
      );
    }
    stepState(this.state, target, dt);

    // Toplama olaylarını POOF'a çevir — pool slotları RE-USED, nesne üretimi yok
    const pt = visualTheme.particles;
    const xp = visualTheme.xp;
    let stepXp = 0; // bu adımda oyuncunun kazandığı XP (seviye atlama tek seferde)
    const xpColor = xp.textColor;
    // Görsel bütçe (adım başına): havuz oyunun ORTAK kaynağı. Bir saçılma
    // halkasından 40+ yem tek adımda çözülürse yem başına tam POOF havuzu
    // doğurur ve yutma/ölüm/level-up geri bildirimi boğulurdu. OYUN MANTIĞI
    // ETKİLENMEZ (skor/mass/XP her yem için işlenir) — yalnızca çizim kısılır.
    let fxBudget = pt.fxBudgetPerStep;
    for (const ev of this.state.events) {
      if (ev.kind === 'food-collected') {
        // Yalnız OYUNCUNUN yediği yem çizilir. 60 bot her adımda onlarca yem
        // olayı üretir; hepsine POOF basılırsa havuz saniyede ~2000 doldurur,
        // yutma/ölüm/level-up geri bildirimi boğulur ve parçacıklar hiç ölmez.
        // (Oyun mantığı zaten `mine` ile ayrışıyor: skor/mass sahibine işleniyor.)
        if (!ev.mine) continue;
        const style = visualTheme.color.food.hueStyle(ev.hue);
        const n = fxBudget >= pt.poofCount ? pt.poofCount : fxBudget;
        if (n > 0) {
          this.particles.burst(ev.x, ev.y, style.fill, n, pt.poofSpeed, pt.poofLife, pt.poofSize);
          fxBudget -= n;
        }
        this.particles.ring(ev.x, ev.y, style.fill, pt.ringRadius, pt.ringLife);
        stepXp += xp.perFood;
        this.floats.spawn(ev.x, ev.y, `+${xp.perFood} XP`, xpColor);
      } else if (ev.kind === 'cell-eaten') {
        // hücre yutma — altın patlama + ÇİFT halka (kurban noktası + yutan
        // merkezi): yutma anı tek karede bile okunur (sessiz aksiyon yok)
        const gold = visualTheme.color.devourBurst;
        this.particles.burst(ev.x, ev.y, gold, pt.devourCount, pt.devourSpeed, pt.devourLife, pt.devourSize);
        this.particles.ring(ev.x, ev.y, gold, pt.devourRingRadius, pt.devourRingLife);
        this.particles.ring(ev.eaterX, ev.eaterY, gold, pt.devourRingRadius, pt.devourRingLife);
        // ADIM 11e — jel: kurban hayaleti yutana kayar, yutanda gulp sıçraması
        this.fx.spawnGhost(ev);
        this.fx.spawnGulp(ev.eaterId, ev.victimR, ev.eaterR);
        // XP: yutan oyuncuysa kurban mass'inden (mor floating text)
        if (ev.eaterId === this.state.player.id) {
          const gain = Math.max(1, Math.round(ev.victimMass * xp.perDevourMass));
          stepXp += gain;
          this.floats.spawn(ev.x, ev.y, `+${gain} XP`, xpColor);
        }
        // ŞOK DALGASI (consume efekti): oyuncu yuttuysa, KURBANIN BOYUTUNA
        // ölçekli koreografik patlama (sabit yarıçap "her av aynı" gibi
        // hissettiriyordu). Halka+çekirdek GARANTİLİ katmanda (ImpactFx),
        // kırıntı/köz havuzda — yem fırtınasında imza efekt ezilmez.
        if (ev.eaterId === this.state.player.id && this.state.player.effects.consume === 'fx-shockwave') {
          const victimR = radiusFromMass(ev.victimMass);
          this.impactFx.spawn('shock', ev.x, ev.y, victimR);
          emitConsumeDebris(this.particles, ev.x, ev.y, victimR);
        }
        if (ev.victimIsPlayer) {
          this.deathFlash = visualTheme.animation.deathFlashSec;
          // kamera ANINDA yeni konuma — harita boyu kaydırma yok, ölüm temiz olsun
          this.cam.x = this.state.player.x;
          this.cam.y = this.state.player.y;
        }
      } else if (ev.kind === 'virus-eaten') {
        // virüs yenildi/patladı/beslendi → yeşil burst + halka (sessiz aksiyon yok)
        const v = visualTheme.game.virus;
        this.particles.burst(ev.x, ev.y, v.fill, v.fxBurstCount, v.fxBurstSpeed, v.fxBurstLife, v.fxBurstSize);
        this.particles.ring(ev.x, ev.y, v.fill, v.fxRingRadius, v.fxRingLife);
        // XP: oyuncu yediyse (besleme değil)
        if (ev.mine) {
          stepXp += xp.perVirus;
          this.floats.spawn(ev.x, ev.y, `+${xp.perVirus} XP`, xpColor);
        }
      } else if (ev.kind === 'split-burst') {
        // split/virüs patlaması → beyaz halka (sessiz aksiyon yok)
        this.particles.ring(ev.x, ev.y, visualTheme.color.gulpFlash, pt.ringRadius, pt.ringLife);
      }
    }
    this.particles.update(dt);
    this.impactFx.update(dt);
    this.fx.update(dt); // ADIM 11e — hayalet/gulp ömürleri
    this.floats.update(dt); // yüzen XP metinleri
    this.emitTrail(dt); // efekt marketi: neon iz
    this.updateFirePellets(dt); // efekt marketi: alev topu (uçuş izi + iniş)
    // Seviye atlama: adım XP'si tek seferde işlenir → halka patlar, HUD bandı açar
    if (stepXp > 0) {
      const res = addXP(stepXp);
      if (res.gained > 0) {
        const p = this.state.player;
        this.particles.ring(p.x, p.y, xp.levelRingColor, xp.levelRingRadius, xp.levelRingLife);
        this.particles.burst(p.x, p.y, xp.levelRingColor, pt.devourCount, pt.devourSpeed, pt.devourLife, pt.devourSize);
      }
    }

    // Kamera: yaşarken oyuncuda; ölüyken izliyorsa LİDERDE, değilse ölüm noktasında sabit
    if (this.state.playerDead && this.spectating) {
      const leader = this.leaderBot();
      if (leader) {
        followCamera(this.cam, leader.x, leader.y, dt);
        updateCameraZoom(this.cam, leader.radius);
        this.cam.zoom *= this.refDpr / this.dpr;
        // Sinır kırpma: DPR telafisi SONRASI (zoom kesinleşmiş haliyle) çalışmalı
        clampCameraToWorld(this.cam, this.state.world, this.viewW, this.viewH);
        return;
      }
    }
    if (!this.state.playerDead) {
      followCamera(this.cam, this.state.player.x, this.state.player.y, dt);
      // Boyuta göre sönümlü zoom: zoom = baseZoom × (baseRadius/radius)^0.4
      updateCameraZoom(this.cam, this.state.player.radius);
      // Tarayıcı zoom'u telafisi: effZoom = oyunZoom × (referansDPR / güncelDPR)
      // → Ctrl+zoom dpr'ı değiştirse bile efektif görüş alanı sabit kalır.
      this.cam.zoom *= this.refDpr / this.dpr;
      // Sinır kırpma — harita kenarında ekranın yarısı boş beyaz kalmasın
      clampCameraToWorld(this.cam, this.state.world, this.viewW, this.viewH);
    }
  }

  /** İz emisyonu (trail slotu doluyken): hareket eden her hücreden aralıklı
   *  parçacık — dururken iz YOK. Havuz paylaşımlı (cap sabit).
   *  fx-trail: neon nokta; fx-startrail: yıldız kıvılcımı; fx-runetrail: rün glifi.
   *
   *  Not: eski tsParticles denemesi geri alındı (bozuk paket + görsel doğrulama
   *  yapılamıyordu). İZ slotu oyunun kendi ParticlePool motoruyla çalışır —
   *  tema tek kaynak, 97 kontrollük suite ile ölçülebilir. */
  private emitTrail(dt: number): void {
    const p = this.state.player;
    const fx = p.effects.trail;
    if (fx !== 'fx-trail' && fx !== 'fx-startrail' && fx !== 'fx-runetrail' && fx !== 'fx-galactictrail') {
      this.trailAcc = 0;
      this.trailLast.clear();
      return;
    }
    if (p.cells.length === 0) {
      this.trailAcc = 0;
      this.trailLast.clear();
      return;
    }
    // Galaktik iz KENDİ yol-takibi yolunu kullanır (aşağıda)
    if (fx === 'fx-galactictrail') {
      this.emitGalacticTrail();
      return;
    }
    const tr = visualTheme.trail;
    const ru = visualTheme.runetrail;
    const interval = fx === 'fx-runetrail' ? ru.interval : tr.interval;
    this.trailAcc += dt;
    if (this.trailAcc < interval) return;
    this.trailAcc = 0;
    for (const c of p.cells) {
      if (Math.hypot(c.vx + c.bvx, c.vy + c.bvy) < tr.minSpeed) continue;
      if (fx === 'fx-startrail') {
        const colors = tr.starColors;
        const color = colors[(Math.random() * colors.length) | 0];
        this.particles.spark(c.x, c.y, color, tr.count, tr.speed, tr.life, tr.size);
      } else if (fx === 'fx-runetrail') {
        // 4 yandan glif: hücre kenarından doğar, dışa yavaşça süzülür
        const sideBase = this.state.timeSec * ru.orbitSpeed;
        for (let k = 0; k < ru.sides; k++) {
          const a = sideBase + (k / ru.sides) * Math.PI * 2;
          const ox = c.x + Math.cos(a) * c.radius * ru.edgeRatio;
          const oy = c.y + Math.sin(a) * c.radius * ru.edgeRatio;
          this.particles.glyph(ox, oy, ru.color, 1, ru.speed, ru.life, ru.size, ru.spin, ru.runes, a, 0.6);
        }
      } else {
        this.particles.burst(c.x, c.y, visualTheme.color.playerFill, tr.count, tr.speed, tr.life, tr.size);
      }
    }
  }

  /**
   * GALAKTİK İZ — path following (birebir iz değil, hücrenin TARTTIĞI yol):
   *   1) Her hücre için son frame DÜNYA konumu saklanır (trailLast).
   *   2) Son konum → bu konum arası mesafe `pathStep` adımlarına bölünür.
   *   3) Her adıma: çekirdek nokta (keskin) + yumuşak hale (geniş) çifti.
   * Renk: yol boyunca hue AKIŞI (huePerPx) + zamanla genel kayma (hueShift);
   *   gradyan durakları tema'dan (gradientHues), aralarında doğrusal geçiş.
   * Boyut: zaman + yol üstünde sinüs dalgalanması (sizeWave).
   * Hareket yavaşsa/durursa konum tazelenir → yeniden hareket edince harita
   *   boyu sıçrama olmaz. Bölünme/merge sonrası ölü hücre kayıtları temizlenir.
   */
  private emitGalacticTrail(): void {
    const g = visualTheme.galactictrail;
    const cells = this.state.player.cells;
    const timeSec = this.state.timeSec;
    const seen = new Set<string>();

    // Havuz OYUNUN ORTAK kaynağı (yutma/ölüm/POOF halkaları da burada) — iz
    // onu boğmamalı. Tavanın büyük kısmı doluyken yeni iz parçacığı basılmaz;
    // aksi halde sürekli iz, kritik yutma/ölüm geri bildirimini silerdi.
    if (this.particles.alive >= visualTheme.particles.maxAlive * 0.7) return;

    for (const c of cells) {
      seen.add(c.id);
      const last = this.trailLast.get(c.id);
      if (!last) {
        // ilk kare: referans noktası kur (yol henüz yok)
        this.trailLast.set(c.id, { x: c.x, y: c.y });
        continue;
      }
      const speed = Math.hypot(c.vx + c.bvx, c.vy + c.bvy);
      const dx = c.x - last.x;
      const dy = c.y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5 || speed < g.minSpeed) {
        last.x = c.x;
        last.y = c.y;
        continue;
      }

      const steps = Math.max(g.minPerStep, Math.min(g.maxPerStep, Math.round(dist / g.pathStep)));
      const nx = -dy / dist; // yola dik birim vektör (şerit kalınlığı için)
      const ny = dx / dist;
      // hızlı hücre = daha uzun iz (yavaşlayınca kısa kalır → hız okunur)
      const life = Math.min(g.lifeMax, g.life + speed * g.lifeBySpeed);

      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const off = (Math.random() - 0.5) * g.spread;
        const x = last.x + dx * t + nx * off;
        const y = last.y + dy * t + ny * off;
        // hue: yol ilerlemesi + zaman kayması (mod 360)
        const hue = this.galacticHue(timeSec * g.hueShift + dist * t * g.huePerPx);
        const color = `hsl(${hue.toFixed(0)}, 90%, 62%)`;
        const wave = Math.sin(g.sizeWave * timeSec + t * 2.4);
        const size = g.dotSize * (1 + g.sizeWaveAmt * wave);
        const l = life * (0.82 + Math.random() * 0.36);
        const push = g.push * (0.6 + Math.random() * 0.8);
        // dışa itiş yalnız HALEDE (çekirdek hücreye yapışık kalır, iz okunur)
        this.particles.glow(x, y, color, g.glowSize, l, g.glowAlpha, nx * push, ny * push);
        this.particles.burst(x, y, color, 1, 0, l, size);
      }
      last.x = c.x;
      last.y = c.y;
    }

    // ölü hücre (split/merge) kayıtlarını düşür — map sınırsız büyümesin
    for (const id of this.trailLast.keys()) {
      if (!seen.has(id)) this.trailLast.delete(id);
    }
  }

  /** Galaktik iz gradyanı: duraklar arasında doğrusal hue geçişi (360→0 sarması). */
  private galacticHue(deg: number): number {
    const h = visualTheme.galactictrail.gradientHues;
    const n = h.length;
    const span = 360 / n;
    const u = (((deg % 360) + 360) % 360) / span;
    const i = Math.floor(u) % n;
    const f = u - Math.floor(u);
    const a = h[i];
    let d = h[(i + 1) % n] - a;
    if (d < 0) d += 360; // 340° → 12° sarması
    return (a + d * f) % 360;
  }

  /** En büyük bot (spectate kamerası + takım skoru buradan). */
  private leaderBot() {
    let best: (typeof this.state.bots)[number] | null = null;
    for (const b of this.state.bots) {
      if (!best || b.mass > best.mass) best = b;
    }
    return best;
  }

  private render(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // Tüm dünya çizimleri tek kamera transformu altında (background EN ALTTA)
    ctx.save();
    ctx.translate(this.viewW / 2, this.viewH / 2);
    ctx.scale(this.cam.zoom, this.cam.zoom);
    ctx.translate(-this.cam.x, -this.cam.y);

    drawBackground(ctx, this.cam, this.state.world, this.viewW, this.viewH);
    // Wall-clock (state.timeSec DEĞİL — sim dursa da yem wobble akar)
    drawFoods(ctx, this.state.foods, this.cam, this.viewW, this.viewH, performance.now() / 1000);
    // Uçan pelletler (yem üstünde) → emilim hayaletleri (hücrelerin ALTINDA)
    drawPellets(
      ctx,
      this.state.pellets,
      this.state.player.effects.pellet === 'fx-firepellets',
      this.state.timeSec,
    );
    drawGhosts(ctx, this.fx, this.state.world, this.state.timeSec);
    // Hücreler: z-sıra küçük → büyük + her hücrede ortalanmış isim
    // (zincir Grid → Yem → Pellet → Hayalet → Hücreler → VİRÜS → parçacıklar → UI)
    drawCells(ctx, this.state.player, this.state.bots, this.state.timeSec, this.state.world, this.cam.zoom, this.fx);
    // Virüsler hücrelerin ÜSTÜNDE → küçük hücre altına saklanır (agar.io birebir)
    drawViruses(ctx, this.state.viruses, this.state.timeSec);
    // POOF/halka oyuncunun ÜZERİNDE (içeri çekildi → patlama gövdede okunur)
    this.particles.draw(ctx, this.cam.zoom);
    // İMZA EFEKTLERİ en üstte: satın alınmış halkalar havuzdan bağımsız
    // çizilir (yem fırtınasında ezilmez) ve üstte kalınlıkları okunur
    this.impactFx.draw(ctx, this.cam.zoom);
    // Yüzen XP metinleri (dünya koordinatında, her şeyin üstünde okunur)
    this.floats.draw(ctx);

    ctx.restore();

    // Ölüm flaşı — ekran genelinde ease-out sönen kırmızı (görsel geri bildirim)
    if (this.deathFlash > 0) {
      const an = visualTheme.animation;
      const t = Math.min(1, this.deathFlash / an.deathFlashSec);
      ctx.globalAlpha = an.easeOutCubic(t) * an.deathFlashMaxAlpha;
      ctx.fillStyle = visualTheme.color.deathFlash;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
      ctx.globalAlpha = 1;
    }

    // F3 debug overlay — virüs kuralı canlı teşhisi (ekran px, sol üst)
    if (this.debug) {
      const lines = this.virusDebugLines();
      ctx.save();
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = '#000000';
      ctx.fillRect(10, 108, 360, 20 + lines.length * 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#4ade80';
      lines.forEach((line, i) => {
        ctx.fillText(line, 16, 114 + i * 16);
      });
      ctx.restore();
    }
  }

  /** Test için deterministik adım: verilen ms'yi sabit adımlarla işletir. */
  private advanceTime(ms: number): void {
    this.virtualTimeMode = true;
    const stepMs = 1000 / visualTheme.game.fixedStepHz;
    const steps = Math.max(1, Math.round(ms / stepMs));
    for (let i = 0; i < steps; i++) {
      this.step(stepMs / 1000);
      // Ölüm flaşı sanal adımlarla da sönsün — advanceTime bloklayıcı olduğu için
      // rAF frame'i arada çalışmaz, flaş render'da takılı kalırdı (overlay flake).
      if (this.deathFlash > 0) this.deathFlash = Math.max(0, this.deathFlash - stepMs / 1000);
    }
    this.render();
  }

  /**
   * HUD'un okuyabileceği salt-okunur anlık görüntü.
   * React (HUD) oyun state'ine YAZMAZ, yalnızca bu snapshot'ı okur →
   * render döngüsü React state'inden bağımsız kalır (60fps kuralı).
   */
  /** Gerçek sıralama girdileri: oyuncu ADI + botlar (leaderboard bunu okur).
   *  MASS bazlı azalan sıra (agar.io birebir — tablo kütleye göre). */
  private standings(): Array<{ name: string; score: number; mass: number; isYou: boolean }> {
    const p = this.state.player;
    const rows = [
      { name: p.name || 'YOU', score: p.score, mass: p.mass, isYou: true },
      ...this.state.bots.map((b) => ({ name: b.name, score: b.score, mass: b.mass, isYou: false })),
    ];
    rows.sort((a, b) => b.mass - a.mass);
    return rows;
  }

  /** Oyun başladı mı (isim ekranı geçildi) — test köprüsü. */
  get isStarted(): boolean {
    return this.started;
  }

  /**
   * İsim ekranı PLAY — adı uygula + localStorage'a yaz + oyunu başlat.
   * Geri bildirim (sessiz aksiyon yok): isim ANINDA hücrenin ortasında ve
   * leaderboard satırında görünür, dünya adım işlemeye başlar.
   */
  startGame(rawName: string): void {
    const s = visualTheme.startScreen;
    const name = (rawName || '').trim().slice(0, s.maxLength) || s.defaultName;
    // Taze koşu: önceki koşu bittiyse ya da ilk girişse dünya sıfırlanır
    if (this.state.playerDead || !this.started) {
      this.state = createGameState();
      this.spectating = false;
      // Kayıtlı skin + efekt yeni dünyaya taşınır (ölüm/yenileme boyunca korunur)
      try {
        const stored = localStorage.getItem(visualTheme.skin.storageKey);
        if (isValidSkin(stored)) this.state.player.skin = stored as string;
        this.state.player.effects = loadEffects();
      } catch {
        /* storage yok → default skin */
      }
    }
    this.state.player.name = name;
    try {
      localStorage.setItem(s.nameStorageKey, name);
    } catch {
      /* özel mod/gizli sekme: isim sadece oturumda kalır */
    }
    this.started = true;
  }

  /** Ölüm ekranı → TEKRAR OYNA: taze doğuş, koşu sıfırlanır, oyun devam eder. */
  respawn(): void {
    if (!this.state.playerDead) return;
    const avoid = this.state.bots.map((b) => ({ x: b.x, y: b.y }));
    respawnPlayer(this.state.player, this.state.world, avoid);
    this.state.playerDead = false;
    this.state.death = null;
    this.state.run = { startSec: this.state.timeSec, bestMass: visualTheme.growth.baseMass };
    this.spectating = false;
    this.cam.x = this.state.player.x;
    this.cam.y = this.state.player.y;
  }

  /** Ölüm ekranı → İZLE: lider bot takip edilir (kontrolsüz, Enter ile dönüş). */
  spectate(): void {
    if (this.state.playerDead) this.spectating = true;
  }

  getDeathSnapshot(): DeathSnapshot {
    return {
      dead: this.state.playerDead,
      spectating: this.spectating,
      death: this.state.death,
    };
  }

  /**
   * Ölüm coin'i TEK SEFERLİK claim (DeathScreen mount'unda çağrılır):
   * formülden hesaplar, cüzdana ekler, bayrağı kapatır → kazanılan coin.
   */
  claimDeathCoins(): number {
    const d = this.state.death;
    if (!d || d.coinsAwarded) return 0;
    d.coinsAwarded = true;
    const earned = earnForRun(d.score, d.bestMass, d.survivedSec);
    addCoins(earned);
    return earned;
  }

  getHudSnapshot(): HudSnapshot {
    const p = this.state.player;
    const xpNow = xpProgress(getTotalXP());
    return {
      score: p.score,
      mass: p.mass,
      foodEaten: p.foodEaten,
      skin: p.skin,
      coins: getCoins(),
      effects: { ...p.effects },
      xp: { level: xpNow.level, into: xpNow.into, needed: xpNow.needed, total: getTotalXP() },
      entries: this.standings(),
    };
  }

  /**
   * Efekt kuşanma (market → bu metot): id kendi slotuna takılır, aynı slotun
   * eski efekti düşer (diğer slotlar etkilenmez). Sadece sahip olunan kuşanılır;
   * seçim localStorage'a yazılır (oturumlar arası kalıcı).
   */
  setEffect(id: string): boolean {
    const slot = slotOf(id);
    if (!slot) return false;
    try {
      const owned: unknown = JSON.parse(localStorage.getItem(visualTheme.market.ownedKey) ?? '[]');
      if (!Array.isArray(owned) || !owned.includes(id)) return false;
    } catch {
      return false;
    }
    this.state.player.effects[slot] = id;
    this.saveEffects();
    return true;
  }

  /** Slotu boşalt ('none') — diğer slotlar korunur. */
  clearEffect(slot: EffectSlot): void {
    this.state.player.effects[slot] = NO_EFFECT;
    this.saveEffects();
  }

  private saveEffects(): void {
    try {
      localStorage.setItem(EFFECT_KEY, JSON.stringify(this.state.player.effects));
    } catch {
      /* storage yok → seçim sadece oturumda kalır */
    }
  }

  /**
   * Skin seçimi (SkinMenu → bu metot). Mantık/validasyon burada:
   * registry'de var mı? → uygula + localStorage'a yaz + görsel geri bildirim
   * (skin glow halkası — sessiz aksiyon yok). React state'e YAZMAZ.
   */
  setSkin(id: string): boolean {
    if (!isValidSkin(id)) return false;
    const p = this.state.player;
    p.skin = id;
    try {
      localStorage.setItem(visualTheme.skin.storageKey, id);
    } catch {
      /* storage yok → seçim sadece oturumda kalır */
    }
    // Değişim geri bildirimi: yeni skin'in halka rengiyle ışık halkası
    const variant = visualTheme.skin.variant(id);
    const color = variant ? variant.ring : visualTheme.color.playerStroke;
    const pt = visualTheme.particles;
    this.particles.ring(p.x, p.y, color, pt.ringRadius, pt.ringLife);
    return true;
  }

  /** Menü açık/kapalı — açıkken girdi kapanır (göz atarken hücre sürüklenmesin). */
  setInputEnabled(enabled: boolean): void {
    this.input.enabled = enabled;
    if (!enabled) this.input.active = false;
  }

  private textPayload(): Record<string, unknown> {
    const p = this.state.player;
    return {
      note: 'world origin: top-left, +x right, +y down; units: px',
      world: { w: this.state.world.width, h: this.state.world.height },
      player: {
        x: Math.round(p.x),
        y: Math.round(p.y),
        r: +p.radius.toFixed(2),
        targetR: +p.targetRadius.toFixed(2),
        stage: p.stage,
        mass: +p.mass.toFixed(2),
        foodEaten: p.foodEaten,
        score: p.score,
        facing: +p.facing.toFixed(2),
        /** oyuncu adı — hücre ortası + leaderboard (isim ekranı köprüsü) */
        name: p.name,
        /** kuşanılmış hücre efektleri (slot → id) */
        effects: { ...p.effects },
        /** çok hücreli gövde: parça sayısı + birleşme sayacı (sn) */
        cells: p.cells.length,
        mergeT: +(p.timeToMerge - this.state.timeSec).toFixed(2),
      },
      /** botlar — aynı Growth/Collision sistemi + CLASSIC skin (agar.io birebir: 
       *  rakip hücreler düz dolgu + koyu kontur; skin seçimi sadece oyuncuda) */
      bots: this.state.bots.map((b) => ({
        name: b.name,
        skin: b.skin,
        x: Math.round(b.x),
        y: Math.round(b.y),
        r: +b.radius.toFixed(1),
        mass: +b.mass.toFixed(1),
        score: b.score,
        foodEaten: b.foodEaten,
        cells: b.cells.length,
      })),
      botCount: this.state.bots.length,
      standings: this.standings(),
      foods: this.state.foods.map((f) => ({
        id: f.id,
        x: Math.round(f.x),
        y: Math.round(f.y),
        r: f.radius,
        /** hue (0..359) — renderer ile TEK formül (theme.food.hueOf) */
        hue: visualTheme.color.food.hueOf(f.seed),
        pull: +f.pull.toFixed(3),
      })),
      foodCount: this.state.foods.length,
      /** hedef saha doluluğu (agar.io yoğunluğu — theme.game.foodCount) */
      foodTarget: visualTheme.game.foodCount,
      /** virüs + uçan pellet sayıları (11c) */
      virusCount: this.state.viruses.length,
      pelletCount: this.state.pellets.length,
      /** ölüm durumu (P1 ölüm ekranı) */
      dead: this.state.playerDead,
      death: this.state.death,
      coins: getCoins(),
      /** XP (kalıcı seviye) */
      xpLevel: xpProgress(getTotalXP()).level,
      xpTotal: getTotalXP(),
      /** F3 teşhis metni (virüs kuralı canlı kararı) */
      dbg: this.virusDebugLines(),
      runBest: Math.round(this.state.run.bestMass),
      events: this.state.events.length,
      particles: { alive: this.particles.alive, cap: this.particles.cap },
      camera: { x: Math.round(this.cam.x), y: Math.round(this.cam.y), zoom: +this.cam.zoom.toFixed(3) },
      viewportW: this.viewW,
      viewportH: this.viewH,
      /** oyuncunun EKRANDAKİ yarıçapı (radius × zoom) — ekran kaplama kontrolü */
      screenRadius: +(this.state.player.radius * this.cam.zoom).toFixed(1),
      timeSec: +this.state.timeSec.toFixed(2),
      /** büyüme formülü köprüsü — test tek kaynaktan okur */
      growth: {
        baseMass: visualTheme.growth.baseMass,
        baseRadius: visualTheme.size.playerBaseRadius,
        massGain: visualTheme.growth.massGain,
        massStages: visualTheme.growth.massStages,
        /** kamera zoom eğrisi üssü — test formülü tek kaynaktan okur */
        zoomDamping: visualTheme.camera.zoomDamping,
      },
      /** referans/güncel DPR — telafi çarpanı = ref/cur */
      dpr: { ref: this.refDpr, cur: +this.dpr.toFixed(2) },
      /** ölüm flaşı kalan süre (sn) + yutma modu — test köprüsü */
      flash: +this.deathFlash.toFixed(2),
      combat: this.state.combatEnabled,
      /** ölüm ekonomisi köprüleri — test tek kaynaktan okur */
      scatter: {
        ratio: visualTheme.game.deathScatter.ratio,
        maxCount: visualTheme.game.deathScatter.maxCount,
        /** halka yarıçapı çarpanı = (yiyenR + kurbanR) × ringFactor — test köprüsü */
        ringFactor: visualTheme.game.deathScatter.ringFactor,
      },
      /** isim ekranı geçildi mi — test köprüsü */
      started: this.started,
      /** skin: aktif id, sprite yüklendi mi, girdi bayrağı (menü testi köprüsü) */
      skin: p.skin,
      skinLoaded: isSkinLoaded(p.skin),
      /** botların daimi skin'i — tema tek kaynak (agar.io birebir düz hücre) */
      skinDefault: visualTheme.skin.defaultId,
      inputEnabled: this.input.enabled,
    };
  }
}
