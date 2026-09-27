/**
 * ui/SkinGrid.tsx — Paylaşılan market (giriş menüsü + K menüsü): SKINLER | EFEKTLER.
 *
 * Kart davranışı: açıksa → kuşan (setSkin/setEffect); kilitliyse → satın almayı
 * dene (market.buyItem: bakiye + kilit kontrolü). Yetersiz bakiye → kart
 * silkelenir (reddedilme geri bildirimi, sessiz aksiyon yok). Bakiye satırı
 * her işlemde tazelenir. Token'lar: skin.menu (kart dili) + coin rengi.
 */
import { useState } from 'react';
import type { Game } from '../game/Game';
import { visualTheme } from '../theme/visualTheme';
import { SKINS } from '../skins/registry';
import { EFFECTS, EFFECT_SLOTS, SLOT_LABELS, NO_EFFECT } from '../skins/effects';
import type { EffectSlot } from '../skins/effects';
import { getCoins, getOwned, buyItem } from '../skins/market';

const m = visualTheme.skin.menu;
const coin = visualTheme.deathScreen.coinColor;

const gridCss = `
.mk-balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 12px;
  font-size: ${m.subtitle.size}px;
  color: ${m.subtitle.color};
}
.mk-coins {
  font-family: ${visualTheme.hud.monoFamily};
  font-weight: 700;
  color: ${coin};
  text-shadow: ${visualTheme.deathScreen.coinGlow};
  font-variant-numeric: tabular-nums;
}
/* Akordeon bölüm başlığı — tıkla aç/kapat (PLAY hep görünsün diye varsayılan kapalı) */
.mk-sec { margin-bottom: 10px; }
.mk-secbtn {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: ${m.name.color};
  background: ${m.cardBg};
  border: ${m.cardBorder};
  border-radius: 10px;
  cursor: pointer;
  font-family: ${visualTheme.hud.fontFamily};
  transition: border-color ${m.transitionMs}ms ${m.easing}, box-shadow ${m.transitionMs}ms ${m.easing};
}
.mk-secbtn:hover {
  border-color: ${m.cardHoverBorder};
}
.mk-secbtn:focus-visible {
  border-color: ${m.cardHoverBorder};
  outline: 2px solid ${visualTheme.color.playerStroke};
  outline-offset: 2px;
}
.mk-secbtn[data-active="true"] {
  border-color: ${m.cardActiveBorder};
  box-shadow: ${m.cardActiveGlow};
  color: ${m.cardActiveBorder};
}
.mk-chev {
  display: inline-block;
  transition: transform ${m.transitionMs}ms ${m.easing};
  color: ${m.subtitle.color};
  font-size: 14px;
}
.mk-secbtn[data-active="true"] .mk-chev { transform: rotate(180deg); }
.mk-secbody { padding-top: 10px; animation: mk-drop 220ms ${m.easing}; }
@keyframes mk-drop { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .mk-secbody { animation: none; } }
.mk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(${m.cardMin}px, 1fr));
  gap: ${m.gridGap}px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.mk-grid--compact { grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
.mk-card {
  position: relative;
  width: 100%;
  min-height: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: ${m.cardPadY}px 10px;
  background: ${m.cardBg};
  border: ${m.cardBorder};
  border-radius: ${m.cardRadius}px;
  color: inherit;
  cursor: pointer;
  font-family: ${visualTheme.hud.fontFamily};
  transition: transform ${m.transitionMs}ms ${m.easing}, border-color ${m.transitionMs}ms ${m.easing}, box-shadow ${m.transitionMs}ms ${m.easing};
}
.mk-card:hover {
  transform: translateY(-3px);
  border-color: ${m.cardHoverBorder};
}
.mk-card:focus-visible {
  transform: translateY(-3px);
  border-color: ${m.cardHoverBorder};
  outline: 2px solid ${visualTheme.color.playerStroke};
  outline-offset: 2px;
}
.mk-card.is-active {
  border: 2px solid ${m.cardActiveBorder};
  margin: -1px;
  box-shadow: ${m.cardActiveGlow};
}
.mk-card.is-locked { opacity: 0.85; }
.mk-card.is-shaking { animation: mk-shake 320ms ease; }
.mk-avatar {
  width: ${m.preview}px;
  height: ${m.preview}px;
  border-radius: 50%;
  object-fit: cover;
  outline: 1px solid rgba(255, 255, 255, 0.12);
  outline-offset: -1px;
  background: radial-gradient(circle at 35% 30%, ${visualTheme.color.playerFillCenter}, ${visualTheme.color.playerFill});
  box-shadow: 0 0 14px rgba(34, 211, 238, 0.35);
}
.mk-grid--compact .mk-avatar { width: 48px; height: 48px; }
.mk-avatar--fx { animation: mk-fx 1.8s ease-in-out infinite; }
.mk-name {
  font-size: ${m.name.size}px;
  font-weight: ${m.name.weight};
  color: ${m.name.color};
  text-align: center;
  letter-spacing: 0.03em;
}
.mk-desc {
  font-size: ${m.desc.size}px;
  color: ${m.desc.color};
  text-align: center;
  line-height: 1.25;
}
.mk-lockline {
  font-size: ${m.desc.size}px;
  color: ${m.subtitle.color};
  letter-spacing: 0.05em;
  white-space: nowrap;
}
.mk-lockline b { color: ${coin}; font-weight: 700; }
.mk-check {
  position: absolute;
  top: 6px;
  left: 8px;
  font-size: ${m.check.size}px;
  color: ${m.check.color};
  text-shadow: 0 0 8px rgba(34, 211, 238, 0.7);
}
@keyframes mk-shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-6px); } 55% { transform: translateX(5px); } 80% { transform: translateX(-2px); } }
@keyframes mk-fx { 0%, 100% { box-shadow: 0 0 10px rgba(34, 211, 238, 0.35); } 50% { box-shadow: 0 0 26px rgba(34, 211, 238, 0.8); } }
@media (prefers-reduced-motion: reduce) { .mk-card.is-shaking, .mk-avatar--fx { animation: none; } }
`;

