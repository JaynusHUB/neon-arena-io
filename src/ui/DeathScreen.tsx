/**
 * ui/DeathScreen.tsx — Ölüm ekranı (dramatik karanlık tasarım).
 *
 * Kan karartması overlay + nabız gibi atan kırmızı vinyet, spring girişli
 * panel, count-up animasyonlu stat kartları (SKOR / EN İYİ / SÜRE / +COIN),
 * katil avatarı, TEKRAR OYNA / İZLE. Coin TEK SEFERLİK claim edilir
 * (game.claimDeathCoins — çift ödül yok). İzlemede kompakt bara iner.
 * Oyun döngüsünden bağımsız polling (300ms). Token'lar: theme.deathScreen.
 */
import { useEffect, useRef, useState } from 'react';
import type { Game, DeathSnapshot } from '../game/Game';
import { visualTheme } from '../theme/visualTheme';
import { SKINS } from '../skins/registry';

const d = visualTheme.deathScreen;
const hud = visualTheme.hud;

const deathCss = `
.death-root {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${d.overlayBg};
  padding: 20px;
  font-family: ${hud.fontFamily};
}
.death-root::before {
  content: "";
  position: absolute;
  inset: 0;
  background: ${d.vignette};
  animation: death-pulse 1.6s ease-in-out infinite;
  pointer-events: none;
}

.death-panel {
  position: relative;
  background: ${d.panelBg};
  border: ${d.panelBorder};
  border-radius: ${d.panelRadius}px;
  box-shadow: ${d.panelShadow};
  padding: 30px 38px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 92vw;
  min-width: 300px;
  animation: death-slam ${d.enterMs}ms ${d.easing};
}

.death-title {
  margin: 0;
  color: ${d.titleColor};
  font-size: 52px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  line-height: 1;
  text-shadow: ${d.titleGlow};
  animation: death-shake ${d.enterMs}ms ${d.easing};
}

.death-killer {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: ${d.killerColor};
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.death-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid ${d.titleColor};
  outline: 1px solid rgba(255, 255, 255, 0.12);
  outline-offset: -1px;
  box-shadow: ${d.titleGlow};
  background: radial-gradient(circle at 35% 30%, ${visualTheme.color.playerFillCenter}, ${visualTheme.color.playerFill});
}

.death-stats {
  display: flex;
  gap: 12px;
  margin: 6px 0 2px;
  flex-wrap: wrap;
  justify-content: center;
}
.death-stat {
  min-width: 86px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  background: rgba(248, 113, 113, 0.07);
  border: 1px solid rgba(248, 113, 113, 0.28);
  border-radius: 12px;
  animation: death-rise ${d.enterMs}ms ${d.easing} backwards;
}
.death-stat b {
  font-family: ${hud.monoFamily};
  font-variant-numeric: tabular-nums;
  font-size: 24px;
  color: #f8fafc;
}
.death-stat span {
  font-size: ${hud.label.size}px;
  letter-spacing: ${hud.label.tracking};
  color: ${hud.label.color};
}
.death-stat--coin { border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.07); }
.death-stat--coin b { color: ${d.coinColor}; text-shadow: ${d.coinGlow}; }

.death-btns { display: flex; gap: 10px; margin-top: 4px; }
.death-play {
  min-width: 200px;
  min-height: 52px;
  padding: 0 26px;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-indent: 0.14em;
  color: ${d.primaryColor};
  background: ${d.primaryBg};
  border: none;
  border-radius: 12px;
  box-shadow: 0 0 26px rgba(248, 113, 113, 0.45);
  cursor: pointer;
  transition: background 140ms ease, transform 120ms ease;
}
.death-play:hover { background: ${d.primaryHoverBg}; }
.death-play:active { transform: translateY(3px); }
.death-watch {
  min-height: 52px;
  padding: 0 22px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #e2e8f0;
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.4);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 140ms ease;
}
.death-watch:hover { border-color: ${visualTheme.color.playerStroke}; }

.death-bar {
  position: fixed;
  left: 50%;
  bottom: calc(${hud.edge}px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 10px;
  background: ${d.panelBg};
  border: ${d.panelBorder};
  border-radius: 12px;
  padding: 8px 12px;
  font-family: ${hud.fontFamily};
  font-size: 14px;
  color: ${d.killerColor};
  white-space: nowrap;
}

@keyframes death-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
@keyframes death-slam { from { opacity: 0; transform: scale(1.12); } to { opacity: 1; transform: scale(1); } }
@keyframes death-shake { 0% { transform: translateX(0); } 25% { transform: translateX(-7px); } 55% { transform: translateX(5px); } 80% { transform: translateX(-2px); } 100% { transform: translateX(0); } }
@keyframes death-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .death-root::before, .death-panel, .death-title, .death-stat { animation: none; }
}
`;

