/**
 * ui/StartScreen.tsx — Oyuna giriş menüsü ("Arena Gate", ULTRATHINK revizyonu).
 *
 * Tek panelde akış: BAŞLIK → AD → MOD → SKIN → PLAY (progressive disclosure).
 * Arkada MenuBackdrop canlı canvas (kayan grid + blob'lar). Bölümler kademeli
 * fade-up ile girer (interaction-design 200-300ms bandı), PLAY birincil CTA.
 * Skin seçimi ANINDA uygulanır (game.setSkin — kart önizlemede görünür).
 * Karanlık neon dil (skin.menu + hud token'ları); input/PLAY butonu
 * startScreen token'larıyla (yüksek kontrast). data-start kancaları korunur.
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Game } from '../game/Game';
import { visualTheme } from '../theme/visualTheme';
import { xpProgress, getTotalXP } from '../progression/xp';
import { MenuBackdrop } from './MenuBackdrop';
import { SkinGrid } from './SkinGrid';
import { LevelChip, levelMeterCss } from './LevelMeter';

const s = visualTheme.startScreen;
const m = visualTheme.skin.menu;
const e = visualTheme.entryMenu;
const hud = visualTheme.hud;
/** Köşe "GitHub'da yıldızla" düğmesi — tüm değerler temadan */
const g = visualTheme.startScreen.github;

