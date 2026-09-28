/**
 * ui/LevelMeter.tsx — RANK ÜNİTESİ (seviye madalyonu + XP rayı + menü çipi).
 *
 * Tek tasarım, iki ölçek: HUD'da tam (madalyon ∙ unvan ∙ ray), giriş menüsünde
 * mini çip. Eski düz "LV 6" hapı ve 6px çubuk yerine DERİNLİK katmanları:
 * conic ilerleme halkası, halka üzerinde yürüyen başlık noktası, cam madalyon
 * çekirdeği, koyu→parlak dolum gradyanı + speküler şerit + kilometre taşı
 * çentikleri, parlak dolum kenarı ve seviye atlamasında şok dalgası.
 *
 * RANK ACCENT: `--rp` CSS değişkeni olarak BİR kez verilir; halka/dolum/
 * parıltı/metin hepsi ondan türer (`--rp-dim/lite/soft/glow`) → kilometre
 * taşında renk değişince tüm birim tek yerde değişir.
 *
 * Saf görsel: state okumaz, yalnız seviye + ilerleme alır. HUD, iç düğümleri
 * `RankHandles` üzerinden rAF'ta yazar (React re-render yok).
 */
import { useRef } from 'react';
import type { CSSProperties, Ref, RefObject } from 'react';
import { visualTheme, shadeColor, tintColor, alphaOf } from '../theme/visualTheme';
import { tierFor, rankColor, xpForLevel } from '../progression/xp';

const x = visualTheme.xp;
const hud = visualTheme.hud;

/* ------------------------------------------------------------------ *
 * CSS — tüm değerler theme'den (hardcoded renk/px YASAK)
 * ------------------------------------------------------------------ */