/** Sayı count-up (600ms ease-out; reduced-motion'da anında). */
function useCountUp(target: number, active: boolean): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) {
      setVal(target);
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const dur = d.countUpMs;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      setVal(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active]);
  return val;
}

function formatSurvived(sec: number): string {
  const m = Math.floor(sec / 60);
  const s2 = Math.floor(sec % 60);
  return m > 0 ? `${m}dk ${s2}sn` : `${s2}sn`;
}

export function DeathScreen({ game }: { game: Game }) {
  const [snap, setSnap] = useState<DeathSnapshot>(() => game.getDeathSnapshot());
  const [coins, setCoins] = useState(0);
  const claimedFor = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSnap(game.getDeathSnapshot());
    }, 300);
    return () => window.clearInterval(id);
  }, [game]);

  // Coin TEK SEFERLİK claim (ölüm raporu başına bir kez)
  const deathKey = snap.death
    ? `${snap.death.score}|${snap.death.bestMass}|${snap.death.survivedSec}|${snap.death.killer}`
    : null;
  useEffect(() => {
    if (deathKey && claimedFor.current !== deathKey) {
      claimedFor.current = deathKey;
      setCoins(game.claimDeathCoins());
    }
    if (!deathKey) {
      claimedFor.current = null;
      setCoins(0);
    }
  }, [deathKey, game]);

  const show = snap.dead && snap.death !== null;
  const death = show ? snap.death : null;
  const score = useCountUp(death ? death.score : 0, show);
  const best = useCountUp(death ? Math.round(death.bestMass) : 0, show);
  const earn = useCountUp(death ? coins : 0, show);

  if (!death) return null;
  const killerImg = SKINS.find((sk) => sk.id === death.killerSkin)?.img ?? null;

  // İzleme modu: kompakt bar (tekrar oyna bir tık uzakta)
  if (snap.spectating) {
    return (
      <div className="death-bar" data-death="watchbar">
        <style>{deathCss}</style>
        <span>İZLENİYOR — {death.killer} seni yuttu</span>
        <button type="button" className="death-play" data-death="respawn" onClick={() => game.respawn()}>
          TEKRAR OYNA
        </button>
      </div>
    );
  }

  return (
    <div className="death-root" data-death="screen">
      <style>{deathCss}</style>
      <div className="death-panel" role="alert" aria-label="Öldün">
        <h1 className="death-title">YUTULDUN</h1>
        <p className="death-killer">
          {killerImg ? (
            <img className="death-avatar" src={killerImg} alt="" />
          ) : (
            <span className="death-avatar" aria-hidden="true" />
          )}
          <span>
            Katil: <b>{death.killer}</b>
          </span>
        </p>
        <div className="death-stats">
          <div className="death-stat" style={{ animationDelay: `${d.statStepMs * 0}ms` }}>
            <b data-death="score">{score.toLocaleString('en-US')}</b>
            <span>SKOR</span>
          </div>
          <div className="death-stat" style={{ animationDelay: `${d.statStepMs * 1}ms` }}>
            <b data-death="best">{best.toLocaleString('en-US')}</b>
            <span>EN İYİ MASS</span>
          </div>
          <div className="death-stat" style={{ animationDelay: `${d.statStepMs * 2}ms` }}>
            <b data-death="survived">{formatSurvived(death.survivedSec)}</b>
            <span>SÜRE</span>
          </div>
          <div
            className="death-stat death-stat--coin"
            style={{ animationDelay: `${d.statStepMs * 3}ms` }}
          >
            <b data-death="coins">+{earn.toLocaleString('en-US')}</b>
            <span>COIN</span>
          </div>
        </div>
        <div className="death-btns">
          <button type="button" className="death-play" data-death="respawn" onClick={() => game.respawn()}>
            TEKRAR OYNA
          </button>
          <button type="button" className="death-watch" data-death="spectate" onClick={() => game.spectate()}>
            İZLE
          </button>
        </div>
      </div>
    </div>
  );
}
