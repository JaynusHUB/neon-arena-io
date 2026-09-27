import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import { Hud } from './ui/Hud';
import { SkinMenu } from './ui/SkinMenu';
import { StartScreen } from './ui/StartScreen';
import { DeathScreen } from './ui/DeathScreen';

/**
 * App — Game konteynerini mount eder + HUD'ı gösterir.
 * Oyun döngüsü React state'inden TAMAMEN bağımsız (60fps kuralı);
 * React yalnızca HUD'ı render eder, state'e yazar değil okur (snapshot).
 * İsim + PLAY ekranı (karar 4) sayfa açılır açılmaz gelir.
 */
export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [game, setGame] = useState<Game | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const g = new Game(containerRef.current);
    setGame(g);
    return () => {
      g.destroy();
      setGame(null);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} id="app-root" />
      {game ? <Hud game={game} /> : null}
      {game ? <SkinMenu game={game} /> : null}
      {game ? <StartScreen game={game} /> : null}
      {game ? <DeathScreen game={game} /> : null}
    </>
  );
}