export const levelMeterCss = `
/* ---- SEVİYE MADALYONU ---- */
.lv-dial {
  --lv-size: ${x.dial.size}px;
  --lv-ring: ${x.dial.ringWidth}px;
  --lv-head-size: ${x.dial.headSize}px;
  --lv-value-size: ${x.dial.valueSize}px;
  --lv-track: ${x.dial.trackColor};
  position: relative;
  width: var(--lv-size);
  height: var(--lv-size);
  flex: 0 0 auto;
  border-radius: 50%;
  background: conic-gradient(from -90deg,
    var(--rp) 0 calc(var(--p) * 1%),
    var(--lv-track) calc(var(--p) * 1%) 100%);
  box-shadow: 0 0 0 ${x.dial.outerRing}px var(--rp-soft), 0 0 ${x.dial.glowBlur}px var(--rp-glow);
  transition: box-shadow 420ms ease;
}
.lv-dial-core {
  position: absolute;
  inset: var(--lv-ring);
  border-radius: 50%;
  background: ${x.dial.coreBg};
  box-shadow: inset 0 0 0 1px ${x.dial.coreBorder}, ${x.dial.coreShadow};
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.lv-dial-num {
  font-family: ${hud.monoFamily};
  font-size: var(--lv-value-size);
  font-weight: ${x.dial.valueWeight};
  color: ${x.dial.valueColor};
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 ${x.dial.glowBlur}px var(--rp-glow);
}
/* halka üzerinde yürüyen başlık noktası — dolumun nerede olduğunu gösterir */
.lv-dial-head {
  position: absolute;
  left: 50%;
  top: 0;
  width: var(--lv-head-size);
  height: var(--lv-head-size);
  margin-left: calc(var(--lv-head-size) / -2);
  border-radius: 50%;
  background: ${x.dial.headColor};
  box-shadow: 0 0 ${x.dial.headGlow}px var(--rp), 0 0 ${x.dial.headGlow2}px var(--rp-glow);
  transform-origin: calc(var(--lv-head-size) / 2) calc(var(--lv-size) / 2);
  transform: rotate(calc(var(--p) * 3.6deg));
  opacity: calc(${x.dial.headMinOpacity} + ${1 - x.dial.headMinOpacity} * var(--p) / 100);
  pointer-events: none;
}
.lv-dial--chip {
  --lv-size: ${x.chip.dialSize}px;
  --lv-ring: ${x.chip.dialRingWidth}px;
  --lv-head-size: ${x.chip.dialHeadSize}px;
  --lv-value-size: ${x.chip.valueSize}px;
}

/* ---- XP RAYI ---- */
.lv-rail {
  position: relative;
  height: ${x.rail.height}px;
  border-radius: ${x.rail.radius}px;
  background: ${x.rail.trackBg};
  box-shadow: ${x.rail.trackShadow};
}
.lv-notch {
  position: absolute;
  top: 1px;
  bottom: 1px;
  width: 1px;
  background: ${x.rail.notchColor};
  pointer-events: none;
}
.lv-rail-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(var(--p) * 1%);
  border-radius: ${x.rail.radius}px;
  background: linear-gradient(90deg, var(--rp-dim) 0%, var(--rp) 55%, var(--rp-lite) 100%);
  box-shadow: ${x.rail.fillInner}, 0 0 ${x.rail.fillGlow}px var(--rp-glow);
  overflow: hidden;
}
.lv-sheen {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: ${x.rail.sheenWidth};
  background: linear-gradient(100deg, transparent 0%, ${x.dial.headColor} 50%, transparent 100%);
  opacity: ${x.rail.sheenAlpha};
  transform: translateX(${x.rail.sheenFrom});
  animation: lv-sheen ${x.rail.sheenMs}ms ${x.rail.sheenEasing} infinite;
  pointer-events: none;
}
.lv-rail-head {
  position: absolute;
  left: calc(var(--p) * 1%);
  top: -${x.rail.headOutset}px;
  bottom: -${x.rail.headOutset}px;
  width: ${x.rail.headWidth}px;
  margin-left: calc(${x.rail.headWidth}px / -2);
  border-radius: ${x.rail.headRadius}px;
  background: ${x.dial.headColor};
  box-shadow: 0 0 ${x.rail.headGlow}px var(--rp), 0 0 ${x.rail.headGlow2}px var(--rp-glow);
  pointer-events: none;
}

/* ---- UNVAN + XP SAYILARI ---- */
.lv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${x.row.gap}px;
}
.lv-tier {
  display: inline-flex;
  align-items: center;
  gap: ${x.row.glyphGap}px;
  font-size: ${x.row.tierSize}px;
  font-weight: ${x.row.tierWeight};
  letter-spacing: ${x.row.tierTracking};
  color: var(--rp);
  text-shadow: 0 0 ${x.dial.glowBlur}px var(--rp-glow);
  white-space: nowrap;
}
.lv-tier::before {
  content: "";
  width: ${x.row.glyphSize}px;
  height: ${x.row.glyphSize}px;
  background: var(--rp);
  box-shadow: 0 0 ${x.rail.headGlow}px var(--rp);
  transform: rotate(45deg);
}
.lv-nums {
  display: inline-flex;
  align-items: baseline;
  gap: ${x.row.numGap}px;
  font-family: ${hud.monoFamily};
  font-size: ${x.row.numSize}px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lv-num-in { color: ${x.row.numColor}; font-weight: 700; }
.lv-num-of { color: ${x.row.numDim}; }
.lv-num-unit { letter-spacing: ${x.row.unitTracking}; }

/* ---- PANEL YERLEŞİMİ ----
 * --rp* için TEMA VARSAYILANI yazılır: HUD rAF'ı ilk frame'den önce
 * değişkenleri doldurmasaydı conic-gradient geçersizleşip madalyon bir kare
 * saydam kalırdı. rankVars() bunları üstüne yazar. */
.lv-panel {
  --p: 0;
  --rp: ${x.textColor};
  --rp-dim: ${shadeColor(x.textColor, x.rank.dimAmount)};
  --rp-lite: ${tintColor(x.textColor, x.rank.liteAmount)};
  --rp-soft: ${alphaOf(x.textColor, x.rank.softAlpha)};
  --rp-glow: ${alphaOf(x.textColor, x.rank.glowAlpha)};
  display: flex;
  align-items: center;
  gap: ${x.panel.gap}px;
}
.lv-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: ${x.panel.rowGap}px;
  min-width: ${x.panel.railMinWidth}px;
}

/* ---- GİRİŞ MENÜSÜ ÇİPİ ---- */
.lv-chip {
  display: inline-flex;
  align-items: center;
  gap: ${x.chip.gap}px;
  padding: ${x.chip.padY}px ${x.chip.padX}px;
  border-radius: ${x.chip.radius}px;
  background: var(--rp-chip-bg);
  border: 1px solid var(--rp-chip-border);
  box-shadow: ${x.chip.innerSheen}, 0 0 ${x.chip.glowBlur}px var(--rp-chip-glow);
}
.lv-chip .lv-tier {
  font-size: ${x.chip.labelSize}px;
  letter-spacing: ${x.chip.labelTracking};
  gap: ${x.chip.glyphGap}px;
}
.lv-chip .lv-tier::before { width: ${x.chip.glyphSize}px; height: ${x.chip.glyphSize}px; }

/* ---- SEVİYE ATLAMA EFEKTLERİ ---- */
.lv-dial.is-up { animation: lv-dial-up ${x.dial.upMs}ms ${x.rail.sheenEasing}; }
.lv-dial.is-up::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid var(--rp);
  animation: lv-shock ${x.dial.upMs}ms ease-out;
  pointer-events: none;
}
.lv-rail.is-up .lv-rail-fill { animation: lv-rail-flash ${x.rail.upFlashMs}ms ease-out; }

@keyframes lv-dial-up {
  0% { transform: scale(1); }
  30% { transform: scale(${x.dial.upScale}); }
  100% { transform: scale(1); }
}
@keyframes lv-shock {
  0% { opacity: ${x.dial.shockAlpha}; transform: scale(1); }
  100% { opacity: 0; transform: scale(${x.dial.shockMaxScale}); }
}
@keyframes lv-rail-flash {
  0% { filter: brightness(${x.rail.upFlashBright}); }
  100% { filter: brightness(1); }
}
@keyframes lv-sheen {
  0% { transform: translateX(${x.rail.sheenFrom}); }
  ${x.rail.sheenToPct}% { transform: translateX(${x.rail.sheenTo}); }
  100% { transform: translateX(${x.rail.sheenTo}); }
}

/* ---- MENÜ ÇİPİ: yalnız madalyon + unvan (ray yok) ---- */

@media (prefers-reduced-motion: reduce) {
  .lv-sheen { animation: none; opacity: 0; }
  .lv-dial.is-up, .lv-dial.is-up::after, .lv-rail.is-up .lv-rail-fill { animation: none; }
}

/* ---- LEVEL UP BANDI (ekran ortası) ---- */
.lv-banner {
  position: fixed;
  top: ${x.banner.topPct}%;
  left: 50%;
  z-index: 15;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${x.banner.gap}px;
  opacity: 0;
  pointer-events: none;
  white-space: nowrap;
  font-family: ${hud.fontFamily};
  /* Koyu levha: bandın gradyanı saf beyaz bir durak kullanıyordu ve oyun
     zeminİ de saf beyaz → beyaz üstüne beyaz, "LEVEL n" eriyordu.
     HUD panelleri zaten beyaz zeminde griye çalmamak için koyu; aynı dille
     burada da: koyu levha + mevcut neon gradyan (yüksek kontrast). */
  padding: ${x.banner.platePadY}px ${x.banner.platePadX}px;
  border-radius: ${x.banner.plateRadius}px;
  background: ${x.banner.plateBg};
  border: ${x.banner.plateBorder};
  box-shadow: ${x.banner.plateShadow};
}
.lv-banner-main {
  font-size: ${x.banner.size}px;
  font-weight: ${x.banner.weight};
  letter-spacing: ${x.banner.tracking};
  text-indent: ${x.banner.tracking};
  line-height: 1;
  color: var(--rp);
  filter: drop-shadow(0 0 ${x.banner.glowBlur}px var(--rp-glow)) drop-shadow(0 2px 5px rgba(0, 0, 0, 0.55));
}
/* gradyan metin — destek yoksa düz renk kalsın (görünmezlik riski olmasın) */
@supports ((background-clip: text) or (-webkit-background-clip: text)) {
  .lv-banner-main {
    background: linear-gradient(100deg, var(--rp) 0%, ${x.dial.headColor} 32%, var(--rp) 58%, ${x.dial.headColor} 100%);
    background-size: 300% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    color: transparent;
    animation: lv-text-sheen ${x.banner.sheenMs}ms linear infinite;
  }
}
.lv-banner-tier {
  display: flex;
  align-items: center;
  gap: ${x.banner.ruleGap}px;
  font-size: ${x.banner.tierSize}px;
  font-weight: ${x.banner.weight};
  letter-spacing: ${x.banner.tierTracking};
  text-indent: ${x.banner.tierTracking};
  color: ${x.row.numColor};
  text-shadow: 0 0 ${x.dial.glowBlur}px var(--rp-glow);
}
.lv-banner-tier::before,
.lv-banner-tier::after {
  content: "";
  width: ${x.banner.ruleW}px;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--rp));
}
.lv-banner-tier::after { background: linear-gradient(90deg, var(--rp), transparent); }

.lv-banner.is-show { animation: lv-banner-in ${x.bannerMs}ms cubic-bezier(0.22, 1, 0.36, 1); }
@keyframes lv-banner-in {
  0% { opacity: 0; transform: translateX(-50%) translateY(${x.banner.dropY}px) scale(0.82); }
  16% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.06); }
  30% { transform: translateX(-50%) translateY(0) scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateX(-50%) translateY(-6px) scale(1.01); }
}
@keyframes lv-text-sheen {
  0% { background-position: 130% 0; }
  100% { background-position: -30% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .lv-banner.is-show { animation-duration: 0.01ms; }
  .lv-banner-main { animation: none; }
}
`;