const entryCss = `
.entry-root {
  position: fixed;
  inset: 0;
  z-index: 20;
  overflow-y: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: ${hud.fontFamily};
}
.entry-bg { position: fixed; inset: 0; width: 100%; height: 100%; }

.entry-panel {
  position: relative;
  width: 100%;
  max-width: ${m.panelMaxW}px;
  max-height: 94vh;
  overflow-y: auto;
  background: ${m.panelBg};
  border: ${m.panelBorder};
  border-radius: ${m.panelRadius}px;
  box-shadow: ${m.panelShadow};
  padding: ${m.panelPadY}px ${m.panelPadX}px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: ${e.sectionGap}px;
  animation: entry-pop ${m.transitionMs}ms ${m.easing};
}

.entry-title {
  margin: 0;
  text-align: center;
  color: ${m.title.color};
  font-size: ${s.title.size}px;
  font-weight: ${m.title.weight};
  letter-spacing: ${m.title.tracking};
  text-indent: ${m.title.tracking};
  line-height: 1.1;
  text-shadow: ${hud.scoreValue.glow};
}
.entry-sub {
  margin: -12px 0 0;
  text-align: center;
  color: ${m.subtitle.color};
  font-size: ${m.subtitle.size}px;
}
/* Kaynak bağlantısı — sadece kaynak kod (açık kaynak beyanı) */
.entry-source {
  margin-top: 6px;
  text-align: center;
  color: ${m.subtitle.color};
  font-size: ${Math.max(10, Math.round(m.subtitle.size * 0.78))}px;
  opacity: 0.55;
  text-decoration: none;
  border-bottom: 1px dotted currentColor;
  padding-bottom: 1px;
  transition: opacity ${e.enterMs}ms ${e.easing};
}
.entry-source:hover { opacity: 1; }

/* ============ KÖŞE: "GitHub'da yıldızla" düğmesi ============
   Tasarım: Uiverse "Star on GitHub" (Kaizen0000) — dönen konik halka,
   parlama süpürmesi, hover'da dolan altın yıldız, tıklamada kıvılcım
   patlaması. Renkler oyunun neon kimliğine eşlendi; değerler tema'da
   (startScreen.github) — burada hardcoded renk YOK. */
.gh-btn {
  position: fixed;
  right: ${g.edge}px;
  bottom: ${g.edge}px;
  z-index: 30;
  display: inline-flex;
  height: ${g.height}px;
  align-items: center;
  gap: 11px;
  padding: 0 ${g.padX}px;
  border-radius: ${g.radius}px;
  text-decoration: none;
  cursor: pointer;
  outline: none;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;
}
/* Dönen konik halka: dev iç eleman döner → sadece kenarda gradient görünür */
.gh-ring {
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  overflow: hidden;
  opacity: ${g.ringOpacity};
  pointer-events: none;
  z-index: 0;
  transition: opacity 500ms ${e.easing};
}
.gh-spin {
  position: absolute;
  inset: -1000%;
  background: conic-gradient(from 90deg at 50% 50%, ${g.ringIdle[0]} 0%, ${g.ringIdle[1]} 50%, ${g.ringIdle[2]} 100%);
  animation: gh-spin ${g.ringSpinSec}s linear infinite;
  transition: background 500ms ${e.easing};
}
.gh-btn:hover .gh-ring, .gh-btn:focus-visible .gh-ring { opacity: ${g.ringOpacityHover}; }
.gh-btn:hover .gh-spin, .gh-btn:focus-visible .gh-spin {
  background: conic-gradient(from 90deg at 50% 50%, ${g.ringHover[0]} 0%, ${g.ringHover[1]} 50%, ${g.ringHover[2]} 100%);
}
/* Gövde + parlama süpürmesi */
.gh-body {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: ${g.bg};
  box-shadow: ${g.insetShadow}, ${g.dropShadow};
  overflow: hidden;
  transition: background 300ms ${e.easing};
  z-index: 0;
}
.gh-btn:hover .gh-body, .gh-btn:focus-visible .gh-body { background: ${g.bgHover}; }
.gh-shine {
  position: absolute;
  top: 0;
  left: 0;
  width: 150%;
  height: 100%;
  transform: translateX(-150%) skewX(-12deg);
  background: linear-gradient(90deg, transparent, ${g.shine}, transparent);
  pointer-events: none;
}
.gh-btn:hover .gh-shine, .gh-btn:focus-visible .gh-shine {
  animation: gh-shine ${g.shineMs}ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
/* Ikon + yazi - KONUMLU OLMALI (backtick kullanma: bu bir template literal).
   .gh-body mutlak konumlu (z-index:0); CSS katman sirasinda konumsuz
   satir-ici ogelerin USTUNE cizilir. Yildiz position:relative oldugu icin
   zaten gorunuyordu; ikon/ayrac/yazi ise koyu govdenin arkasinda kaliyordu. */
.gh-icon, .gh-div, .gh-text { position: relative; z-index: 2; }
.gh-icon { width: ${g.iconSize}px; height: ${g.iconSize}px; color: ${g.iconColor}; transition: color 500ms ${e.easing}; flex: none; }
.gh-btn:hover .gh-icon, .gh-btn:focus-visible .gh-icon { color: ${g.iconColorHover}; }
.gh-div { width: 1px; height: ${Math.round(g.height * 0.45)}px; background: ${g.divider}; transition: background 500ms ${e.easing}; flex: none; }
.gh-btn:hover .gh-div, .gh-btn:focus-visible .gh-div { background: ${g.dividerHover}; }
.gh-text {
  font-size: ${g.textSize}px;
  font-weight: ${g.textWeight};
  letter-spacing: 0.02em;
  color: ${g.textColor};
  white-space: nowrap;
  transition: color 500ms ${e.easing};
}
.gh-btn:hover .gh-text, .gh-btn:focus-visible .gh-text { color: ${g.textColorHover}; }
/* Yıldız: boş kontur → hover'da dolu altın */
.gh-star { position: relative; z-index: 2; width: ${g.starSize}px; height: ${g.starSize}px; flex: none; }
.gh-star-out {
  position: absolute; inset: 0; color: ${g.starIdle};
  transition: opacity 500ms ${e.easing}, transform 500ms cubic-bezier(0.16, 1, 0.3, 1);
}
.gh-star-fill {
  position: absolute; inset: 0; color: ${g.starHover}; opacity: 0;
  filter: drop-shadow(0 0 10px ${g.starGlow});
  transition: opacity 500ms ${e.easing}, transform 500ms cubic-bezier(0.16, 1, 0.3, 1);
}
.gh-btn:hover .gh-star-out, .gh-btn:focus-visible .gh-star-out { opacity: 0; transform: scale(0.5) rotate(-45deg); }
.gh-btn:hover .gh-star-fill, .gh-btn:focus-visible .gh-star-fill { opacity: 1; transform: scale(1) rotate(0deg); }
/* TIKLAMA: halka nabzı + 8 kıvılcım */
.gh-burst {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid ${g.burstColor}; opacity: 0; pointer-events: none;
}
.gh-spark {
  position: absolute; top: 50%; left: 50%;
  width: 6px; height: 6px; margin: -3px 0 0 -3px;
  border-radius: 50%; background: ${g.starHover};
  box-shadow: 0 0 8px ${g.starGlow};
  opacity: 0; pointer-events: none;
}
.gh-btn:active .gh-burst { animation: gh-pulse ${g.burstMs}ms ease-out; }
.gh-btn:active .gh-spark { animation: gh-fly ${g.burstMs}ms cubic-bezier(0.16, 1, 0.3, 1); }
/* 8 yön — nth-child ile (JSX'de tek bir kıvılcım yazmak yeter) */
.gh-spark:nth-child(1) { --dx:  0px;  --dy: -${g.burstFly}px; }
.gh-spark:nth-child(2) { --dx:  ${Math.round(g.burstFly * 0.71)}px;  --dy: -${Math.round(g.burstFly * 0.71)}px; }
.gh-spark:nth-child(3) { --dx:  ${g.burstFly}px;  --dy: 0px; }
.gh-spark:nth-child(4) { --dx:  ${Math.round(g.burstFly * 0.71)}px;  --dy: ${Math.round(g.burstFly * 0.71)}px; }
.gh-spark:nth-child(5) { --dx:  0px;  --dy: ${g.burstFly}px; }
.gh-spark:nth-child(6) { --dx: -${Math.round(g.burstFly * 0.71)}px;  --dy: ${Math.round(g.burstFly * 0.71)}px; }
.gh-spark:nth-child(7) { --dx: -${g.burstFly}px;  --dy: 0px; }
.gh-spark:nth-child(8) { --dx: -${Math.round(g.burstFly * 0.71)}px;  --dy: -${Math.round(g.burstFly * 0.71)}px; }

@keyframes gh-spin { to { transform: rotate(360deg); } }
@keyframes gh-shine { to { transform: translateX(100%) skewX(-12deg); } }
@keyframes gh-pulse {
  0%   { opacity: 0.9; transform: scale(1); }
  100% { opacity: 0; transform: scale(${g.burstRingScale}); }
}
@keyframes gh-fly {
  0%   { opacity: 1; transform: translate(0, 0) scale(1); }
  100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.4); }
}

@media (max-width: 640px) {
  .gh-btn { right: ${g.edgeCompact}px; bottom: ${g.edgeCompact}px; height: ${g.heightCompact}px; padding: 0 ${g.padXCompact}px; gap: 8px; }
  .gh-icon { width: ${g.iconSizeCompact}px; height: ${g.iconSizeCompact}px; }
  .gh-star { width: ${g.starSizeCompact}px; height: ${g.starSizeCompact}px; }
  .gh-text { font-size: ${Math.round(g.textSize * 0.85)}px; }
  .gh-spark { display: none; }  /* küçük ekranda kıvılcım gürültüsü olmasın */
}

.entry-sec { display: flex; flex-direction: column; gap: 8px; }
.entry-anim { animation: entry-up ${e.enterMs}ms ${e.easing} backwards; }
/* AD satırı: etiket solda, rank çipi sağda (optik denge) */
.entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.entry-label {
  color: ${hud.label.color};
  font-size: ${hud.label.size}px;
  letter-spacing: ${hud.label.tracking};
  font-weight: ${hud.label.weight};
}

.entry-input {
  width: 100%;
  padding: ${s.input.padY}px ${s.input.padX}px;
  font-size: ${s.input.size}px;
  color: ${s.input.color};
  background: ${s.input.bg};
  border: ${s.input.border};
  border-radius: ${s.input.radius}px;
  outline: none;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.entry-input::placeholder { color: ${s.input.placeholderColor}; }
.entry-input:focus {
  border: ${s.input.focusBorder};
  box-shadow: ${s.input.focusGlow};
}

.start-play {
  margin-top: 2px;
  min-width: ${s.button.minW}px;
  min-height: ${s.button.minH}px;
  width: 100%;
  padding: 0 26px;
  font-size: ${s.button.size}px;
  font-weight: ${s.button.weight};
  letter-spacing: ${s.button.tracking};
  text-indent: ${s.button.tracking};
  color: ${s.button.color};
  background: ${s.button.bg};
  border: ${s.button.border};
  border-radius: ${s.button.radius}px;
  box-shadow: ${s.button.shadow};
  cursor: pointer;
  transition: background 140ms ease, transform ${s.button.pressMs}ms ease, box-shadow ${s.button.pressMs}ms ease;
}
.start-play:hover { background: ${s.button.hoverBg}; }
.start-play:active {
  background: ${s.button.activeBg};
  transform: translateY(${s.button.pressPx}px);
  box-shadow: ${s.button.pressShadow};
}
.start-play:focus-visible {
  outline: 3px solid ${visualTheme.color.playerStroke};
  outline-offset: 3px;
}

.entry-hints {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 14px;
  color: ${m.hint.color};
  font-size: ${m.hint.size}px;
}
.entry-kbd {
  display: inline-block;
  background: ${e.kbd.bg};
  border: ${e.kbd.border};
  border-radius: ${e.kbd.radius}px;
  color: ${e.kbd.color};
  font-size: ${e.kbd.size}px;
  padding: ${e.kbd.padY}px ${e.kbd.padX}px;
  margin-right: 4px;
  font-family: ${hud.monoFamily};
}

@keyframes entry-pop { from { opacity: 0; transform: scale(0.97) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
@keyframes entry-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .entry-panel, .entry-anim { animation: none; }
}
`;

