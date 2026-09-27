/**
 * skins/effects.ts — Hücre efekt kataloğu (marketin 2. sekmesi).
 *
 * Efekt = oyuncu hücrelerine takılan görsel eklenti (örn. neon iz).
 * Skin gibi alınıp kuşanılır (aynı coin + envanter). Mantık/render
 * id'ye göre davranır; katalog sadece kimlik + metin + fiyat taşır.
 */

export interface EffectInfo {
  /** benzersiz id — state'te taşınan değer ('none' = efektsiz) */
  id: string;
  /** kuşanma slotu — her slot bağımsız takılır (aynı anda 5 efekt) */
  slot: EffectSlot;
  /** menüde görünen ad */
  name: string;
  /** kısa açıklama */
  desc: string;
  /** market fiyatı (coin) — 0 = doğuştan açık */
  price: number;
  /** önizleme rengi (menü orbu) */
  preview: string;
}

/** Efekt slotları — biri doluyken diğeri etkilenmez. */
export type EffectSlot = 'trail' | 'consume' | 'split' | 'aura' | 'pellet';

/** Slot görünen adları (market bölüm başlıkları). */
export const SLOT_LABELS: Record<EffectSlot, string> = {
  trail: 'İZ',
  consume: 'YUTMA',
  split: 'BÖLÜNME',
  aura: 'AURA',
  pellet: 'ATIŞ',
};

export const EFFECT_SLOTS: readonly EffectSlot[] = ['trail', 'consume', 'split', 'aura', 'pellet'];

export const NO_EFFECT = 'none';

export const EFFECTS: readonly EffectInfo[] = [
  {
    id: 'fx-trail',
    slot: 'trail',
    name: 'Neon İz',
    desc: 'Hareket ederken ardından parçacık izi bırakır',
    price: 300,
    preview: '#22d3ee',
  },
  {
    id: 'fx-startrail',
    slot: 'trail',
    name: 'Yıldız İzi',
    desc: 'Ardında yavaşça sönen mor-beyaz yıldız kıvılcımları',
    price: 500,
    preview: '#c4b5fd',
  },
  {
    id: 'fx-runetrail',
    slot: 'trail',
    name: 'Rün İzi',
    desc: 'Ardında dönen antik rün sembolleri bırakır',
    price: 650,
    preview: '#a78bfa',
  },
  {
    id: 'fx-shockwave',
    slot: 'consume',
    name: 'Şok Dalgası',
    desc: 'Yutma anında kurbanın boyutunda 4 kademeli altın şok dalgası + patlama ışınları',
    price: 600,
    preview: '#f59e0b',
  },
  {
    id: 'fx-sonic',
    slot: 'split',
    name: 'Sonic Boom',
    desc: 'Bölünmede çift halka + 14 radyal enerji çizgisi patlar',
    price: 450,
    preview: '#ffffff',
  },
  {
    id: 'fx-orbiters',
    slot: 'aura',
    name: 'Yörünge',
    desc: 'Hücreyi saran 3 elips yörüngedegezegenler — hâleli, kuyruklu',
    price: 800,
    preview: '#f0abfc',
  },
  {
    id: 'fx-firepellets',
    slot: 'pellet',
    name: 'Alev Topu',
    desc: 'W ile atılan kütleler alev topuna dönüşür: namlu flaşı + yanan iz + iniş patlaması',
    price: 550,
    preview: '#fb923c',
  },
  {
    id: 'fx-galactictrail',
    slot: 'trail',
    name: 'Galaktik İz',
    desc: 'Gradyan renkli, akıcı path-following neon iz — parlaklık ve boyut dalgalanır',
    price: 1200,
    preview: '#8b5cf6',
  },
];

/** Efektin slotu ('none' → null). */
export function slotOf(id: string): EffectSlot | null {
  return EFFECTS.find((e) => e.id === id)?.slot ?? null;
}

/** Güvenli doğrulama — storage/payload'dan gelen id için. */
export function isValidEffect(id: string | null | undefined): boolean {
  return id === NO_EFFECT || (typeof id === 'string' && EFFECTS.some((e) => e.id === id));
}

/** Fiyat tablosu — market buradan okur (tek kaynak katalog). */
export function effectPrice(id: string): number {
  if (id === NO_EFFECT) return 0;
  return EFFECTS.find((e) => e.id === id)?.price ?? 0;
}