/* ------------------------------------------------------------------ *
 * CSS değişkeni köprüsü — accent türevleri burada TEK yerde üretilir
 * ------------------------------------------------------------------ */
function rankVars(pct: number, color: string): Record<string, string> {
  const r = x.rank;
  return {
    '--p': pct.toFixed(2),
    '--rp': color,
    '--rp-dim': shadeColor(color, r.dimAmount),
    '--rp-lite': tintColor(color, r.liteAmount),
    '--rp-soft': alphaOf(color, r.softAlpha),
    '--rp-glow': alphaOf(color, r.glowAlpha),
    '--rp-chip-bg': alphaOf(color, r.chipBgAlpha),
    '--rp-chip-border': alphaOf(color, r.chipBorderAlpha),
    '--rp-chip-glow': alphaOf(color, r.chipGlowAlpha),
  };
}

/** Özel CSS değişkenlerini React style nesnesine çevirir (TS index imzası yok). */
function toStyle(vars: Record<string, string>): CSSProperties {
  return vars as unknown as CSSProperties;
}

/** Canlı düğüme rank değişkenlerini yazar (HUD rAF'ı bunu kullanır). */
export function applyRankVars(el: HTMLElement, pct: number, color: string): void {
  for (const [k, v] of Object.entries(rankVars(pct, color))) el.style.setProperty(k, v);
}

