/**
 * ui/SkinMenu.tsx — Karakter skin menüsü (React overlay; sadece UI katmanı).
 *
 * - Alt sol buton (≥44px mobil dokunmatik) veya K tuşu ile açılır, Esc/K ile kapanır.
 * - İçerik: paylaşılan SkinGrid (market: satın alma + kilit + bakiye).
 * - Oyun state'ine YAZMAZ → yalnız `game.setSkin(id)` çağırır (mantık Game'de).
 * - localStorage kalıcılığı Game.setSkin içinde; menü sadece okur/yansıtır.
 * - Menü açıkken oyun girdisi kapanır (Game.setInputEnabled).
 */
import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import { visualTheme } from '../theme/visualTheme';
import { SkinGrid } from './SkinGrid';

const m = visualTheme.skin.menu;

const skinMenuCss = `
.skin-toggle {
  position: fixed;
  z-index: 20;
  left: calc(${m.button.edge}px + env(safe-area-inset-left));
  bottom: calc(${m.button.edge}px + env(safe-area-inset-bottom));
  min-width: ${m.button.minW}px;
  height: ${m.button.size}px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: ${m.button.bg};
  border: ${m.button.border};
  border-radius: ${m.button.radius}px;
  color: ${m.button.color};
  font-family: ${visualTheme.hud.fontFamily};
  font-size: ${m.button.labelSize}px;
  font-weight: ${m.button.weight};
  letter-spacing: ${m.button.tracking};
  cursor: pointer;
  box-shadow: ${m.button.glow};
  backdrop-filter: blur(${visualTheme.hud.blur}px);
  -webkit-backdrop-filter: blur(${visualTheme.hud.blur}px);
  transition: transform ${m.transitionMs}ms ${m.easing}, box-shadow ${m.transitionMs}ms ${m.easing};
}
.skin-toggle:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 22px rgba(34, 211, 238, 0.55);
}
.skin-toggle:focus-visible {
  transform: translateY(-2px);
  box-shadow: 0 0 22px rgba(34, 211, 238, 0.55);
  outline: 2px solid ${visualTheme.color.playerStroke};
  outline-offset: 2px;
}
.skin-toggle:active { transform: translateY(0); }
.skin-toggle-dot {
  width: 14px; height: 14px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, ${visualTheme.color.playerFillCenter}, ${visualTheme.color.playerFill});
  box-shadow: 0 0 8px ${visualTheme.color.playerGlow};
}

.skin-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: ${m.overlayBg};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: skin-fade ${m.transitionMs}ms ${m.easing};
}
.skin-panel {
  width: 100%;
  max-width: ${m.panelMaxW}px;
  max-height: 90vh;
  overflow-y: auto;
  background: ${m.panelBg};
  border: ${m.panelBorder};
  border-radius: ${m.panelRadius}px;
  padding: ${m.panelPadY}px ${m.panelPadX}px;
  box-shadow: ${m.panelShadow};
  animation: skin-pop ${m.transitionMs}ms ${m.easing};
}
.skin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.skin-title {
  margin: 0;
  font-size: ${m.title.size}px;
  letter-spacing: ${m.title.tracking};
  font-weight: ${m.title.weight};
  color: ${m.title.color};
  line-height: 1;
}
.skin-sub {
  margin: 0 0 18px;
  font-size: ${m.subtitle.size}px;
  color: ${m.subtitle.color};
}
.skin-close {
  width: ${m.close.size}px;
  height: ${m.close.size}px;
  flex: 0 0 auto;
  border: none;
  border-radius: 10px;
  background: ${m.close.bg};
  color: ${m.close.color};
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: filter ${m.transitionMs}ms ${m.easing};
}
.skin-close:hover { filter: brightness(1.4); }
.skin-close:focus-visible {
  filter: brightness(1.4);
  outline: 2px solid ${visualTheme.color.playerStroke};
  outline-offset: 2px;
}

.skin-hint {
  margin: 16px 0 0;
  text-align: center;
  font-size: ${m.hint.size}px;
  color: ${m.hint.color};
}

@keyframes skin-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes skin-pop { from { opacity: 0; transform: scale(0.96) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
`;

export function SkinMenu({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);

  // K: aç/kapat · Esc: kapat (sessiz aksiyon yok — her şeyin yolu var)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' || e.key === 'K') setOpen((o) => !o);
      else if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Menü açıkken oyun girdisi kapanır — kartlara tıklarken hücre sürüklenmesin
  useEffect(() => {
    game.setInputEnabled(!open);
    return () => game.setInputEnabled(true);
  }, [open, game]);

  return (
    <>
      <style>{skinMenuCss}</style>

      <button type="button" className="skin-toggle" data-skin-toggle onClick={() => setOpen(true)}>
        <span className="skin-toggle-dot" aria-hidden="true" />
        SKIN
      </button>

      {open ? (
        <div className="skin-overlay" role="dialog" aria-modal="true" aria-label="Skin menüsü" data-skin-menu onClick={() => setOpen(false)}>
          <div className="skin-panel" onClick={(e) => e.stopPropagation()}>
            <div className="skin-head">
              <h2 className="skin-title">SKIN MARKET</h2>
              <button type="button" className="skin-close" aria-label="Kapat" data-skin-close onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            <p className="skin-sub">Karakterini seç — kilitli skin'ler coin ile açılır.</p>

            <SkinGrid game={game} />

            <p className="skin-hint">K tuşu ile aç/kapat · Esc ile kapat</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