export function SkinGrid({ game, compact = false }: { game: Game; compact?: boolean }) {
  // Akordeon: başlığa tıkla aç, tekrar tıkla kapat (varsayılan kapalı → PLAY görünür)
  const [openSkin, setOpenSkin] = useState(false);
  const [openFx, setOpenFx] = useState(false);
  const [activeSkin, setActiveSkin] = useState<string>(() => game.getHudSnapshot().skin);
  const [activeFx, setActiveFx] = useState<Record<EffectSlot, string>>(
    () => ({ ...game.getHudSnapshot().effects }),
  );
  const [coins, setCoins] = useState<number>(() => getCoins());
  const [owned, setOwned] = useState<string[]>(() => getOwned());
  const [shaking, setShaking] = useState<string | null>(null);

  const deny = (id: string) => {
    // Yetersiz bakiye — kart silkelenir (reddedilme geri bildirimi)
    setShaking(id);
    window.setTimeout(() => {
      setShaking((cur) => (cur === id ? null : cur));
    }, 340);
  };

  const pickSkin = (id: string) => {
    if (owned.includes(id)) {
      if (game.setSkin(id)) setActiveSkin(id);
      return;
    }
    const res = buyItem(id);
    setCoins(res.coins);
    if (res.ok) {
      setOwned(getOwned());
      if (game.setSkin(id)) setActiveSkin(id);
    } else if (res.reason === 'poor') deny(id);
  };

  const pickFx = (id: string, slot: EffectSlot) => {
    // Takılı karta tıklama → SÖK (toggle); diğer slotlar etkilenmez
    if (activeFx[slot] === id) {
      game.clearEffect(slot);
      setActiveFx((prev) => ({ ...prev, [slot]: NO_EFFECT }));
      return;
    }
    if (owned.includes(id)) {
      if (game.setEffect(id)) setActiveFx((prev) => ({ ...prev, [slot]: id }));
      return;
    }
    const res = buyItem(id);
    setCoins(res.coins);
    if (res.ok) {
      setOwned(getOwned());
      if (game.setEffect(id)) setActiveFx((prev) => ({ ...prev, [slot]: id }));
    } else if (res.reason === 'poor') deny(id);
  };

  return (
    <>
      <style>{gridCss}</style>
      <p className="mk-balance">
        <span>Ölümde coin kazanılır</span>
        <span className="mk-coins" data-market="coins">
          ◆ {coins.toLocaleString('en-US')}
        </span>
      </p>
      <div className="mk-sec">
        <button
          type="button"
          className="mk-secbtn"
          data-market-section="skins"
          data-active={openSkin}
          aria-expanded={openSkin}
          onClick={() => setOpenSkin((o) => !o)}
        >
          <span>SKINLER</span>
          <span className="mk-chev" aria-hidden="true">▾</span>
        </button>
        {openSkin ? (
          <div className="mk-secbody">
            <ul className={`mk-grid${compact ? ' mk-grid--compact' : ''}`}>
          {SKINS.map((sk) => {
            const locked = !owned.includes(sk.id);
            return (
              <li key={sk.id}>
                <button
                  type="button"
                  className={`mk-card${activeSkin === sk.id ? ' is-active' : ''}${locked ? ' is-locked' : ''}${shaking === sk.id ? ' is-shaking' : ''}`}
                  data-skin-card={sk.id}
                  aria-pressed={activeSkin === sk.id}
                  aria-label={locked ? `${sk.name} — kilitli, ${sk.price} coin` : sk.name}
                  onClick={() => pickSkin(sk.id)}
                >
                  {activeSkin === sk.id ? (
                    <span className="mk-check" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                  {sk.img ? (
                    <img className="mk-avatar" src={sk.img} alt="" />
                  ) : (
                    <span className="mk-avatar" aria-hidden="true" />
                  )}
                  <span className="mk-name">{sk.name}</span>
                  {!compact ? <span className="mk-desc">{sk.desc}</span> : null}
                  {locked ? (
                    <span className="mk-lockline">
                      <b>◆ {sk.price.toLocaleString('en-US')}</b> · KİLİTLİ
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mk-sec">
        <button
          type="button"
          className="mk-secbtn"
          data-market-section="effects"
          data-active={openFx}
          aria-expanded={openFx}
          onClick={() => setOpenFx((o) => !o)}
        >
          <span>EFEKTLER</span>
          <span className="mk-chev" aria-hidden="true">▾</span>
        </button>
        {openFx ? (
          <div className="mk-secbody">
            {EFFECT_SLOTS.map((slot) => (
            <div key={slot} style={{ marginBottom: slot === 'pellet' ? 0 : 14 }}>
              <p className="mk-balance" style={{ marginBottom: 8 }}>
                <span>{SLOT_LABELS[slot]}</span>
                <span className="mk-locktag">
                  {activeFx[slot] === NO_EFFECT ? 'BOŞ' : 'TAKILI'}
                </span>
              </p>
              <ul className={`mk-grid${compact ? ' mk-grid--compact' : ''}`}>
                {EFFECTS.filter((fx) => fx.slot === slot).map((fx) => {
                  const locked = !owned.includes(fx.id);
                  const on = activeFx[slot] === fx.id;
                  return (
                    <li key={fx.id}>
                      <button
                        type="button"
                        className={`mk-card${on ? ' is-active' : ''}${locked ? ' is-locked' : ''}${shaking === fx.id ? ' is-shaking' : ''}`}
                        data-fx-card={fx.id}
                        aria-pressed={on}
                        aria-label={locked ? `${fx.name} — kilitli, ${fx.price} coin` : on ? `${fx.name} — takılı (sökmek için tıkla)` : fx.name}
                        onClick={() => pickFx(fx.id, slot)}
                      >
                        {on ? (
                          <span className="mk-check" aria-hidden="true">
                            ✓
                          </span>
                        ) : null}
                        <span
                          className="mk-avatar mk-avatar--fx"
                          aria-hidden="true"
                          style={{ background: `radial-gradient(circle at 35% 30%, #ffffff, ${fx.preview})` }}
                        />
                        <span className="mk-name">{fx.name}</span>
                        {!compact ? <span className="mk-desc">{fx.desc}</span> : null}
                        {locked ? (
                          <span className="mk-lockline">
                            <b>◆ {fx.price.toLocaleString('en-US')}</b> · KİLİTLİ
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