/** İlerleme yüzdesi (0..100) — tek formül HUD ve menüde aynı. */
export function pctOf(into: number, needed: number): number {
  return needed > 0 ? Math.min(100, (into / needed) * 100) : 100;
}

/* ------------------------------------------------------------------ *
 * Bileşenler
 * ------------------------------------------------------------------ */

/** HUD'ın rAF'ı ile yazdığı iç düğümler (React re-render olmadan güncellenir). */
export interface RankHandles {
  root: RefObject<HTMLDivElement | null>;
  dial: RefObject<HTMLSpanElement | null>; // halka → is-up sınıfı
  dialNum: RefObject<HTMLSpanElement | null>; // seviye rakamı
  tier: RefObject<HTMLSpanElement | null>; // unvan
  rail: RefObject<HTMLDivElement | null>; // ray → is-up sınıfı
  into: RefObject<HTMLSpanElement | null>; // mevcut XP
  need: RefObject<HTMLSpanElement | null>; // gereken XP
}

export function useRankHandles(): RankHandles {
  return {
    root: useRef<HTMLDivElement>(null),
    dial: useRef<HTMLSpanElement>(null),
    dialNum: useRef<HTMLSpanElement>(null),
    tier: useRef<HTMLSpanElement>(null),
    rail: useRef<HTMLDivElement>(null),
    into: useRef<HTMLSpanElement>(null),
    need: useRef<HTMLSpanElement>(null),
  };
}

