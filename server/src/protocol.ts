/**
 * server/src/protocol.ts — İstemci ↔ sunucu mesaj sözleşmesi (JSON).
 *
 * KURAL (orijinal mimari): skor İSTEMCİDEN asla kabul edilmez — client
 * yalnızca GİRDİ gönderir (hedef + aksiyonlar); skor/mass sunucunun
 * kendi state'inden hesaplanır ve snapshot ile yayınlanır.
 */

/** İstemci → sunucu */
export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'input'; x: number; y: number } // dünya hedefi (fare)
  | { t: 'split' } // Space
  | { t: 'eject' }; // W

/** Hücre görüntüsü (snapshot içi) */
export interface CellView {
  x: number;
  y: number;
  r: number;
}

/** Sunucu → istemci */
export type ServerMsg =
  | { t: 'welcome'; id: string; team: number }
  | {
      t: 'snap';
      time: number;
      you: { cells: CellView[]; score: number; mass: number; dead: boolean };
      players: { id: string; name: string; cells: CellView[]; score: number; mass: number }[];
      foods: { x: number; y: number; hue: number }[];
      viruses: { x: number; y: number; r: number }[];
      board: { name: string; mass: number }[];
    }
  | { t: 'death'; score: number; bestMass: number; survivedSec: number; killer: string; killerSkin: string }
  | { t: 'error'; message: string };