/** Menü rank çipi — ad etiketinin sağında (kalıcı seviye, mount'ta okunur). */
function LevelBadge() {
  const [snap] = useState(() => xpProgress(getTotalXP()));
  return <LevelChip level={snap.level} into={snap.into} needed={snap.needed} />;
}

export function StartScreen({ game }: { game: Game }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(true);
  const [savedName] = useState(() => {
    try {
      return localStorage.getItem(s.nameStorageKey) ?? '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  if (!open) return null;

  const play = (ev: FormEvent) => {
    ev.preventDefault();
    game.startGame(inputRef.current?.value ?? '');
    setOpen(false);
  };

  const delay = (i: number) => ({ animationDelay: `${i * e.enterStepMs}ms` });

  return (
    <div className="entry-root" data-start="screen">
      <style>{entryCss}</style>
      <style>{levelMeterCss}</style>
      <MenuBackdrop />
      <form className="entry-panel" onSubmit={play} aria-label="Oyuna giriş">
        <h1 className="entry-title entry-anim" style={delay(0)}>{s.title.text}</h1>
        <p className="entry-sub entry-anim" style={delay(0)}>{s.subtitle.text}</p>

        <div className="entry-sec entry-anim" style={delay(1)}>
          <div className="entry-head">
            <label className="entry-label" htmlFor="nick-input">
              {s.label.text}
            </label>
            <LevelBadge />
          </div>
          <input
            id="nick-input"
            ref={inputRef}
            className="entry-input"
            data-start="name"
            type="text"
            defaultValue={savedName}
            placeholder={s.defaultName}
            maxLength={s.maxLength}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div className="entry-sec entry-anim" style={delay(2)}>
          <span className="entry-label" id="skin-label">SKIN MARKET</span>
          <SkinGrid game={game} compact />
        </div>

        <button type="submit" className="start-play entry-anim" style={delay(3)} data-start="play">
          {s.button.label}
        </button>

        <div className="entry-hints entry-anim" style={delay(4)}>
          <span><span className="entry-kbd">SPACE</span>bölün</span>
          <span><span className="entry-kbd">W</span>yem at</span>
          <span><span className="entry-kbd">F</span>tam ekran</span>
          <span><span className="entry-kbd">K</span>oyunda skin değiştir</span>
        </div>
        <p className="entry-sub">{s.hint.text}</p>
        {/* Kaynak bağlantısı: oyunu beğenen GitHub'a, proje kodunu görmek
            isteyen oyuna ulaşabilsin. target_blank + rel güvenlik standardı
            (noopener: yeni sekme açılan sayfa penceremize erişemez). */}
        <a
          className="entry-source"
          href="https://github.com/JaynusHUB/neon-arena-io"
          target="_blank"
          rel="noopener noreferrer"
        >
          Kaynak kodu açık · MIT
        </a>
      </form>

      {/* KÖŞE: GitHub'da yıldızla — dönen halka, hover'da altın yıldız,
          tıklamada kıvılcım patlaması. Görsel: Uiverse (Kaizen0000),
          renkler oyunun neon paletine eşlendi. */}
      <a
        className="gh-btn"
        href="https://github.com/JaynusHUB/neon-arena-io/stargazers"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${g.text} — GitHub'da yıldızla`}
      >
        <span className="gh-ring" aria-hidden="true">
          <span className="gh-spin" />
        </span>
        <span className="gh-body" aria-hidden="true">
          <span className="gh-shine" />
        </span>

        <svg className="gh-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
        <span className="gh-div" aria-hidden="true" />
        <span className="gh-text">{g.text}</span>

        <span className="gh-star" aria-hidden="true">
          {/* boş kontur yıldız */}
          <svg className="gh-star-out" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
          </svg>
          {/* dolu altın yıldız */}
          <svg className="gh-star-fill" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" />
          </svg>
        </span>

        {/* tıklama patlaması: halka nabzı + 8 kıvılcım */}
        <span className="gh-burst" aria-hidden="true" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <span className="gh-spark" key={i} aria-hidden="true" />
        ))}
      </a>
    </div>
  );
}
