/**
 * visualTheme.ts — Görsel kimliğin tek kaynağı.
 *
 * KURAL: Renk, boyut ve animasyon değerleri SADECE burada tanımlanır.
 * logic/ ve render/ dosyalarında hardcoded hex/px YASAK.
 */

/**
 * Hex rengi verilen oran kadar koyulaştırır (0..1).
 * AGAR.IO KURALI: hücre konturu gövde renginden %15-20 KOYU olmalıdır
 * (asla açık ton). Formül burada (theme) — render/ saf rengi asla ellemez.
 */
export function shadeColor(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = 1 - amount;
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Hex rengi verilen oran kadar AÇAR (0..1) — koyu tonun parlak ucu. */
export function tintColor(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = 1 - amount;
  const mix = (c: number) => Math.round(c + (255 - c) * f);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Hex → rgba(opacity) — rank accent'in saydam katmanları (hale/çizgi/parıltı). */
export function alphaOf(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Skin renk paleti — sprite glow/halka + görsel yüklenmedeyken fallback gövde.
 *  (Renkler theme'de — hardcoded hex/px YASAK kuralının parçası) */
export interface SkinVariant {
  /** fallback gövde dolgusu — DÜZ (gradyan/glow yok, referans fill modeli) */
  fill: string;
  /** neon halka / kenar çizgisi */
  ring: string;
}

/** AI sprite skinleri — classic BU listedE DEĞİLDİR (classic = klasik oyuncu paleti) */
const SKIN_VARIANTS: Record<string, SkinVariant> = {
  recommended: { fill: '#7dd3fc', ring: '#bae6fd' },
  ignite: { fill: '#f97316', ring: '#fed7aa' },
  cute: { fill: '#60a5fa', ring: '#93c5fd' },
  wolf: { fill: '#334155', ring: '#38bdf8' },
  galaxy: { fill: '#7c3aed', ring: '#a78bfa' },
  slime: { fill: '#22c55e', ring: '#4ade80' },
  lava: { fill: '#dc2626', ring: '#f87171' },
};

/** İsim font px — theme içinde TEK formül (renderer + test buradan okur). */
export function nameplateFontPx(radius: number): number {
  const np = visualTheme.nameplate;
  return Math.round(
    Math.min(np.maxSize, Math.max(np.minSize, radius * np.radiusRatio)),
  );
}

export const visualTheme = {
  /* ---------- Renkler ---------- */
  color: {
    // Ortam — BEYAZ ZEMİN (agar.io birebir karar: zemin + sınır dışı beyaz)
    background: '#ffffff',
    /** ızgara çizgisi — soluk gri, beyaz zeminde okunur */
    grid: '#e0e0e0',
    /** her 5. ızgara çizgisi — hiyerarşi için bir tık koyu */
    gridMajor: '#d4d4d4',
    /** 🧱 harita sınırı — İNCE NET SİYAH çizgi (agar.io birebir) */
    worldEdge: '#000000',
    /** sınırın DIŞINDAKİ boşluk — ızgarasız saf beyaz (beyaz zemin kararı) */
    worldVoid: '#ffffff',

    // Oyuncu (neon camgöbeği)
    playerFill: '#22d3ee',
    playerFillCenter: '#a5f3fc',
    /** gövdeden %18 KOYU kontur (agar.io: stroke fill'den %15-20 koyu + kalın) */
    playerStroke: shadeColor('#22d3ee', 0.18),
    playerGlow: 'rgba(34, 211, 238, 0.85)',

    /** bot gövdeleri — oyuncudan (camgöbeği) ve birbirlerinden renkle ayrılır */
    botPalette: ['#f472b6', '#a78bfa', '#fbbf24', '#34d399', '#fb923c', '#60a5fa', '#e879f9', '#4ade80'],
    /** oyuncu ölümü — ekran flaşı rengi (risky kırmızısı tonu) */
    deathFlash: '#f87171',
    /** hücre yutma — ALTIN patlama rengi: beyaz zeminde okunur canlı amber
     *  (soluk krem zeminle birleşiyordu → yutma anı görünmezdi) */
    devourBurst: '#f59e0b',
    /** yutan hücrede yutma flaşı (beyaz overlay — gulp tepkisi) */
    gulpFlash: '#ffffff',

    // 🍩 Yem — agar.io birebir: TEK tip düz renkli nokta. DIŞ ÇİZGİ (stroke)
    // ve glif YOK. RENK seed'den türeyen rastgele hue'dur (agar.io
    // hsl(hue,100%,50%)) → logic/render hardcoded hex YAZMAZ.
    food: {
      /** yem tohumu (0..1) → hue (derece, 0..359) — renderer/payload/test TEK formül */
      hueOf(seed: number): number {
        return Math.round(seed * 360) % 360;
      },
      /** hue → jel gövde dolgusu + koyu kenar (ADIM 11d JEL/GLOW).
       *  Kenar L%, foodJuice.rimLightness'ten gelir (referans drawFood
       *  strokeStyle = hsl(h,100%,45%) — clone'da lineWidth 0 olduğu için
       *  görünmüyordu; burada canlı jel rim'i olarak açıldı). */
      hueStyle(hue: number) {
        return {
          fill: `hsl(${hue}, 100%, 50%)`,
          rim: `hsl(${hue}, 100%, ${visualTheme.foodJuice.rimLightness}%)`,
        };
      },
    },
    /** gradyan kenarı — "hex yazma" kuralına takılmadan şeffaf son nokta */
    transparent: 'rgba(0, 0, 0, 0)',
  },

  /* ---------- Boyutlar ---------- */
  size: {
    /** Referans clone 5000² (config.js) → tasarım kararıyla 4× BÜYÜK dünya:
     *  agar.io'da harita ekrandan çok daha geniştir; skor 130-150'de bile
     *  haritanın yalnızca küçük bir bölümü görünür. Yem yoğunluğu korunur
     *  (foodCount 4× → 4000/20000² = 1000/5000² birebir aynı oran). */
    worldWidth: 20000,
    worldHeight: 20000,

    /** BİREBİR ölçek: r = √mass × 10 → mass 100'de r = 100
     *  (radiusFromMass = baseR × √(mass/baseMass) aynı sonucu verir).
     *  TAVAN YOK (referans massToRadius'ta da yok): büyük mass = görünür
     *  büyük gövde. Ekranı kaplama korkusu zoom'a emanet (camera.zoomDamping
     *  + minZoom) — sert tavan, liderle avı AYNI BOYDA gösteriyordu. */
    playerBaseRadius: 100,
    /** yem yarıçapı — agar.io oranı: çap ≈ grid hücresinin %60'ı
     *  (gridStep 80 × 0.60 / 2 = 24). TEK KAYNAK: spawn (Food.ts) +
     *  çarpışma (overlaps aynı radius'u okur) + culling payı buradan beslenir. */
    foodRadius: 24,

    gridStep: 80, // zemin ızgarası
    /** referans drawCells: KALIN hücre kenarlığı (dünya px — r=100'de ~%10) */
    playerStrokeWidth: 10,

    /* --- agar.io kenar modeli (clone drawBorder + yassılaşma) --- */
    /** sınır çizgi kalınlığı (ekran px — zoom'dan bağımsız netlik) */
    worldEdgeWidth: 2,
  },

  /* ---------- Kamera zoom (oyuncu boyutuna göre dinamik) ---------- */
  camera: {
    minZoom: 0.15, // en fazla geri çekilme — çok büyüyünce bile harita görüşü kaybolmaz
    maxZoom: 1, // asla native ölçeğin üstüne çıkmaz (küçükken ekranı kaplamaz)
    /** r = baseRadius iken zoom = baseZoom */
    baseZoom: 1,
    /** zoom = baseZoom × (baseRadius / radius)^zoomDamping
     *  0.9 → 0.75 YUMUŞATILDI: mass arttıkça kamera daha yavaş geri çekilir,
     *  hücre ekranda okunur kalır; geniş harita (20000²) görüşü zaten
     *  tutar — ekran yarıçapı ~100-141px bandı (viewport'un %20'si altında) */
    zoomDamping: 0.75,
  },

  /* ---------- ADIM 11d — JEL/GLOW: jelly hücre ---------- */
  /** Yem juice'ı — `color.food.hueStyle()` yalnızca rim lightness'ini okur
   *  (yem düz agar.io dolgusudur; gloss/nabız tasarımı uygulanmadı ve
   *  ilgili token'lar ölü olduğu için silindi). */
  foodJuice: {
    /** rim hsl lightness (%) — referans drawFood strokeStyle = hsl(h,100%,45%) */
    rimLightness: 45,
  },
  /** Jelly hücre membranı — agar.io imza hissi: sinus dalgalı çokgen.
   *  render/PlayerRenderer.traceBody okur; mantık/ state'ine dokunulmaz. */
  cellWobble: {
    /** çevres boyunca dalga sayısı (membran dalgası) */
    waves: 7,
    /** genlik = yarıçap × oran (0.05 = %5 esneme) */
    ampRatio: 0.05,
    /** dalga dönüş hızı (rad/sn) — zamanla evrilme */
    speed: 1.6,
    /** poligon nokta sayısı (dalga başına ~9 nokta — pürüzsüz kenar) */
    points: 64,
    /** hücre başına sabit faz — id hash'den (titreme tutarlı, deterministik) */
    phase(id: string): number {
      let h = 0;
      for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
      return ((h % 629) / 100); // 0..6.29 rad
    },
  },

  /* ---------- ADIM 11e — YUTMA JELİ (agar.io Da() emilim paketi birebir) ---------- */
  /** Yutulan hücre EMİLİM HAYALETİ: kurban, yutanın merkezine kayarak
   *  yutanın boyuna şişerken SOLAR (alpha 1→0); membranı yutulma
   *  gerilimiyle hızlı titrer. Hücrelerin ALTINA çizilir → yutan,
   *  kurbanın üstünden geçerek "yutar". */
  absorb: {
    life: 0.75, // hayalet ömrü (sn) — emilim okunur sürede
    targetRatio: 1, // hedef yarıçap = yutan yarıçapı × oran (vanilla nSize = k.size)
    startScale: 1.25, // ilk karede "yutuldum" şişmesi (ani ama yumuşak giriş)
    rimBoost: 2.5, // hayalet konturu ×2.5 — emilen kenar net okunur
    wobbleAmp: 0.12, // yutulma gerilimi: membran genliği
    wobbleSpeed: 9, // hızlı titreme (rad/sn) — normal membran 1.6
  },
  /** YUTAN hücrede "gulp" tepkisi — vanilla membran yayının yankısı: boost,
   *  (1−t)² ile söner → membran sıçrar + şişer + BEYAZ FLASH çakar.
   *  Büyüklük yutulan/yutan oranıyla ölçeklenir; SADECE hücre-yutma
   *  olayı tetikler (yem toplama DEĞİL). */
  gulp: {
    amp: 1.3, // membran genlik boost katsayısı
    swell: 0.15, // yarıçap şişme katsayısı
    life: 1.2, // sönüm süresi (sn)
    flashAlpha: 0.45, // yutma flaşı tepe opaklığı (beyaz overlay)
    sizeGain: 1.4, // güç = (kurbanR/yutanR) × bu katsayı
    minPower: 0.45, // minik lokmada bile hissedilir alt sınır
    maxPower: 1.35, // denk boyda yutuşta tavan
  },
  /** TEMAS EZİLMESİ — yutma tamamlanmadan ÖNCE: üst üste binen hücreler
   *  birbirini iterken membran temas ekseninde EZİLİR (dent), yanlardan
   *  ŞİŞER (side-bulge) + titreme hızlanır. Render-only (mantık dokunulmaz);
   *  drawCells komşu çiftleri okur, en derin teması hücreye uygular. */
  contact: {
    dentRatio: 0.25, // ezilme derinliği = overlap(0..1) × radius × oran
    sigma: 0.7, // temas çanı genişliği (radyan) — gauss sapması
    sideBulge: 0.5, // yan şişme = ezilmenin bu katı (iki yana paylaştırılır)
    excite: 1.2, // temas titreme çarpanı (genlik ×(1+excite×overlap))
    speedBoost: 0.8, // temas dalga hızı artışı (×(1+boost×overlap))
  },

  /* ---------- Efekt marketi (hücre efektleri — örn. neon iz) ---------- */
  trail: {
    /** iz emisyon aralığı (sn) */
    interval: 0.08,
    /** emisyon başına parçacık */
    count: 2,
    /** parçacık hızı (hafif dağılma) */
    speed: 40,
    /** parçacık ömrü (sn) */
    life: 0.6,
    /** parçacık boyutu */
    size: 3,
    /** bu hızın altında iz bırakılmaz (px/sn) — dururken iz yok */
    minSpeed: 50,
    /** yıldız izi renkleri (beyaz + mor kıvılcım) */
    starColors: ['#ffffff', '#c4b5fd'],
  },
  /* ---------- YUTMA: Yutma Şoku (consume) — kurbanın boyutuna ölçekli,
   * koreografik çok kademeli patlama ----------
   * Neden kademeli: halkalar GEÇİKMELİ doğar (Particle.delay). Aynı karede
   * üst üste doğarlarsa tek kalın halka gibi okunur; sıraya binince gerçek
   * şok dalgası hissedilir. Neden ölçekli: sabit yarıçap "her av aynı" gibi
   * hissettiriyordu — büyük av daha büyük patlama hak eder. */
  shockwave: {
    /** halka yarıçapı = kurbanR × oran + taban */
    radiusRatio: 1.9,
    baseRadius: 420,
    /** kademe sayısı (gecikmeli halka dalgası) */
    layers: 4,
    /** kademeler arası gecikme (sn) */
    layerDelay: 0.06,
    /** sonraki kademenin yarıçap çarpanı */
    layerSpread: 1.45,
    /** ilk kademenin ömrü (sn) — sonrakiler kademe başına kısalır */
    ringLife: 0.8,
    ringLifeFalloff: 0.82,
    /** çekirdek flaş — yutma anının kendisi (okunur darbe) */
    coreLife: 0.22,
    coreSize: 44,
    coreAlpha: 0.55,
    /** RADYAL SARSINTI ÇİZGİLERİ — yutma anının patlama ışını.
     *  Kırıntı noktaları değil, gövdeden dışa uzanan çizgiler (daha okunur). */
    lineCount: 12,
    lineLife: 0.52,
    lineLen: 0.26,
    lineWidth: 3, // ekran px
    lineColor: '#fcd34d',
    /** yükselen köz — yavaş sönen sıcak noktalar */
    emberCount: 7,
    emberSpeed: 300,
    emberLife: 0.9,
    emberSize: 6,
    colors: {
      core: '#ffffff',
      ringNear: '#f59e0b',
      ringFar: '#fbbf24',
      debris: '#fbbf24',
      ember: '#fb923c',
    },
  },
  /* ---------- BÖLÜNME: Sonic Boom (split) — keskin çift patlama ----------
   * İnce-hızlı iç halka + kalın-yavaş dış halka (gecikmeli) = "gümbürtü"
   * dili. Yarıçap HÜCREYE bağlıdır; eskiden sabit 220 idi, yani 100 kütlelik
   * hücre ile 900 kütlelik hücre aynı boom'u alıyordu. */
  sonic: {
    /** boom yarıçapı = hücreR × oran + taban */
    radiusRatio: 1.9,
    baseRadius: 140,
    /** ince-hızlı iç halka */
    innerLife: 0.34,
    innerSpread: 1,
    /** kalın-yavaş dış halka */
    outerLife: 0.6,
    outerSpread: 1.42,
    outerDelay: 0.05,
    coreLife: 0.16,
    coreSize: 30,
    coreAlpha: 0.5,
    /** RADYAL SARSINTI ÇİZGİLERİ — gövdeden dışa uzayan çizgiler.
     *  Havuzun `spark` türü kullanılmıyor: nokta-merkezli "+" çiziyor ve yem
     *  alanının renk gürültüsüne karışıyordu. */
    lineCount: 14,
    lineLife: 0.46,
    lineLen: 0.24, // kol uzunluğu = yarıçapın oranı
    lineWidth: 2.6, // ekran px
    lineColor: '#a78bfa',
    colors: {
      core: '#ffffff',
      inner: '#ffffff',
      outer: '#8b5cf6', // mor: beyaz zeminde + camgöbeği gövde üstünde kontrast
      line: '#a78bfa',
    },
  },
  /* ---------- AURA: Yörünge — hücreye bağlı gezegen sistemi ----------
   * Düz ortak daire DEĞİL: her gövde kendi elipsinde (tilt), kendi hızında
   * (biri ters yönde) döner → derinlik hissi. Parçacık HAVUZUNU KULLANMAZ
   * (sürekli üretim havuzu yutma/ölüm geri bildirimini boğardı) — saf çizim,
   * LOD'lu (küçük hücrede detay düşer). */
  orbiters: {
    count: 3,
    /** dış yörünge yarıçapı = hücre R × oran */
    radiusRatio: 1.8,
    /** yörünge elipslerinin ezikliği (1 = tam daire, 0 = çizgi) */
    squash: 0.66,
    /** dönüş hızı (rad/sn) — gövde kendi çarpanıyla ölçeklenir */
    speed: 2.1,
    /** gövdeler: kendi yarıçap / hız / boyut / eğim çarpanı */
    bodies: [
      // sizeRatio: hücre R'nin ORANI (dünya px değil) — büyüyen hücrede
      // gezegen de büyür, küçük zoom'da da okunur. Renkler hücre paletinden
      // AYRI seçildi: camgöbeği gezegen camgöbeği gövdede KAYBOLUYORDU.
      { r: 1.0, speed: 1.0, sizeRatio: 0.075, tilt: 0.0, color: '#fbbf24' },
      { r: 1.22, speed: -0.66, sizeRatio: 0.055, tilt: 0.5, color: '#a78bfa' },
      { r: 0.78, speed: 1.55, sizeRatio: 0.065, tilt: -0.4, color: '#fb7185' },
    ],
    /** yörünge rehber çizgisi */
    guideAlpha: 0.26,
    guideWidth: 1.5,
    /** gövde halesi (iç çekirdek + dış yumuşak halka) */
    glowScale: 2.6,
    glowAlpha: 0.4,
    /** hareket kuyruğu yay uzunluğu (rad) */
    trailArc: 0.55,
    /** boyut nabzü */
    pulseAmp: 0.14,
    pulseSpeed: 2.2,
    /** LOD: ekran yarıçapı bu değerin ALTINDA ise kuyruk + hale çizilmez
     *  (16 parçalı gövdede path maliyeti patlamasın) */
    detailPx: 40,
  },
  /* ---------- ATIŞ: Alev Topu (pellet) — namlu + yanan iz + iniş patlaması ----------
   * Üç parçalı zincir: ateşleme anı (namlu konisi) → uçuş boyunca yanan
   * iz → yere düşünce patlama. İz ADIM GECİKMELİ üretilir: pellet başına
   * ~33 üretim/sn, 7 pellet/sn bütçesiyle sınırlı. */
  firepellet: {
    outer: '#fb923c', // dış alev
    inner: '#fde68a', // sıcak çekirdek
    core: '#fff7ed', // beyaz çekirdek nokta
    /* --- namlu flaşı (hücre kenarından namlu yönüne koni) --- */
    flashCount: 10,
    flashSpeed: 260,
    flashLife: 0.22,
    flashSize: 8,
    flashSpread: 0.7, // rad (koni yarı açısı)
    /* --- uçuş izi --- */
    trailCount: 3,
    trailSpeed: [10, 70],
    trailLife: 0.34,
    trailSize: 13,
    trailInterval: 0.025, // sn
    trailJitter: 18, // hıza DİK saçılım (px) — sabit hız düz çizgi veriyordu
    /* --- iniş patlaması --- */
    landCount: 8,
    landSpeed: 180,
    landLife: 0.4,
    landSize: 9,
    landRingRadius: 70,
    landRingLife: 0.32,
    /* --- gövde alevi --- */
    /** GÖRSEL ölçek: ateş topu çizilirken mantık yarıçapından (eject.radius)
     *  BÜYÜK çizilir. Mantık/çarpışma yarıçapına dokunulmaz — kosmetik bir
     *  projeksiyonda görsel gövbe fizikten büyüktür (alev yandığı için).
     *  0.39 zoomda 12 px mantık yarıçapı 4.6 ekran px idi: alev okunmuyordu. */
    renderScale: 1.8,
    stretch: 1.5, // hıza göre uzama (tavan)
    flickSpeed: 18, // titreme frekansı
    flickAmp: 0.12,
  },

  /* ---------- Rün izi (tematik trail: antik glifler) ---------- */
  runetrail: {
    /** glif rengi (mor mürekkep) */
    color: '#c4b5fd',
    /** iz emisyon aralığı (sn) */
    interval: 0.12,
    /** her emisyonda 4 yandan glif (N/E/S/W — yavaşça döner) */
    sides: 4,
    /** glif doğuş yarıçapı = hücre R × oran (kenardan süzülür) */
    edgeRatio: 0.7,
    /** yanların dönüş hızı (rad/sn) */
    orbitSpeed: 0.8,
    /** glif savrulma hızı (yavaş, yumuşak) */
    speed: 12,
    /** glif ömrü (sn) — uzun, yumuşak sönüm */
    life: 1.6,
    /** glif boyutu (px font) */
    size: 18,
    /** glif dönüş hızı (rad/sn) */
    spin: 1.2,
    /** antik rün seti (dönüşümlü çizilir) */
    runes: ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᛟ'],
  },

  /* ---------- Galaktik İz (premium trail: path following + gradyan renk) ----------
   *  ParticlePool motoruyla çizilir: her frame hücrenin TARTIĞI yol boyunca
   *  parçacık serpiştirilir (nokta dizisi değil, sürekli şerit). */
  galactictrail: {
    /** yolun parçacık basamağı (px) — küçük = pürüzsüz şerit */
    pathStep: 16,
    /** en az parçacık (yavaş hareket) — tek adımda bile iz görünsün */
    minPerStep: 1,
    /** azami parçacık (çok hızlı) — havuz taşmasın */
    maxPerStep: 4,
    /** hücre hızı → parçacık ömrü çarpanı (hızlı = daha uzun iz) */
    lifeBySpeed: 0.0012,
    /** temel ömür (sn) */
    life: 0.34,
    /** ömür üst sınırı (sn) */
    lifeMax: 0.8,
    /** çekirdek nokta boyutu (px) */
    dotSize: 2.6,
    /** yumuşak hale (glow) boyutu (px) — çekirdeğin ~3.2 katı */
    glowSize: 9,
    /** hale alfası (çok düşük = premium ışıltı) */
    glowAlpha: 0.16,
    /** gradyan durakları (hue 0..360) — mor→pembe→turuncu→sarı */
    gradientHues: [262, 288, 312, 336, 12, 40],
    /** gradyan kayma hızı (hue/sn) — zamanla renk döner */
    hueShift: 26,
    /** yol boyunca hue geçişi (hue/px) — şerit boyunca renk akışı */
    huePerPx: 0.16,
    /** boyut dalgalanma hızı (rad/sn) */
    sizeWave: 5.2,
    /** boyut dalgalanma derinliği (0..1) */
    sizeWaveAmt: 0.34,
    /** yanal (dik) saçılma (px) — şerit kalınlığı */
    spread: 3.2,
    /** dışa itiş hızı (px/sn) — parçacıklar yavaşça açılır */
    push: 26,
    /** bu hızın altında iz bırakılmaz (px/sn) */
    minSpeed: 45,
  },

  /* ---------- LOD (hücre detay kademesi — ekran yarıçapına göre) ---------- */
  /** Ekran px eşiği: r×zoom bu değerin altındaysa sadeleşir.
   *  Test viewport'unda hücreler genelde tam kademede kalır (piksel
   *  testleri etkilenmez); miniklerde isim de kalkar (okunurluk). */
  lod: {
    /** tam detay alt sınırı (ekran px) */
    fullPx: 28,
    /** minik kademe üst sınırı (ekran px) — altı: daire + dolgu + ince kontur */
    tinyPx: 14,
  },

  /* ---------- XP/Seviye (kalıcı ilerleme — SCORE ve COIN'den ayrı katman) ---------- */
  xp: {
    /** seviye eğrisi: L → L+1 için gereken XP = round(base × L^exp).
     *  L1:80, L10:2.839, L50:34.395, L100:100.714, L200:294.908 */
    curveBase: 80,
    curveExp: 1.55,
    maxLevel: 200,
    /** maç-içi kazanç (COIN'e EK — ekonomi ayrı) */
    perFood: 2, // her yem
    perVirus: 20, // virüs yeme
    perDevourMass: 0.25, // hücre yutma: round(kurbanMass × oran)
    /** metin rengi (coin sarısından ayrışır — mor/pembe) */
    textColor: '#e879f9',
    /** kilometre taşı rozet çerçeveleri (ulaşılan en yüksek uygulanır) */
    milestones: [
      { level: 10, color: '#4ade80' },
      { level: 25, color: '#a78bfa' },
      { level: 50, color: '#fbbf24' },
    ],

    /* ---------- RANK ÜNİTESİ (madalyon + ray + menü çipi — tek tasarım) ---------- */

    /** unvan merdiveni: tierSpan seviyede bir (ROOKIE … OMEGA). */
    tiers: [
      'ROOKIE', 'SCOUT', 'HUNTER', 'RAIDER', 'BERSERKER',
      'WARLORD', 'JUGGERNAUT', 'PHANTOM', 'TITAN', 'OMEGA',
    ],
    tierSpan: 20, // seviye aralığı (tiers.length × tierSpan = maxLevel 200)

    /** rank accent türevleri (UI'da CSS değişkeni olarak türetilir — oranlar burada) */
    rank: {
      dimAmount: 0.45, // dolum gradyanının koyu ucu
      liteAmount: 0.55, // dolum gradyanının parlak ucu
      softAlpha: 0.16, // boş halka / ince çizgi tonu
      glowAlpha: 0.55, // dış parıltı
      chipBorderAlpha: 0.45, // menü çipi kenarlığı
      chipBgAlpha: 0.12, // menü çipi dolgusu
      chipGlowAlpha: 0.22, // menü çipi dış parıltısı
    },

    /** seviye madalyonu — conic ilerleme halkası + halka üzerinde yürüyen başlık */
    dial: {
      size: 46, // px çap
      ringWidth: 3, // halka kalınlığı (çekirdek bu kadar içeride)
      trackColor: 'rgba(255, 255, 255, 0.10)', // boş halka
      coreBg: 'radial-gradient(circle at 34% 26%, rgba(44, 51, 68, 0.96), rgba(7, 10, 17, 0.98))',
      coreBorder: 'rgba(255, 255, 255, 0.10)',
      coreShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.55)',
      outerRing: 1, // çevresindeki 1px ince halka (px)
      glowBlur: 14, // dış parıltı yarıçapı (px)
      valueSize: 17, // seviye rakamı
      valueColor: '#f8fafc',
      valueWeight: 800,
      /** halka üzerindeki başlık noktası — dolumun nerede olduğunu gösterir */
      headSize: 6,
      headColor: '#ffffff',
      headGlow: 6, // yakın halesi (px)
      headGlow2: 14, // uzak halesi (px)
      headMinOpacity: 0.3, // %0 dolumda soluk (başlangıç pip'i)
      /** seviye atlaması: madalyon pop + genişleyen şok dalgası */
      upMs: 900,
      upScale: 1.14,
      shockMaxScale: 1.9,
      shockAlpha: 0.55,
    },

    /** XP rayı — dolum + kilometre taşı çentikleri + yavaş speküler şerit */
    rail: {
      height: 10,
      radius: 999,
      trackBg: 'linear-gradient(180deg, rgba(0, 0, 0, 0.55), rgba(255, 255, 255, 0.05))',
      trackShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.65), inset 0 0 0 1px rgba(255, 255, 255, 0.06)',
      /** dolumun üst kenarındaki ışık çizgisi (silindirik hacim hissi) */
      fillInner: 'inset 0 1px 0 rgba(255, 255, 255, 0.40)',
      fillGlow: 10, // dolumun dış parıltısı (px)
      /** dolum ucundaki parlak kenar + halesi */
      headWidth: 2,
      headRadius: 2,
      headOutset: 2, // raydan taşma payı (px)
      headGlow: 6,
      headGlow2: 14,
      /** ray üzerindeki kilometre taşı çentikleri (eşit aralıklı) */
      notchCount: 3,
      notchColor: 'rgba(255, 255, 255, 0.16)',
      /** yükselen speküler şerit (yavaş, kesintisiz — sürekli canlılık) */
      sheenWidth: '55%',
      sheenFrom: '-115%',
      sheenTo: '300%',
      sheenToPct: 45, // şeridin geçişi tamamlayıp durduğu anahtar kare (%)
      sheenMs: 3600,
      sheenEasing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      sheenAlpha: 0.32,
      /** seviye atlayınca dolumun beyaza doğru parlaması */
      upFlashMs: 700,
      upFlashBright: 2.2,
    },

    /** unvan + XP sayısı satırı (madalyonun sağındaki üst sıra) */
    row: {
      gap: 8,
      tierSize: 10,
      tierTracking: '0.2em',
      tierWeight: 800,
      glyphSize: 5, // unvanın önündeki elmas (dönük kare)
      glyphGap: 7,
      numSize: 12,
      numColor: '#e2e8f0',
      numDim: 'rgba(148, 163, 184, 0.72)',
      unit: 'XP',
      unitTracking: '0.12em',
      numGap: 5,
    },

    /** giriş menüsü rank çipi (ad etiketinin sağında — eski düz hap yerine) */
    chip: {
      padX: 12,
      padY: 4,
      radius: 999,
      gap: 8,
      glyphSize: 4,
      glyphGap: 6,
      dialSize: 22, // mini madalyon
      dialRingWidth: 2,
      dialHeadSize: 4,
      valueSize: 10,
      labelSize: 10,
      labelTracking: '0.18em',
      innerSheen: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      glowBlur: 16,
    },

    /** HUD rank paneli yerleşimi (madalyon | unvan+ray) — deste dolgusu hud.deck */
    panel: {
      gap: 12, // madalyon ↔ sağ sütun
      rowGap: 7, // unvan satırı ↔ ray
      railMinWidth: 132, // ray taban genişliği (leaderboard ile hizalı)
    },

    /** LEVEL UP bandı (ekran ortası — gradient metin + unvan + yan kurallar) */
    banner: {
      topPct: 20,
      size: 46,
      tracking: '0.14em',
      weight: 900,
      tierSize: 13,
      tierTracking: '0.34em',
      ruleW: 54, // unvanın iki yanındaki çizgi uzunluğu (px)
      ruleGap: 10,
      gap: 6,
      sheenMs: 1400, // metin parlaması turu
      glowBlur: 18,
      dropY: 14, // girişte aşağıdan yükselme payı (px)
    },

    /** floating text (yükselen +X XP) */
    floatRise: 60, // px/sn
    floatLife: 1.1, // sn
    floatSize: 15,
    floatCap: 24, // havuz kapasitesi
    /** seviye atlama halkası (virüs patlaması diliyle tutarlı) */
    levelRingColor: '#e879f9',
    levelRingRadius: 130,
    levelRingLife: 0.7,
    /** LEVEL UP bandı süresi (ms) */
    bannerMs: 2400,
    /** localStorage anahtarı (kalıcı — yenilemede kaybolmaz) */
    storageKey: 'neon-arena.xp',
  },

  /* ---------- HUD (React overlay — İKİ MODÜL, TEK KABUK:
   *   sol: SKOR OKUMASI + rank destesi (tek panel, iki zon)
   *   sağ: LEADERBOARD (canlı)
   *   Kabuk dili menüyle aynı: mor-siyah cam + saç teli kenar + üstte
   *   aydınlatılmış neon hat. Beyaz oyun zemininde GRIYE ÇALMASIN diye
   *   opaklık yüksek tutulur (menüde zemin koyu, burada beyaz grid).) ---------- */
  hud: {
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    monoFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",

    edge: 16, // kenar boşluğu (ölüm ekranı alt barı da bunu kullanır)
    blur: 8, // cam panel arka plan bulanıklığı (skin menüsü de bunu kullanır)

    /** ORTAK PANEL KABUĞU — iki modülün tek görünüm sözleşmesi */
    shell: {
      /** beyaz grid üzerinde bile neredeyse siyah kalsın diye yüksek opaklık */
      bg: 'rgba(8, 10, 18, 0.9)',
      border: '1px solid rgba(148, 163, 184, 0.16)',
      shadow: '0 16px 40px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.07)',
      radius: 14,
      padX: 14,
      padY: 12,
      /** üst kenar ışığı (imza detay): dış kenarda tam cyan, içe doğru söner;
       *  nefes ritmiyle canlı — konum/layout değiştirmez */
      litH: 2,
      litInset: 14, // köşe yuvarlaklığını kesmesin diye içeriden pay (px)
      lit:
        'linear-gradient(90deg, rgba(34, 211, 238, 0.96) 0%, rgba(34, 211, 238, 0.96) 32%, rgba(34, 211, 238, 0.5) 58%, rgba(34, 211, 238, 0) 100%)',
      litMs: 3600, // nefes süresi (ms)
      litMin: 0.88, // nefes alt opaklık (piksel doğrulama eşiğini aşmasın)
      /** kenar ışığının dışa halesi — paneli menü neonuna bağlayan imza */
      litShadow: '0 0 9px rgba(34, 211, 238, 0.42)',
    },

    /** okuma satırı: HERO skor ⟵ dikey saç teli ⟶ SIZE + COIN (ikincil) */
    statsGap: 12, // hero ↔ ayraç ↔ yan sütunlar
    sideGap: 14, // SIZE ↔ COIN
    vDivider:
      'linear-gradient(180deg, rgba(148, 163, 184, 0) 0%, rgba(148, 163, 184, 0.3) 26%, rgba(148, 163, 184, 0.3) 74%, rgba(148, 163, 184, 0) 100%)',

    /** RANK DESTESİ — panelin alt bloğu: tam taşmalı koyu kuyu + magenta üst çizgi
     *  (ayrı kutu YOK → tek gövde, iki zon) */
    deck: {
      bg: 'linear-gradient(180deg, rgba(3, 5, 12, 0.55), rgba(3, 5, 12, 0.24))',
      line: 'linear-gradient(90deg, rgba(232, 121, 249, 0.7) 0%, rgba(232, 121, 249, 0.24) 34%, rgba(148, 163, 184, 0.16) 100%)',
      padX: 14,
      padY: 11,
      gap: 11, // okuma satırı ↔ destek
    },

    /** etiketler: küçük, geniş harf aralıklı, sesiz (değerler konuşsun) */
    label: { color: 'rgba(148, 163, 184, 0.8)', size: 10, tracking: '0.18em', weight: 700 },
    /** HERO — oyunun tek birincil okuması */
    scoreValue: {
      color: '#22d3ee', // test: rgb(34, 211, 238) birebir beklenir
      size: 34,
      weight: 800,
      glow: '0 0 18px rgba(34, 211, 238, 0.45)',
    },
    /** ikincil sütunlar — daha küçük, glow'u daha sakin */
    sizeValue: {
      color: '#4ade80',
      size: 17,
      weight: 700,
      glow: '0 0 10px rgba(74, 222, 128, 0.35)',
    },
    coinValue: {
      color: '#fbbf24',
      size: 17,
      weight: 700,
      glow: '0 0 10px rgba(251, 191, 36, 0.35)',
    },

    /* ---------- LEADERBOARD ---------- */
    boardWidth: 224,
    titleGap: 8,
    title: { color: '#22d3ee', size: 11, tracking: '0.2em', weight: 800 },
    /** başlık altındaki gradyan kural (sol canlı → sağ söner) */
    headRule:
      'linear-gradient(90deg, rgba(34, 211, 238, 0.7) 0%, rgba(34, 211, 238, 0.24) 55%, rgba(34, 211, 238, 0) 100%)',
    /** canlı oyuncu sayacı (başlığın sağı) */
    count: { color: '#e2e8f0', dim: 'rgba(148, 163, 184, 0.72)', size: 10, tracking: '0.14em' },
    liveDot: {
      color: '#4ade80',
      glow: '0 0 8px rgba(74, 222, 128, 0.9)',
      pulseMs: 1600,
      minOpacity: 0.35,
    },

    row: {
      size: 13,
      gap: 3, // satırlar arası (yüklü his, ama satır net ayrı)
      nameGap: 8,
      padY: 3,
      padX: 7,
      rankW: 15,
      color: 'rgba(203, 213, 225, 0.92)',
      scoreColor: '#cbd5e1',
      rankColor: 'rgba(148, 163, 184, 0.8)',
      /** zirve: 1. sıra altın (evrensel oyun okuma dili) */
      top1: '#fbbf24',
      top1Glow: '0 0 8px rgba(251, 191, 36, 0.55)',
    },
    /** YOU satırı: kutu değil, SOL aksan işareti + hafif dolgu (daha az kutu) */
    you: {
      bg: 'linear-gradient(90deg, rgba(34, 211, 238, 0.18), rgba(34, 211, 238, 0.02))',
      tick: '#22d3ee',
      tickGlow: '0 0 7px rgba(34, 211, 238, 0.8)',
      nameColor: '#67e8f9',
    },

    /** skor değişiminde pop geri bildirimi (sessiz aksiyon yok) */
    bump: { scale: 1.08, ms: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    /** coin artışında pop (ölüm ödülü sessiz kalmasın) */
    coinBump: { scale: 1.18, ms: 460, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },

    /** dar ekran: iki modül hâlâ yan yana sığsın (360px hedef) */
    compact: {
      breakpoint: 640,
      edge: 8,
      panelPadX: 10,
      panelPadY: 8,
      deckPadX: 10,
      deckPadY: 8,
      deckGap: 8,
      statsGap: 8,
      sideGap: 8,
      scoreSize: 24,
      sideSize: 14,
      boardWidth: 132,
      rowSize: 11,
      headGap: 5,
      /** başlık daralır + canlı sayacı gizlenir (satır sığsın) */
      titleSize: 10,
      titleTracking: '0.14em',
      /** rank destesi daralır (madalyon + sayılar + satır aralığı) */
      dialSize: 36,
      dialValue: 13,
      railMinW: 84,
      tierSize: 9,
      numSize: 9,
      deckRowGap: 6,
    },
  },

  /* ---------- Hareket (referans agar.io-clone Cell.move + canvas.js gameInput) ---------- */
  movement: {
    /** mass = baseMass'de hız (px/sn) — slowDown ile ölçeklenir */
    baseSpeed: 340,
    /** referans config slowBase 4.5 — slowDown = ln(mass/baseMass)/ln(slowBase) + 1
     *  → hücre BÜYÜDÜKÇE hız düşer (log yasası = speed decay) */
    slowBase: 4.5,
    /** referans MIN_DISTANCE — bu kadar yakındayken hız mesafeyle orantılı
     *  azalır → hedefe pürüzsüz yanaşma (hız→0; sekme/zıplama yok) */
    glideDistance: 50,
    /** yön yumuşatma (sn cinsinden k) — framerate'den bağımsız ease */
    velocityLerp: 9,
  },

  /* ---------- Animasyon (ease değerleri) ---------- */
  animation: {
    radiusLerp: 7, // hedef çapa'ya dönüş hızı (kısa büyüme animasyonu)
    /** KAMERA TAKİP DAMPING'i — 60fps'de her kare:
     *  camera.x += (hedef.x - camera.x) × 0.1 (direkt set YOK)
     *  Kare hızından bağımsız formül: k = 1 - (1 - d)^(60·dt)
     *  → 60Hz'te tam 0.1, 144Hz'te kare başına düşer ama SN/sn aynı kalır */
    cameraFrameDamping: 0.1, // istenen aralık 0.08-0.15 ✓
    collectPullSec: 0.15, // toplama çekilişi — 150ms mikro-geri bildirim bandı
    /** oyuncu ölünce ekran flaşı — başta tam güç, ease-out ile söner */
    deathFlashSec: 0.55,
    deathFlashMaxAlpha: 0.5,
    easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
    easeInCubic: (t: number) => t * t * t,
  },

  /* ---------- Büyüme: mass DOĞRUSAL → radius = baseR × √(mass/baseMass) ---------- */
  growth: {
    /** başlangıç madde (1.0×) */
    baseMass: 100,
    /** yem başına LINEER mass kazanımı — mass asla çarpanla büyümez.
     *  agar.io oranı: foodMass 1 / start 10 = %10 → baseMass 100'de +10 */
    massGain: 10,
    /** görsel evrim kademeleri (mass eşikleri): küçük → dev */
    massStages: [100, 150, 260, 450, 800],
    // Formül (logic/Growth.ts): radius = playerBaseRadius × √(mass / baseMass)
    // Alan = πr² → mass lineer ise alan da lineer, radius √ ile büyür
    // (agar.io standardı): ilk yemlerde hızlı, sonra yavaşlayan dengeli his.
    // Tavan YOK (büyük her zaman görünür büyük).
  },

  /* ---------- Oyun ekonomisi ---------- */
  game: {
    /** Yem yoğunluğu: 6000 / 20000² — 31 aktörlü yoğun FFA'da saha boş
     *  kalmasın diye referans oranın üstü (hafif artış kararı) */
    foodCount: 6000,
    fixedStepHz: 60, // test için deterministik adım

    /** bot sayısı (hedef 50-70 — kalabalık FFA) */
    botCount: 60,
    /** bot davranışı — basit: KAÇ → SALDIR → YEM → GEZ (pathfinding yok) */
    bot: {
      fleeRadius: 260, // büyük biri bu kadar yakına gelirse KAÇ (istenen aralık 200-300)
      chaseRadius: 300, // küçük biri bu kadar yakınsa ONA YÖNEL
      foodSearchRadius: 900, // bu kadar yakında yem varsa en yakısını hedefle
      wanderRange: 480, // hedef yoksa: bu kadar uzağa rastgele gezinme noktası
      wanderRestSec: 4, // gezinme hedefi yenileme süresi
      wanderArrive: 70, // hedefe bu kadar yaklaşınca yeni hedef seç
      /** hedef ani değişince YÖN de ani değişmez — kademeli dönüş damping'i
       *  (60fps'de kare başına; k = 1 - (1-d)^(60·dt) — yumuşak viraj) */
      turnDamping: 0.15,
    },

    /** tüm hücrelerin doğuş payı — dünya kenarından bu oranda içeride */
    spawnInsetRatio: 0.12,
    /** doğuş ayrıklığı — yeni doğan, yaşayan herkesten en az bu kadar uzakta
     *  doğmaya çalışır (deneme yanılma, en iyi aday kazanır) */
    spawnSeparation: 2500, // world px (20000'lik haritada 11 oyuncu rahat sığar)
    /** ayrık doğuş için aday sayısı (fazlası = daha iyi yayılım, ucuz döngü) */
    spawnTries: 24,
    /** Hücre-yutma (Agar.io): a, b'den massRatio kat büyükse VE derin
     *  örtüşürse a, b'yi yutar → mass/skor devri, ölüm + rastgele yeniden doğuş.
     *  ÇOK HÜCRELİ: kural hücre ÇİFTLERİ arasında uygulanır (11b split). */
    devour: {
      massRatio: 1.15, // yutma eşiği: a.mass ≥ b.mass × 1.15 (agar.io %15 kuralı)
      overlapFrac: 0.3, // yeme mesafesi: aR − bR × 0.3 (agar.io "merkez içerde" hissi)
      gain: 1, // yutulan mass'in tamamı yiyene devredilir
      scorePerMass: 1, // skor kazancı = yutulan mass × 1
    },

    /** Space Split + çok hücreli gövde (referans player.js: splitCell/userSplit,
     *  SPLIT_CELL_SPEED 20, MERGE_TIMER 15, maxCells 16). */
    split: {
      maxCells: 16, // oyuncu başına parça tavanı (resmi agar.io varsayılanı)
      minSplitMass: 35, // parça sonucu bu mass'in altına düşemez (minik hücre
      // bile patlayabilir/bölünebilir — 100 olsaydı 200 altı hücre ASLA
      // bölünemezdi: dikenler küçük hücrede işlemiyor sanılırdı)
      boostMult: 2, // fırlatma = hücrenin TABAN hızı × çarpan (mass-bağımlı:
      // taban hız düşünce boost da orantılı düşer → göreli atılganlık korunur)
      minBoostSpeed: 280, // boost TABANI (px/sn) — büyük gövdede sönük kalmasın:
      // boost = max(taban×çarpan, minBoost). 100 mass'te etkisiz (680>280).
      boostDecay: 3.2, // boost sönümü (1/sn, exp) — parça ~1sn'de durulur
      mergeBaseSec: 15, // taban birleşme süresi (referans MERGE_TIMER)
      mergeMassFactor: 0.02, // + mass başına ek sn (büyük gövde geç birleşir)
      mergeMaxSec: 35, // birleşme süresi tavanı
      mergeOverlap: 0.45, // bu oranda örtüşen kendi parçaları birleşir
      pushRadiusRatio: 0.45, // itişme = (r1+r2) × oran /sn (yarıçap-ölçekli:
      // dev parçalar da makul sürede ayrışır; r=100 çiftinde eski 90px/s ile aynı)
      cooldownSec: 1, // split sonrası bekleme (çift basış israfı yok)
    },

    /** W Eject — kütle fırlatma (referans MassFood: speed 25, friction 0.5).
     *  Her yeterli hücre imlece bir pellet atar (takım besleme/tuzak/virüs). */
    eject: {
      pelletMass: 16, // pellet başına hücreden düşen mass
      minCellMass: 35, // ateşleyebilmek için hücre min mass'i
      speed: 900, // pellet ilk hızı (px/sn)
      friction: 3, // sürtünme (1/sn, exp) — pellet yavaşlayıp yere düşer
      landSpeed: 70, // bu hızın altına düşünce normal yeme dönüşür
      radius: 12, // uçan pellet yarıçapı (görsel)
      ratePerSec: 7, // RESMİ SINIR: sn başına max 7 pellet (token bucket)
      budgetCap: 14, // birikmiş hak tavanı (2 basışlık seri atış payı)
    },

    /** Virüsler — yeşil dikenli denge mekaniği (REFERANS server.js birebir).
     *  Virüs merkezini içine alan BÜYÜK hücre patlar; küçük saklanır.
     *  Virüs ASLA yenmez (referansta yeme dalı yoktur). */
    virus: {
      count: 30, // sahada sabit tutulan virüs sayısı (patlayan yeniden doğar)
      baseMass: 100, // doğuş mass'i
      maxMass: 600, // besleme şişme tavanı (düşük tutulur → tuzak çabuk normale döner)
      deflatePerSec: 25, // şişkinlik sönümü (mass/sn → tabana iner, saha temiz kalır)
      popTouch: 1, // patlama/yeme teması: dist < hücreR + virüsR × oran (1 = sürtme yeter)
      shotThreshold: 212, // 7 pellet (7×16) yiyen virüs 1 top fırlatır (RESMİ SAYI)
      shotMass: 120, // fırlatılan virüs mass'i
      maxTotal: 36, // sahadaki toplam virüs tavanı (top patlaması dahil)
      shotSpeed: 800, // fırlatılan virüs hızı (px/sn)
      motionFriction: 2.2, // uçan virüs sürtünmesi (1/sn)
      settleSpeed: 20, // altına düşünce durur (statik virüs)
      fill: '#33ff33', // virüs yeşili (referans config.fill birebir)
      stroke: '#19d119', // koyu kenar (referans config.stroke birebir)
      spikes: 36, // sık testere dişi (referans model: çok sayıda küçük sivri uç)
      spikeAmp: 0.07, // kısa diş (uzun dalga değil)
      points: 144, // kontur noktası (diş başına ~4 — keskinlik korunur)
      spin: 0.8, // diken dönüşü (rad/sn)
      ringWidthRatio: 0.1, // kenar kalınlığı oranı (referans strokeWidth dili)
      fxBurstCount: 16, // virüs patlayınca/beslenince yeşil patlama
      fxBurstSpeed: 200,
      fxBurstLife: 0.5,
      fxBurstSize: 4,
      fxRingRadius: 70,
      fxRingLife: 0.4,
    },

    /** Mass decay — kütle çürümesi: eşiğin üstündeki her hücre sürekli
     *  mass kaybeder (krallar sonsuza büyümez, endgame baskısı). */
    decay: {
      rate: 0.004, // sn başına kaybedilen oran (mass × rate × dt)
      minMass: 150, // bu mass'in altındaki hücre çürümez
    },

    /** Global yem tavanı — ölüm saçılması ADİTİF'tir (+24/ölüm); uzun
     *  oturumda foods sınırsız büyüyüp O(foods × actors) frame maliyetini
     *  çökertirdi. Yenilen yem 1:1 yenilendiği için cap'e ancak saçılma
     * yaklaştırır; cap kararı scatterFood'da. */
    maxFoodCount: 7000, // foodCount 6000 + saçılma payı (scatterFood cap)

    /** Ölüm ekonomisi — yutulan hücre mass'in bir kısmını yem olarak saçar
     *  (intikam yolu: mass sahaya döner, rakip toplayabilir ya da ölen geri
     *  dönebilir). Denge: yiyen devrini ALIR (devour.gain=1) + saçılan yem
     *  ADITİF'TİR; şişme maxCount ile tavanlıdır. */
    deathScatter: {
      ratio: 0.5, // ölen mass'in bu oranı yem olarak saçılr
      ringFactor: 1.3, // halka yarıçapı = (yiyenR + kurbanR) × 1.3
      ringJitter: 15, // ±px rastgele dağılım (halka doğal görünsün)
      maxCount: 24, // performans/görsel tavan (pellet sayısı)
    },

    /** toplama ödülü (skor) — her yem +1 (agar.io basit ekonomi) */
    scorePerFood: 1,
    /** Hücre merkezinin duvardan minimum uzaklığı (yarıçap oranı) — referans
     *  game-logic.js adjustForBoundaries(cell, radius/3, 0): merkez r/3'te
     *  DURUR, kontur duvara TAŞAR → renderer konturu kırpıp hücreyi
     *  YASSILAŞTIRIR (agar.io-clone drawCellWithLines/regulatePoint modeli). */
    wallCenterRatio: 1 / 3,
  },

  /* ---------- Hücre isim plakası (AGAR.IO BİREBİR: isim hücrenin İÇİNDE
   *  ortalanır, beyaz dolgu + siyah kontur, hücreyle ölçeklenir) ---------- */
  nameplate: {
    /** font boyutu = hücre yarıçapı × bu oran (hücre büyüdükçe isim büyür) */
    radiusRatio: 0.34,
    minSize: 12,
    maxSize: 110,
    weight: 700,
    /** kontur kalınlığı = fontPx × oran (siyah kenar her zeminde okunur) */
    borderRatio: 0.14,
    minBorder: 2,
    /** beyaz dolgu + siyah kontur (birebir referans drawCells drawName) */
    fill: '#ffffff',
    stroke: '#000000',
  },

  /* ---------- Parçacıklar (object pool — constructor dışında nesne ÜRETİLMEZ) ---------- */
  particles: {
    maxAlive: 240, // havuz kapasitesi — sabit, çalışma sırasında büyümez
    /** Görsel bütçe: TEK mantık adımında yutma POOF'larına basılabilecek azami
     *  partikül. Oyun mantığı değişmez (skor/mass her yem için işlenir) — sadece
     *  çizim kısılır. Neden: bir saçılma halkasından 40+ yem tek adımda
     *  çözülürse yem başına 12 partikül havuzu saniyede ~2000 doldurur ve
     *  yutma/ölüm/level-up geri bildirimi boğulur. */
    fxBudgetPerStep: 54,
    friction: 3.5, // hız sönümü (1/sn)
    poofCount: 12,
    poofSpeed: 150,
    poofLife: 0.45,
    poofSize: 3.2,
    ringLife: 0.3,
    ringRadius: 46,
    ringWidth: 3,
    /** hücre yutma — POOF'tan büyük altın patlama + geniş halka */
    devourCount: 30,
    devourSpeed: 240,
    devourLife: 0.7,
    devourSize: 4.6,
    devourRingRadius: 110,
    devourRingLife: 0.9,
  },

  /* ---------- Skin sistemi (AI sprite + kod glow — tek renk kaynağı) ---------- */
  skin: {
    /** varsayılan skin: klasik prosedürel oyuncu paleti (variant'ı yok) */
    defaultId: 'classic',
    /** seçim kalıcılığı (localStorage anahtarı) */
    storageKey: 'neon-arena.skin',
    /** sprite neon halka kalınlığı (yarıçap oranı) */
    ringWidthRatio: 0.09,
    /** id → renk paleti (classic'te null → PLAYER_PALETTE kullanılır) */
    variants: SKIN_VARIANTS,
    variant(id: string): SkinVariant | null {
      return SKIN_VARIANTS[id] ?? null;
    },

    /** skin menüsü (React overlay) — tüm renk/boyut/animasyon token'ları */
    menu: {
      overlayBg: 'rgba(3, 5, 10, 0.88)',
      panelBg: 'rgba(8, 12, 22, 0.94)',
      panelBorder: '1px solid rgba(34, 211, 238, 0.4)',
      panelShadow: '0 0 44px rgba(34, 211, 238, 0.18)',
      panelRadius: 16,
      panelMaxW: 780,
      panelPadX: 24,
      panelPadY: 22,

      title: { color: '#22d3ee', size: 22, tracking: '0.2em', weight: 800 },
      subtitle: { color: 'rgba(148, 163, 184, 0.95)', size: 13 },
      hint: { color: 'rgba(148, 163, 184, 0.8)', size: 12 },

      gridGap: 14,
      cardMin: 126, // dokunmatik hedef ≥44px (çok daha büyük)
      cardBg: 'rgba(15, 23, 42, 0.85)',
      cardBorder: '1px solid rgba(148, 163, 184, 0.25)',
      cardHoverBorder: 'rgba(34, 211, 238, 0.7)',
      cardActiveBorder: '#22d3ee',
      cardActiveGlow: '0 0 18px rgba(34, 211, 238, 0.55)',
      cardRadius: 14,
      cardPadY: 14,
      preview: 76,
      name: { color: '#e2e8f0', size: 14, weight: 700 },
      desc: { color: 'rgba(148, 163, 184, 0.9)', size: 11 },
      check: { color: '#22d3ee', size: 18 },

      close: { size: 44, color: '#e2e8f0', bg: 'rgba(30, 41, 59, 0.9)' },
      /** alt köşe açma butonu (mobil dokunmatik ≥44px) */
      button: {
        size: 44,
        minW: 116,
        bg: 'rgba(5, 7, 13, 0.82)',
        border: '1px solid rgba(34, 211, 238, 0.45)',
        color: '#22d3ee',
        glow: '0 0 14px rgba(34, 211, 238, 0.35)',
        radius: 22,
        edge: 16,
        labelSize: 13,
        tracking: '0.12em',
        weight: 700,
      },

      transitionMs: 220,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  },

  /* ---------- Market (coin ekonomisi + skin fiyatları + ölüm ekranı stili) ---------- */
  market: {
    /** ölümde coin kazancı: floor(skor×perScore + enİyiMass×perMass + süre×perSec) */
    perScore: 0.2,
    perMass: 0.02,
    perSec: 0.1,
    /** localStorage anahtarları (kalıcı envanter) */
    coinsKey: 'neon-arena.coins',
    ownedKey: 'neon-arena.skins',
  },
  /* ---------- Ölüm ekranı (dramatik karanlık tasarım token'ları) ---------- */
  deathScreen: {
    overlayBg: 'rgba(20, 2, 6, 0.82)', // kan karartması
    vignette: 'radial-gradient(ellipse at center, rgba(248, 113, 113, 0.16) 0%, rgba(20, 2, 6, 0) 65%)',
    panelBg: 'rgba(12, 4, 8, 0.94)',
    panelBorder: '1px solid rgba(248, 113, 113, 0.5)',
    panelShadow: '0 0 60px rgba(248, 113, 113, 0.22)',
    panelRadius: 18,
    titleColor: '#f87171',
    titleGlow: '0 0 24px rgba(248, 113, 113, 0.8), 0 0 60px rgba(248, 113, 113, 0.4)',
    killerColor: '#fca5a5',
    coinColor: '#fbbf24',
    coinGlow: '0 0 14px rgba(251, 191, 36, 0.6)',
    primaryBg: '#f87171',
    primaryHoverBg: '#ef4444',
    primaryColor: '#2a0a0a',
    enterMs: 320,
    statStepMs: 90,
    countUpMs: 700,
    easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)', // spring-ish giriş (oynak ama kontrollü)
  },
  entryMenu: {
    /** canlı backdrop (MenuBackdrop canvas) */
    backdrop: {
      bg: '#05070d', // gece arenası zemini
      grid: 'rgba(34, 211, 238, 0.13)', // kayan neon ızgara
      gridStep: 56, // canvas px (sabit ekran ritmi)
      gridSpeed: 18, // kayma hızı (px/sn, çapraz süzülme)
      dotCount: 26, // süzülen blob sayısı
      dotMaxR: 26, // max yarıçap (px)
      dotSpeed: 14, // süzülme hızı (px/sn)
      dotAlpha: 0.5, // blob opaklık tavanı
    },
    /** bölüm etiketi (AD / MOD / SKIN) — hud label dili */
    sectionGap: 18,
    /** giriş animasyonu (kademeli fade-up — interaction-design 200-300ms bandı) */
    enterMs: 260,
    enterStepMs: 70, // bölümler arası gecikme
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    /** kontrol çipleri (SPACE/W/F) */
    kbd: {
      bg: 'rgba(34, 211, 238, 0.12)',
      border: '1px solid rgba(34, 211, 238, 0.45)',
      color: '#a5f3fc',
      radius: 6,
      size: 12,
      padX: 8,
      padY: 4,
    },
  },
  startScreen: {
    /** localStorage anahtarı — oyuncu adı kalıcı (hücre + leaderboard'da görünür) */
    nameStorageKey: 'neon-arena.name',
    /** boş/geçersiz ad yerine kullanılan varsayılan */
    defaultName: 'PLAYER',
    maxLength: 15,

    overlayBg: 'rgba(255, 255, 255, 0.55)',
    panelBg: 'rgba(255, 255, 255, 0.94)',
    panelBorder: '2px solid #000000',
    panelShadow: '0 12px 44px rgba(0, 0, 0, 0.16)',
    panelRadius: 18,
    panelPadX: 34,
    panelPadY: 30,

    title: { text: 'NEON ARENA .io', color: '#111827', size: 40, weight: 800, tracking: '0.04em' },
    subtitle: { text: 'Adını yaz, sahaya in', color: '#4b5563', size: 15, weight: 500 },
    label: { text: 'OYUNCU ADI', color: '#111827', size: 12, tracking: '0.16em', weight: 700 },

    input: {
      radius: 10,
      border: '2px solid #d1d5db',
      focusBorder: '2px solid #000000',
      focusGlow: '0 0 0 4px rgba(34, 211, 238, 0.35)',
      color: '#111827',
      placeholderColor: '#9ca3af',
      size: 20,
      padX: 14,
      padY: 12,
      bg: '#ffffff',
    },

    /** PLAY — dokunmatik hedef ≥44px (52px) + basılı geri bildirimi */
    button: {
      label: 'PLAY',
      minH: 52,
      minW: 230,
      radius: 12,
      bg: '#22d3ee',
      hoverBg: '#06b6d4',
      activeBg: '#0e7490',
      color: '#05202a',
      border: '2px solid #000000',
      shadow: '0 6px 0 #000000',
      pressShadow: '0 2px 0 #000000',
      size: 20,
      weight: 800,
      tracking: '0.18em',
      pressPx: 4,
      pressMs: 90,
    },

    hint: { text: 'İsim hücrende ve skor tablosunda görünür', color: '#6b7280', size: 12 },

    /* ---------- KÖŞE DÜĞMESİ: GitHub'da yıldızla ----------
     *  Tasarım: Uiverse "Star on GitHub" (Kaizen0000). Renkler oyunun neon
     *  kimliğine eşlendi (dönen halka idle'da nötr, hover'da camgöbeği→mor→
     *  pembe; yıldız hover'da altın). Kural gereği tüm değerler burada. */
    github: {
      /** panel dışı köşe boşluğu (px) */
      edge: 20,
      /** küçük ekranlarda daraltma (px) */
      edgeCompact: 12,
      height: 50,
      heightCompact: 40,
      padX: 20,
      padXCompact: 14,
      radius: 999,

      /** düğme gövdesi */
      bg: 'rgba(7, 10, 18, 0.9)',
      bgHover: 'rgba(16, 22, 36, 0.95)',
      insetShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.14)',
      dropShadow: '0 10px 30px -12px rgba(0, 0, 0, 0.7)',

      /** dönen konik halka (idle → hover) */
      ringIdle: ['#2b3140', '#151922', '#2b3140'],
      ringHover: ['#22d3ee', '#a78bfa', '#f0abfc'],
      ringOpacity: 0.32,
      ringOpacityHover: 0.7,
      ringSpinSec: 4,

      /** parlama süpürmesi (hover'da bir kez) */
      shine: 'rgba(255, 255, 255, 0.16)',
      shineMs: 1200,

      /** ikon + ayraç */
      iconColor: '#9aa3b2',
      iconColorHover: '#ffffff',
      iconSize: 21,
      iconSizeCompact: 18,
      divider: 'rgba(255, 255, 255, 0.12)',
      dividerHover: 'rgba(255, 255, 255, 0.4)',

      /** yazı */
      text: 'GitHub\'da yıldızla',
      textColor: '#cbd5e1',
      textColorHover: '#ffffff',
      textSize: 14,
      textWeight: 700,

      /** yıldız (boş → hover'da dolu) */
      starIdle: '#7b8494',
      starHover: '#fbbf24',
      starGlow: 'rgba(251, 191, 36, 0.85)',
      starSize: 19,
      starSizeCompact: 16,

      /** tıklama patlaması (halka + 8 kıvılcım) */
      burstColor: 'rgba(251, 191, 36, 0.85)',
      burstMs: 600,
      burstRingScale: 2.4,
      burstFly: 38,
    },
  },
} as const;

