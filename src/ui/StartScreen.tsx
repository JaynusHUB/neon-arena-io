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
      </form>
    </div>
  );
}
