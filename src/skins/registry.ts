/**
 * skins/registry.ts — Skin katalog (id + metin + sprite yolu).
 *
 * Renk/boyut YOK (onlar theme/visualTheme.ts içinde — kural gereği).
 * render/ ve ui/ tarafından okunur; logic/ de alan adını bilir (sadece string).
 *
 * Sprite dosyaları: public/skins/<id>.png (1:1, AI Studio üretimi veya placeholder).
 */
export interface SkinInfo {
  /** benzersiz id — state'te taşınan değer */
  id: string;
  /** menüde görünen ad */
  name: string;
  /** kısa açıklama (ne ifade eder) */
  desc: string;
  /** sprite yolu — classic'te null (prosedürel palet) */
  img: string | null;
  /** "Önerilen Model" rozeti (yeşil) */
  recommended?: boolean;
  /** market fiyatı (coin) — 0 = doğuştan açık (classic) */
  price: number;
}

export const SKINS: readonly SkinInfo[] = [
  { id: 'classic', name: 'Classic Model', desc: 'Klasik neon camgöbeği', img: null, price: 0 },
  {
    id: 'recommended',
    name: 'Önerilen Model',
    desc: 'Modern cyan alev — en etkileyici',
    img: '/skins/recommended.png',
    recommended: true,
    price: 1000,
  },
  { id: 'ignite', name: 'Alev Topu', desc: 'Ateşten doğan agresif hücre', img: '/skins/ignite.png', price: 400 },
  { id: 'cute', name: 'Sevimli Karakter', desc: 'Yumuşak, dost canlısı blob', img: '/skins/cute.png', price: 150 },
  { id: 'wolf', name: 'Kurt / Ejderha', desc: 'Vahşi, karanlık savaşçı', img: '/skins/wolf.png', price: 500 },
  { id: 'galaxy', name: 'Galaksi', desc: 'Nebula girdabının içinde', img: '/skins/galaxy.png', price: 750 },
  { id: 'slime', name: 'Slime', desc: 'Esnek ve neşeli jel', img: '/skins/slime.png', price: 250 },
  { id: 'lava', name: 'Lav Topu', desc: 'Çatlayan sıcak çekirdek', img: '/skins/lava.png', price: 650 },
  { id: 'celestial', name: 'Celestial Dragon', desc: 'Göksel ejderha — efsanevi', img: '/skins/celestial.png', price: 1200 },
  { id: 'dragon', name: 'Dragon', desc: 'Kadim ateş ejderhası', img: '/skins/dragon.png', price: 900 },
  { id: 'cosmic', name: 'Cosmic', desc: 'Yıldız tozu girdabı', img: '/skins/cosmic.png', price: 800 },
  { id: 'phantom', name: 'Phantom', desc: 'Gölgelerin hayaleti', img: '/skins/phantom.png', price: 700 },
  { id: 'lion', name: 'Aslan', desc: 'Savana kralı', img: '/skins/lion.png', price: 600 },
  { id: 'cyborg', name: 'Cyborg', desc: 'Çelik ve devre savaşçısı', img: '/skins/cyborg.png', price: 550 },
  { id: 'frostbite', name: 'Frostbite', desc: 'Dondurucu buz ruhu', img: '/skins/frostbite.png', price: 450 },
];

/** Fiyat tablosu — market buradan okur (tek kaynak registry). */
export function skinPrice(id: string): number {
  return SKINS.find((s) => s.id === id)?.price ?? 0;
}

/** Güvenli doğrulama — localStorage / payload'dan gelen id için. */
export function isValidSkin(id: string | null | undefined): boolean {
  return typeof id === 'string' && SKINS.some((s) => s.id === id);
}
