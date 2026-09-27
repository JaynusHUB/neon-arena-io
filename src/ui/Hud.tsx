/**
 * ui/Hud.tsx — Oyun içi HUD overlay (React sadece HUD için).
 *
 * TASARIM: İKİ MODÜL, TEK KABUK (dashboard kart yığını değil).
 * - Sol: tek panel, iki zon → üstte SKOR OKUMASI (hero skor ⟵ saç teli ⟶
 *   SIZE + COIN ikincil sütunlar), altta tam taşmalı RANK DESTESİ
 *   (madalyon + unvan + ray). İki ayrı kutu yerine tek gövde → daha az
 *   alan, net hiyerarşi.
 * - Sağ: LEADERBOARD — başlık + gradyan kural + canlı oyuncu sayacı,
 *   1. sıra altın, YOU satırı kutu değil sol aksan işareti.
 * - Kabuk: mor-siyah cam (beyaz grid üzerinde griye çalmasın diye yüksek
 *   opaklık) + saç teli kenar + üstte nefes alan neon hat. Menü panel dili
 *  yle aynı yüzey, aynı tipografi ölçeği.
 * - pointer-events: NONE → fare oyunun altından geçer; ekran ortası açık.
 * - Renk/boyut/animasyon: theme/visualTheme.ts (hardcoded hex/px yok)
 * - Rank ünitesi (madalyon/ray/band/çip) → ui/LevelMeter.tsx
 *
 * Kancalar (test köprüsü): data-hud = root / score-panel / score / size /
 * coin / leaderboard / lb-row + `hud-bump` keyframe adı.
 *
 * ui-styling skill ilkeleri: design token'lar, görsel hiyerarşi
 * (label → value), erişilebilir semantic HTML (section/aside/h2/ol/li),
 * compact breakpoint, tabular-nums (titreşim yok).
 */
import { useEffect, useRef } from 'react';
import type { Game } from '../game/Game';
import { visualTheme } from '../theme/visualTheme';
import { tierFor, rankColor } from '../progression/xp';
import { buildLeaderboardRows, ROW_COUNT } from './leaderboard';
import {
  XpPanel,
  LevelBanner,
  useRankHandles,
  useBannerHandles,
  applyRankVars,
  showLevelUp,
  pctOf,
  levelMeterCss,
} from './LevelMeter';

const t = visualTheme.hud;
const xp = visualTheme.xp;

/** Tüm değerler theme'den — bu blok tek kaynaktan üretilir.
 *  (export: kaba/kompact yerleşim doğrulama harness'i bunu gömerek ölçer.) */
