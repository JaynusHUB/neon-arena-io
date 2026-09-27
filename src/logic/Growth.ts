/**
 * logic/Growth.ts — Büyüme formülünün TEK kaynağı.
 * render/ importu YOKTUR (mimari kural).
 *
 * MADDE (mass) DOĞRUSAL artar: her yeme sabit kazanım (growth.massGain).
 * GÖRÜNEN radius mass'in karekökü ile orantılıdır:
 *
 *   radius = baseRadius × √(mass / baseMass)
 *
 * Alan = π×r² → alanın doğrusal büyümesi radius'un √ büyümesini gerektirir
 * (agar.io/slither.io standardı): ilk yemlerde hızlı hissedilen, sonra
 * yavaşlayan dengeli bir gelişim. TAVAN YOK — 8280 mass 910px, 5000 mass
 * 707px çizer (oran korunur, lider her zaman görünür büyük).
 */
import { visualTheme } from '../theme/visualTheme';

/** Yem başına LINEER mass kazanımı (theme tek kaynak — agar.io %10 oranı). */
export function foodMassGain(): number {
  return visualTheme.growth.massGain;
}

/** mass → hedef radius: baseRadius × √(mass/baseMass), TAVANSIZ. */
export function radiusFromMass(mass: number): number {
  const g = visualTheme.growth;
  return visualTheme.size.playerBaseRadius * Math.sqrt(Math.max(mass, 1) / g.baseMass);
}

/** TEK hücreye LINEER mass kazancı (yem/virüs/yutma çözümünde hücre seviyesi).
 *  Hedef çapa HEMEN güncellenir; görünen radius ease ile yaklaşır. */
export function addCellMass(
  cell: { mass: number; targetRadius: number },
  massGain: number,
): void {
  cell.mass += massGain;
  cell.targetRadius = radiusFromMass(cell.mass);
}

/** Görsel evrim kademeleri — mass eşiklerine göre 0…4 (renderer bu eşiği okur). */
export function stageForMass(mass: number): number {
  const stages = visualTheme.growth.massStages;
  let stage = 0;
  for (let i = 0; i < stages.length; i++) {
    if (mass >= stages[i]) stage = i;
  }
  return stage;
}
