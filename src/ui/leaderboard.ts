/**
 * ui/leaderboard.ts — Liderlik tablosu veri kaynağı.
 *
 * MOCK veri KALDIRILDI: kaynak artık Game.getHudSnapshot().entries —
 * gerçek Player ("YOU") + Bot skorlarının canlı sıralaması.
 * Çok oyunculu geçişte kaynak WebSocket/DB olacak — component tarafı
 * DEĞİŞMEYECEK, yalnızca besleyen kaynağı değiştireceğiz.
 */

export interface LeaderboardRow {
  name: string;
  score: number;
  /** DOĞRUSAL madde — tablo MASS'e göre sıralanır (agar.io birebir) */
  mass: number;
  isYou: boolean;
}

/** HUD'ın çizdiği satır sayısı. */
export const ROW_COUNT = 5;

/** Mass'e göre azalan sıralı ilk ROW_COUNT satır (gerçek kütleler). */
export function buildLeaderboardRows(
  entries: ReadonlyArray<LeaderboardRow>,
): LeaderboardRow[] {
  return [...entries].sort((a, b) => b.mass - a.mass).slice(0, ROW_COUNT);
}