export const hudCss = `
.hud-root {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 10;
  pointer-events: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${t.statsGap}px;
  padding-top: calc(${t.edge}px + env(safe-area-inset-top));
  padding-left: calc(${t.edge}px + env(safe-area-inset-left));
  padding-right: calc(${t.edge}px + env(safe-area-inset-right));
  font-family: ${t.fontFamily};
}

/* ---- ORTAK KABUK (iki modül tek sözleşme) ---- */
.hud-panel {
  position: relative;
  pointer-events: none;
  background: ${t.shell.bg};
  border: ${t.shell.border};
  border-radius: ${t.shell.radius}px;
  padding: ${t.shell.padY}px ${t.shell.padX}px;
  box-shadow: ${t.shell.shadow};
  backdrop-filter: blur(${t.blur}px);
  -webkit-backdrop-filter: blur(${t.blur}px);
}
/* üst kenar ışığı — panelin imza detayı; nefes ritmiyle canlı (layout yok).
 * Dışa doğru hafif neon hale: iki modülü tek tasarım olarak bağlayan detay. */
.hud-lit {
  position: absolute;
  top: 0;
  left: ${t.shell.litInset}px;
  right: ${t.shell.litInset}px;
  height: ${t.shell.litH}px;
  background: ${t.shell.lit};
  box-shadow: ${t.shell.litShadow};
  animation: hud-lit-breathe ${t.shell.litMs}ms ease-in-out infinite;
}
/* sağ modülde ışık dış (sağ) kenardan başlar → simetri */
.hud-board .hud-lit { transform: scaleX(-1); }
@keyframes hud-lit-breathe {
  0%, 100% { opacity: 1; }
  50% { opacity: ${t.shell.litMin}; }
}

/* ---- SKOR OKUMASI: hero ⟵ ayraç ⟶ ikincil ---- */
.hud-readout { display: flex; align-items: flex-end; gap: ${t.statsGap}px; }
.hud-hero { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.hud-side { display: flex; align-items: flex-end; gap: ${t.sideGap}px; }
.hud-stat { display: flex; flex-direction: column; gap: 3px; }
.hud-vdiv {
  width: 1px;
  align-self: stretch;
  margin: 2px 0;
  background: ${t.vDivider};
}

.hud-label {
  font-size: ${t.label.size}px;
  letter-spacing: ${t.label.tracking};
  font-weight: ${t.label.weight};
  color: ${t.label.color};
  line-height: 1;
  white-space: nowrap;
}

.hud-value {
  font-family: ${t.monoFamily};
  font-variant-numeric: tabular-nums;
  line-height: 1.04;
  display: inline-block;
  transform-origin: left bottom;
  white-space: nowrap;
}
.hud-value--score {
  font-size: ${t.scoreValue.size}px;
  font-weight: ${t.scoreValue.weight};
  color: ${t.scoreValue.color};
  text-shadow: ${t.scoreValue.glow};
  letter-spacing: 0.005em;
}
.hud-value--size {
  font-size: ${t.sizeValue.size}px;
  font-weight: ${t.sizeValue.weight};
  color: ${t.sizeValue.color};
  text-shadow: ${t.sizeValue.glow};
}
.hud-value--coin {
  font-size: ${t.coinValue.size}px;
  font-weight: ${t.coinValue.weight};
  color: ${t.coinValue.color};
  text-shadow: ${t.coinValue.glow};
}
.hud-coin-bump { animation: hud-coin-bump ${t.coinBump.ms}ms ${t.coinBump.easing}; }
@keyframes hud-coin-bump {
  0% { transform: scale(1); }
  32% { transform: scale(${t.coinBump.scale}); }
  100% { transform: scale(1); }
}
@keyframes hud-bump { 0% { transform: scale(1); } 45% { transform: scale(${t.bump.scale}); } 100% { transform: scale(1); } }
.hud-bump { animation: hud-bump ${t.bump.ms} ${t.bump.easing}; }
@media (prefers-reduced-motion: reduce) {
  .hud-bump, .hud-coin-bump, .hud-lit { animation: none; }
}

/* ---- RANK DESTESİ: panelin alt bloğu (tam taşmalı kuyu, ayrı kutu değil) ---- */
.hud-deck {
  position: relative;
  margin: ${t.deck.gap}px ${-t.shell.padX}px ${-t.shell.padY}px;
  padding: ${t.deck.padY}px ${t.deck.padX}px;
  background: ${t.deck.bg};
  border-radius: 0 0 ${t.shell.radius - 1}px ${t.shell.radius - 1}px;
}
.hud-deck::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: ${t.deck.line};
}

/* ---- LEADERBOARD ---- */
.hud-board { width: ${t.boardWidth}px; }
.hud-board-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${t.titleGap}px;
}
.hud-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: ${t.title.size}px;
  letter-spacing: ${t.title.tracking};
  font-weight: ${t.title.weight};
  color: ${t.title.color};
  line-height: 1;
  white-space: nowrap;
}
.hud-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${t.liveDot.color};
  box-shadow: ${t.liveDot.glow};
  animation: hud-pulse ${t.liveDot.pulseMs}ms ease-in-out infinite;
}
.hud-count {
  font-family: ${t.monoFamily};
  font-variant-numeric: tabular-nums;
  font-size: ${t.count.size}px;
  letter-spacing: ${t.count.tracking};
  color: ${t.count.dim};
  white-space: nowrap;
}
.hud-count b { color: ${t.count.color}; font-weight: 700; }
.hud-rule { height: 1px; margin: 7px 0 6px; background: ${t.headRule}; }

.hud-rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: ${t.row.gap}px; }
.hud-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: ${t.row.nameGap}px;
  font-size: ${t.row.size}px;
  line-height: 1.2;
  color: ${t.row.color};
  padding: ${t.row.padY}px ${t.row.padX}px;
  border-radius: 6px;
}
.hud-rank {
  color: ${t.row.rankColor};
  width: ${t.row.rankW}px;
  text-align: right;
  font-family: ${t.monoFamily};
  font-variant-numeric: tabular-nums;
}
.hud-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: 0.03em; }
.hud-pts { font-family: ${t.monoFamily}; font-variant-numeric: tabular-nums; color: ${t.row.scoreColor}; }

/* zirve: 1. sıra altın (evrensel oyun okuma dili) */
.hud-row.is-top .hud-rank { color: ${t.row.top1}; font-weight: 700; text-shadow: ${t.row.top1Glow}; }
/* YOU: kutu yerine sol aksan işareti + hafif dolgu */
.hud-row.is-you { background: ${t.you.bg}; }
.hud-row.is-you .hud-name { color: ${t.you.nameColor}; font-weight: 700; }
.hud-row.is-you::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 3px;
  bottom: 3px;
  width: 2px;
  border-radius: 2px;
  background: ${t.you.tick};
  box-shadow: ${t.you.tickGlow};
}

@keyframes hud-pulse { 0%, 100% { opacity: 1; } 50% { opacity: ${t.liveDot.minOpacity}; } }

/* ---- KOMPACT: iki modül ≤380px ekranda yan yana sığar ---- */
@media (max-width: ${t.compact.breakpoint}px) {
  .hud-root {
    gap: ${t.compact.statsGap}px;
    padding-top: calc(${t.compact.edge}px + env(safe-area-inset-top));
    padding-left: calc(${t.compact.edge}px + env(safe-area-inset-left));
    padding-right: calc(${t.compact.edge}px + env(safe-area-inset-right));
  }
  .hud-panel { padding: ${t.compact.panelPadY}px ${t.compact.panelPadX}px; }
  .hud-readout { gap: ${t.compact.statsGap}px; }
  .hud-side { gap: ${t.compact.sideGap}px; }
  .hud-value--score { font-size: ${t.compact.scoreSize}px; }
  .hud-value--size, .hud-value--coin { font-size: ${t.compact.sideSize}px; }
  .hud-deck {
    margin: ${t.compact.deckGap}px ${-t.compact.panelPadX}px ${-t.compact.panelPadY}px;
    padding: ${t.compact.deckPadY}px ${t.compact.deckPadX}px;
  }
  .hud-board { width: ${t.compact.boardWidth}px; }
  .hud-board-head { gap: ${t.compact.headGap}px; }
  .hud-title { font-size: ${t.compact.titleSize}px; letter-spacing: ${t.compact.titleTracking}; }
  /* canlı sayacı gizle: başlık tek başına sığsun (sayı zaten tabloda) */
  .hud-count { display: none; }
  .hud-row { font-size: ${t.compact.rowSize}px; }
  /* rank destesi dar ölçek (LevelMeter tokenlarını ezer — bu blok sonra basılır) */
  .hud-deck .lv-dial {
    --lv-size: ${t.compact.dialSize}px;
    --lv-value-size: ${t.compact.dialValue}px;
  }
  .hud-deck .lv-main { min-width: ${t.compact.railMinW}px; }
  .hud-deck .lv-row { gap: ${t.compact.deckRowGap}px; }
  .hud-deck .lv-tier { font-size: ${t.compact.tierSize}px; }
  .hud-deck .lv-nums { font-size: ${t.compact.numSize}px; }
}
`;

