/**
 * render/SkinAssets.ts — Skin sprite görsellerini önceden yükler.
 *
 * - Her görsel TEK seferde Image() ile yüklenir; onload → loaded set'i.
 * - Görsel yoksa/hata verirse fallback renderer'da prosedürel gövdeye düşer
 *   (sessiz aksiyon yok: menüde renkli orb önizlemesi görünür).
 * - Dosyalar public/skins/<id>.png (Vite static serve — bundle'a girmez).
 */

const images = new Map<string, HTMLImageElement>();
const loaded = new Set<string>();

/** Registry'deki tüm sprite'ları önceden yükle (oyun başında tek sefer). */
export function preloadSkins(paths: ReadonlyArray<{ id: string; img: string | null }>): void {
  for (const { id, img } of paths) {
    if (!img || images.has(id)) continue;
    const el = new Image();
    el.onload = () => {
      if (el.naturalWidth > 0) loaded.add(id);
    };
    el.src = img;
    images.set(id, el);
  }
}

/** Sprite görseli — yoksa null (renderer fallback çizer). */
export function getSkinImage(id: string): HTMLImageElement | null {
  return images.get(id) ?? null;
}

/** Sprite yüklendi mi? (payload köprüsü + render kararı) */
export function isSkinLoaded(id: string): boolean {
  const img = images.get(id);
  return loaded.has(id) && !!img && img.complete && img.naturalWidth > 0;
}