function Dial({
  dialRef,
  numRef,
  level,
  chip,
}: {
  dialRef?: Ref<HTMLSpanElement>;
  numRef?: Ref<HTMLSpanElement>;
  level?: number;
  chip?: boolean;
}) {
  return (
    <span className={`lv-dial${chip ? ' lv-dial--chip' : ''}`} ref={dialRef} aria-hidden="true">
      <span className="lv-dial-core">
        <b className="lv-dial-num" ref={numRef} data-hud="level">
          {level ?? 1}
        </b>
      </span>
      <span className="lv-dial-head" />
    </span>
  );
}

function Rail({ railRef }: { railRef: Ref<HTMLDivElement> }) {
  const n = x.rail.notchCount;
  return (
    <div className="lv-rail" ref={railRef} aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="lv-notch" style={{ left: `${((i + 1) / (n + 1)) * 100}%` }} />
      ))}
      <div className="lv-rail-fill">
        <span className="lv-sheen" />
      </div>
      <span className="lv-rail-head" />
    </div>
  );
}

/** HUD'daki tam rank paneli (madalyon + unvan + ray). */
export function XpPanel({ h }: { h: RankHandles }) {
  return (
    <section className="lv-panel" ref={h.root} aria-label="Seviye ilerlemesi" data-hud="xp-panel">
      <Dial dialRef={h.dial} numRef={h.dialNum} />
      <div className="lv-main">
        <div className="lv-row">
          <span className="lv-tier" ref={h.tier} data-hud="tier">
            {x.tiers[0]}
          </span>
          <span className="lv-nums" data-hud="xptext">
            <b className="lv-num-in" ref={h.into}>
              0
            </b>
            <span className="lv-num-of">
              / <span ref={h.need}>{xpForLevel(1)}</span>{' '}
              <span className="lv-num-unit">{x.row.unit}</span>
            </span>
          </span>
        </div>
        <Rail railRef={h.rail} />
      </div>
    </section>
  );
}

/** Giriş menüsü rank çipi (ad etiketinin sağında) — statik, mount'ta okur. */
export function LevelChip({ level, into, needed }: { level: number; into: number; needed: number }) {
  const pct = pctOf(into, needed);
  return (
    <span
      className="lv-chip"
      data-menu="level"
      style={toStyle(rankVars(pct, rankColor(level)))}
      title={`${tierFor(level)} · %${Math.floor(pct)}`}
    >
      <Dial chip level={level} />
      <span className="lv-tier">{tierFor(level)}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * LEVEL UP BANDI
 * ------------------------------------------------------------------ */
export interface BannerHandles {
  root: RefObject<HTMLDivElement | null>;
  main: RefObject<HTMLSpanElement | null>;
  tier: RefObject<HTMLSpanElement | null>;
}

export function useBannerHandles(): BannerHandles {
  return {
    root: useRef<HTMLDivElement>(null),
    main: useRef<HTMLSpanElement>(null),
    tier: useRef<HTMLSpanElement>(null),
  };
}

export function LevelBanner({ h }: { h: BannerHandles }) {
  return (
    <div className="lv-banner" ref={h.root} data-hud="levelup" aria-live="polite">
      <span className="lv-banner-main" ref={h.main} data-hud="levelup-main">
        LEVEL 1
      </span>
      <span className="lv-banner-tier" ref={h.tier} data-hud="levelup-tier">
        {x.tiers[0]}
      </span>
    </div>
  );
}

/** Bandı doldurur + animasyonu yeniden tetikler (aynı seviye için de oynar). */
export function showLevelUp(h: BannerHandles, level: number): void {
  const el = h.root.current;
  if (!el) return;
  applyRankVars(el, 100, rankColor(level));
  if (h.main.current) h.main.current.textContent = `LEVEL ${level}`;
  if (h.tier.current) h.tier.current.textContent = tierFor(level);
  el.classList.remove('is-show');
  void el.offsetWidth; // reflow → animasyonu yeniden başlat
  el.classList.add('is-show');
}