function formatScore(score: number): string {
  return score.toLocaleString('en-US');
}

/** madde → "×1.0" / "×4.7" / "×105" (baseMass = 100 → 1.0×) */
function formatSize(mass: number): string {
  const mul = mass / visualTheme.growth.baseMass;
  if (mul >= 100) return `×${Math.round(mul).toLocaleString('en-US')}`;
  return `×${mul.toFixed(1)}`;
}

export function Hud({ game }: { game: Game }) {
  const scoreRef = useRef<HTMLSpanElement>(null);
  const sizeRef = useRef<HTMLSpanElement>(null);
  const coinRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLElement>(null);
  const rowsRef = useRef<HTMLOListElement>(null);
  const rank = useRankHandles();
  const banner = useBannerHandles();

  useEffect(() => {
    let raf = 0;
    let lastKey = '';
    let lastLevel = -1;
    let bannerUntil = 0;

    // Oyun döngüsünden BAĞIMSIZ rAF: yalnızca değişince DOM'u yaz (React re-render yok)
    const tick = () => {
      const snap = game.getHudSnapshot();
      const key = `${snap.score}|${snap.mass}|${snap.coins}|${snap.xp.level}|${snap.xp.into}|${snap.entries.map((e) => e.mass).join(',')}`;
      if (key !== lastKey) {
        lastKey = key;

        const scoreEl = scoreRef.current;
        const scoreText = formatScore(snap.score);
        if (scoreEl && scoreEl.textContent !== scoreText) {
          scoreEl.textContent = scoreText;
          // Skor pop geri bildirimi (sessiz aksiyon yok)
          scoreEl.classList.remove('hud-bump');
          void scoreEl.offsetWidth; // reflow → animasyonu yeniden tetikle
          scoreEl.classList.add('hud-bump');
        }

        if (sizeRef.current) sizeRef.current.textContent = formatSize(snap.mass);

        if (coinRef.current) {
          const coinText = formatScore(snap.coins);
          if (coinRef.current.textContent !== coinText) {
            coinRef.current.textContent = coinText;
            // Coin artışı pop (ölüm ödülü sessiz kalmasın)
            coinRef.current.classList.remove('hud-coin-bump');
            void coinRef.current.offsetWidth;
            coinRef.current.classList.add('hud-coin-bump');
          }
        }

        // canlı oyuncu sayacı (başlık sağı)
        if (countRef.current) {
          const countText = String(snap.entries.length);
          if (countRef.current.textContent !== countText) countRef.current.textContent = countText;
        }

        // RANK ÜNİTESİ: madalyon halkası + unvan + ray (accent = kilometre taşı)
        const rankUp = lastLevel !== -1 && snap.xp.level > lastLevel;
        const rankRoot = rank.root.current;
        if (rankRoot) applyRankVars(rankRoot, pctOf(snap.xp.into, snap.xp.needed), rankColor(snap.xp.level));
        if (rank.dialNum.current) {
          const lv = String(snap.xp.level);
          if (rank.dialNum.current.textContent !== lv) rank.dialNum.current.textContent = lv;
        }
        if (rank.tier.current) {
          const tn = tierFor(snap.xp.level);
          if (rank.tier.current.textContent !== tn) rank.tier.current.textContent = tn;
        }
        if (rank.into.current) {
          const into = snap.xp.into.toLocaleString('en-US');
          if (rank.into.current.textContent !== into) rank.into.current.textContent = into;
        }
        if (rank.need.current) {
          const need = snap.xp.needed.toLocaleString('en-US');
          if (rank.need.current.textContent !== need) rank.need.current.textContent = need;
        }
        if (rankUp) {
          // Madalyon pop + şok dalgası, rayda beyaz parlama
          for (const el of [rank.dial.current, rank.rail.current]) {
            if (!el) continue;
            el.classList.remove('is-up');
            void el.offsetWidth;
            el.classList.add('is-up');
          }
        }

        // LEVEL UP BANDI — seviye yükselince gradient metin + unvan belirir
        if (rankUp) {
          showLevelUp(banner, snap.xp.level);
          bannerUntil = performance.now() + xp.bannerMs;
        }
        lastLevel = snap.xp.level;
        if (banner.root.current && bannerUntil > 0 && performance.now() > bannerUntil) {
          banner.root.current.classList.remove('is-show');
          bannerUntil = 0;
        }

        const rows = buildLeaderboardRows(snap.entries);
        const items = rowsRef.current?.children;
        if (items) {
          for (let i = 0; i < items.length; i++) {
            const li = items[i];
            const row = rows[i];
            if (!row || li.children.length < 3) continue;
            li.children[0].textContent = String(i + 1);
            li.children[1].textContent = row.name;
            li.children[2].textContent = formatSize(row.mass);
            li.classList.toggle('is-you', row.isYou);
            li.classList.toggle('is-top', i === 0);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [game]);

  return (
    <>
      {/* LevelMeter önce: eş özgüllükte hudCss kazansın (kompact ezmeler) */}
      <style>{levelMeterCss}</style>
      <style>{hudCss}</style>
      <div className="hud-root" data-hud="root">
        {/* Sol: tek modül — skor okumu + rank destesi */}
        <section className="hud-panel hud-vitals" aria-label="Player stats" data-hud="score-panel">
          <span className="hud-lit" aria-hidden="true" />
          <div className="hud-readout">
            <div className="hud-hero">
              <span className="hud-label">SCORE</span>
              <span className="hud-value hud-value--score" data-hud="score" ref={scoreRef}>
                0
              </span>
            </div>
            <span className="hud-vdiv" aria-hidden="true" />
            <div className="hud-side">
              <div className="hud-stat">
                <span className="hud-label">SIZE</span>
                <span className="hud-value hud-value--size" data-hud="size" ref={sizeRef}>
                  ×1.0
                </span>
              </div>
              <div className="hud-stat">
                <span className="hud-label">COIN</span>
                <span className="hud-value hud-value--coin" data-hud="coin" ref={coinRef}>
                  0
                </span>
              </div>
            </div>
          </div>
          <div className="hud-deck">
            <XpPanel h={rank} />
          </div>
        </section>

        {/* Sağ: leaderboard — gerçek Player + Bot skorları (canlı) */}
        <aside className="hud-panel hud-board" aria-label="Leaderboard" data-hud="leaderboard">
          <span className="hud-lit" aria-hidden="true" />
          <div className="hud-board-head">
            <h2 className="hud-title">
              <span className="hud-live-dot" aria-hidden="true" />
              LEADERBOARD
            </h2>
            <span className="hud-count" aria-label="Canlı oyuncu">
              <b ref={countRef}>61</b> ALIVE
            </span>
          </div>
          <div className="hud-rule" aria-hidden="true" />
          {/* Sabit ROW_COUNT yuva — metinleri oyun rAF tick'inde doldurulur */}
          <ol className="hud-rows" ref={rowsRef}>
            {Array.from({ length: ROW_COUNT }, (_, i) => (
              <li key={i} className="hud-row" data-hud="lb-row">
                <span className="hud-rank">{i + 1}</span>
                <span className="hud-name" />
                <span className="hud-pts" />
              </li>
            ))}
          </ol>
        </aside>
      </div>
      {/* LEVEL UP bandı — seviye atlayınca gradient metin + unvan belirir */}
      <LevelBanner h={banner} />
    </>
  );
}
