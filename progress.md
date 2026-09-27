# NEON ARENA .IO

> **agar.io tarzında** — hareket, büyüme, yutma ve harita ölçeği klasik
> formüllere sadıktır; üzerine derinlik ekonomisi (coin/XP/rank), 15 skin,
> 5 slotlu efekt marketi ve premium HUD eklendi. Tarayıcıda çalışır, sunucu
> yoktur, hesap yoktur.

| | |
|---|---|
| **Tür** | Tek oyunculu gerçek zamanlı FFA (agar.io klonu) |
| **Stack** | TypeScript + Canvas2D + React 19 + Vite 8 |
| **Render** | 60fps sabit adım (60 Hz), React'ten tamamen bağımsız oyun döngüsü |
| **Kalıcılık** | `localStorage` (coin, envanter, XP, skin, efekt, isim) |
| **Test** | 108 kontrollük görsel-işlevsel suite (Playwright + piksel doğrulama) |
| **Bağımlılık** | Yalnızca `react` + `react-dom` (runtime) |

---

## İçindekiler

1. [Hızlı Başlangıç](#hızlı-başlangıç)
2. [Oynanış](#oynanış)
3. [Mimari](#mimari)
4. [Tema Sistemi](#tema-sistemi)
5. [Dünya ve Harita](#dünya-ve-harita)
6. [Hücre Fiziği](#hücre-fiziği)
7. [Çok Hücreli Gövde](#çok-hücreli-gövde)
8. [Yem ve Toplama Zinciri](#yem-ve-toplama-zinciri)
9. [Bot Yapay Zekâsı](#bot-yapay-zekâsı)
10. [Hücre Yutma](#hücre-yutma)
11. [Virüs Mekaniği](#virüs-mekaniği)
12. [Pellet Sistemi (W)](#pellet-sistemi-w)
13. [Kamera](#kamera)
14. [Parçacık Sistemi](#parçacık-sistemi)
15. [Efekt Marketi](#efekt-marketi)
16. [Skin Sistemi](#skin-sistemi)
17. [Ekonomi: Coin, XP, Rank](#ekonomi-coin-xp-rank)
18. [HUD](#hud)
19. [Menüler ve Akış](#menüler-ve-akış)
20. [Test Sistemi](#test-sistemi)
21. [Dosya Haritası](#dosya-haritası)
22. [Bilinen Sınırlar](#bilinen-sınırlar)

---

## Hızlı Başlangıç

```bash
npm install
npm run dev          # http://localhost:5173
```

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Vite dev sunucusu |
| `npm run build` | `tsc --noEmit` + üretim derlemesi |
| `npm run typecheck` | Sadece tip kontrolü |
| `npm run test:visual` | 108 kontrollük görsel-işlevsel test suite |

**Test notu:** Suite Playwright + gerçek tarayıcı kullanır, dev sunucu açık
olmalıdır. Depoda `chromium.launch()` düz çağrısıdır; Playwright tarayıcı
paketleri indirilmemişse `chromium.launch({ channel: 'chrome' })` ile sistem
Chrome hedeflenebilir.

---

## Oynanış

| Girdi | Etki |
|---|---|
| **Fare** | Hücreyi imlece sürükler (hedefe doğru ivme, yaklaşırken yavaşlar) |
| **Space** | Bölünme (split) — her hücreyi ikiye böler, cooldown 1 sn |
| **W** | Kütle fırlatma (eject) — saniyede en fazla 7 pellet |
| **K** | Skin / efekt marketi |
| **F** | Tam ekran |
| **F3** | Virüs teşhis overlay'i (neden patlamıyor?) |
| **Enter** | Ölüyken anında yeniden doğma |

**Döngü:** yem topla → büyü → rakibi yut veya virüs patlat → daha büyük hücreler
seni yutar → ölüm ekranı coin kazandırır → XP kalıcı ilerler → markette güçlen.

### Skor, coin ve XP farkı

| Katman | Yaşam süresi | Amaç |
|---|---|---|
| **SCORE** | Koşu (ölünce sıfırlanır) | Sıralama tablosu, coin formülü |
| **COIN** | Kalıcı | Skin ve efekt satın alma |
| **XP** | Kalıcı | Seviye + unvan (rank) |

---

## Mimari

Katmanlar **tek yönlü** bağımlılık zincirindedir; `logic/` hiçbir zaman `render/`
veya `ui/` importu yapmaz.

```
main.tsx → App.tsx
              ├── Game.ts        ← ana döngü: input → step → render
              │     ├── logic/   ← SAF KURAL (state'i yazar)
              │     ├── render/  ← SADECE OKUR (state'i değiştirmez)
              │     └── ui/      ← React HUD/menüler (snapshot okur)
              └── theme/visualTheme.ts  ← görsel kimliğin TEK kaynağı
```

| Klasör | Sorumluluk | Kural |
|---|---|---|
| `src/logic/` | Oyun kuralları, durum, matematik | `render/` importu **YASAK** |
| `src/render/` | Canvas çizimi | `logic/`'i yalnızca **okur** |
| `src/game/` | Döngü, kamera bağlama, olay tüketimi, test kancaları | React'ten bağımsız |
| `src/ui/` | HUD, menüler (React) | Oyun state'ine **yazmaz**, snapshot okur |
| `src/theme/` | Tüm renk/boyut/animasyon sayıları | UI'da hardcoded hex/px **YASAK** |

### Veri akışı

1. `PointerInput` imleci okur → dünya hedefi üretir
2. `stepState()` mantığı ilerletir ve `state.events` kuyruğunu doldurur
3. `Game.step()` olayları tüketir (POOF, halka, XP metni)
4. `Game.render()` çizim yapar
5. React HUD, `game.getHudSnapshot()` ile **kendi zamanında** okur — oyun döngüsü
   React render'ına bağlı değildir

**Efekt katmanları:** `render/fx/` üç ayrı mekanizma kullanır —
`ImpactFx` (imza, garantili), `ParticlePool` (doku, bütçeli) ve
`OrbitAura` (saf çizim). Ayrımın ölçülebilir kanıtı testte: havuz 225/240
dolu iken yutma efekti hâlâ tetikleniyor.

**Tek döngü kuralı:** oyun `requestAnimationFrame` ile ilerler; React asla kare
başına render edilmez. HUD veriyi `requestAnimationFrame` + kare bütçesiyle
kendi zamanında çeker, oyun döngüsünü **tetiklemez**.

---

## Tema Sistemi

`src/theme/visualTheme.ts` (590 token) görsel kimliğin **tek kaynağıdır**.
UI bileşenleri renk/boyut için CSS değişkeni türetir, `render/` mantık
sabitlerini buradan okur.

| Blok | İçerik |
|---|---|
| `size` | Dünya, yem, hücre ölçüleri |
| `camera` | Zoom sınırları ve sönümleme |
| `growth` | Kütle→yarıçap eşiği, kazanç, evrim kademeleri |
| `movement` / `animation` | Hız, ease, damping |
| `game` | Bot sayısı, yutma, split, virüs, decay, saçılma kuralları |
| `particles` | Havuz kapasitesi, POOF/halka parametreleri, görsel bütçe |
| `hud` / `xp` / `market` / `skin` / `deathScreen` / `startScreen` | Arayüz token'ları |

Yeni görsel özellik eklerken **önce buraya** token ekle; render/UI'da sabit yazma.

---

## Dünya ve Harita

| Parametre | Değer | Not |
|---|---|---|
| Dünya | **20 000 × 20 000** px | Referans agar.io 4× |
| Izgara adımı | 80 px | Zemin çizgisi `theme.color.grid` = `#e0e0e0` |
| Yem yarıçapı | 24 px | Izgara hücresinin ~%60'ı |
| Yem sayısı | **6 000** | Yoğun FFA; üst sınır 7 000 (ölüm saçılması payı) |
| Başlangıç kütlesi | 100 | Yarıçap 100 px |
| Hücre kenarı | 10 px | Kalın koyu kontur (agar.io imzası) |
| Dünya sınırı | 2 px | Ekran sabit net siyah çizgi |

Yem alanı **uniform** dağıtılır (dört çeyrek dengeli), her yem `seed` ile
kendi hue'sunu alır — böylece renk çeşitliliği doğal görünür.

---

## Hücre Fiziği

### Büyüme — kütle doğrusal, yarıçap karekök

```
mass  (doğrusal artar)     her yem +10
radius = 100 × √(mass/100)  (√ ile büyür)
```

Alan `πr²` doğrusal büyüdüğü için ilk yemlerde hızlı, sonra yavaşlayan dengeli
gelişim verir — agar.io/slither.io standardı. **Tavan yoktur.**

Evrim kademeleri (görsel detay seviyesi): `100 → 150 → 260 → 450 → 800`

### Hız

```
speed = 340 / (1 + ln(mass/100)/ln(4.5))
```

Büyük hücreler logaritmik olarak yavaşlar. Yaklaşırken hız mesafeyle orantılı
azalır (glide mesafesi 50 px) — hedefe zıplama yoktur.

### Dünya sınırı

Hücre merkezi duvardan **r/3** kadar içeride durur; kontur duvara taşar ve
renderer hücreyi **yassılaştırır** (agar.io `adjustForBoundaries` modeli).

### Kütle çürümesi (decay)

`mass > 150` olan her hücre saniyede `%0.4` kütle kaybeder → krallar sonsuza
büyüyemez, geç oyun baskısı oluşur.

### Hareket yumuşatma

Tüm entegrasyon **kare hızından bağımsızdır**: `k = 1 − e^(−lerp·dt)`.
60 Hz ve 144 Hz'de aynı his verir.

---

## Çok Hücreli Gövde

Hücre tek bir gövde değil, **parçalardan** oluşur. Her parça kendi kütlesi,
yarıçapı ve hızına sahiptir.

| Parametre | Değer | Davranış |
|---|---|---|
| Parça tavanı | 16 | Resmî agar.io |
| Min split kütlesi | 35 | Parça sonucu bunun altına düşemez |
| Fırlatma | max(taban hız × 2, 280 px/sn) | Kütle arttıkça orantılı |
| Sönüm | 3.2 /sn (exp) | ~1 sn'de durulur |
| Birleşme | 15 sn taban + kütle×0.02, tavan 35 sn | Büyük gövde geç birleşir |
| Birleşme örtüşmesi | %45 | Derin örtüşen kendi parçaları birleşir |
| İtişme | (r₁+r₂) × 0.45 /sn | Yarıçap ölçekli — dev parçalar da ayrışır |

**Zincir:** split → parçalar fırlatılır → `timeToMerge` gelene kadar **birbirini
iter** → süre dolunca **birleşir** → yeni parçalar oluşur.

---

## Yem ve Toplama Zinciri

Yem toplama üç aşamalı **geri bildirim** zinciridir (sessiz aksiyon yok):

```
temas → 150 ms çekiliş (hücreye doğru büyür) → çözülme (POOF + halka + XP metni)
```

- Çekiliş süresi 0.15 sn — yutulma anı okunur, ama ani kesme hissi vermez
- Çözülmede: skor +1, kütle +10; POOF tam yiyenin hücre merkezinden patlar
- Alan sabit tutulur: her yenen yemin yerine rastgele bir yenisi doğar (1:1)
- Yem rengi `seed`'den türetilir; POOF aynı rengi kullanır

**Görsel bütçe:** Havuz oyunun ortak kaynağıdır. Tek adımda 40+ yem çözülürse
(ölüm saçılma halkası) yalnızca bütçe kadar POOF basılır — mantık değişmez.

---

## Bot Yapay Zekâsı

60 bot, **oyuncuyla aynı** `updatePlayer` / `Growth` / `Devour` kodundan geçer.
Pathfinding yok; öncelik tabanlı hedef seçimi:

| Öncelik | Koşul | Davranış |
|---|---|---|
| 1. **KAÇ** | 260 px içinde daha büyük hücre | Tehditten uzaklaş |
| 2. **SALDIR** | 300 px içinde küçük hücre | Avın üzerine git |
| 3. **YEM** | 900 px içinde yem | En yakın yeme |
| 4. **GEZ** | Hiçbiri yok | 480 px içinde rastgele gezinme (4 sn'de yenilenir) |

Yön değişimleri **damping'li** (0.15) — botlar ani dönmüyor, viraj alıyor.
Botlar `classic` skin ile doğar (agar.io tarzında: rakipler düz dolgulu hücreler).

---

## Hücre Yutma

Agar.io'nun klasik kuralı, **hücre çiftleri** arasında uygulanır:

```
a.mass ≥ b.mass × 1.15   VE   derin örtüşme
yeme mesafesi = aR − bR × 0.3
```

| Parametre | Değer |
|---|---|
| Kütle oranı | ×1.15 (%15 kuralı) |
| Örtüşme | Küçük hücre yarıçapının %30'u kadar merkez içinde olmalı |
| Kütle devri | Yutulan kütlenin **tamamı** (gain = 1) |
| Skor kazancı | Yutulan kütle × 1 |

### Ölüm ve saçılma

Kurban öldüğünde kütlesinin **%50'si** halka şeklinde yem olarak saçılır
(yeniden doğan oyuncu veya katil toplayabilir → intikam yolu açık).
Halka yarıçapı `(yiyenR + kurbanR) × 1.3`, üst sınır 24 yem.

Oyuncu öldüğünde: **ölüm ekranı** açılır (otomatik respawn yok) —
`TEKRAR OYNA` veya `İZLE` (lideri spectate) seçilir. Skin, efektler ve isim
korunur; kütle/skor tabana döner.

---

## Virüs Mekaniği

Yeşil dikenli denge mekaniği — **yeme ve split ayrı olaylar** (resmî agar.io):

1. **YEME (koşulsuz):** hücre virüsten büyükse ve değiyorsa virüs **her zaman**
   silinir, kütlesi hücreye geçer — parça tavanına bakılmaz
2. **SPLIT (koşullu):** yalnızca parça sayısı 16'nın altındaysa radial patlama —
   tavantaki hücre patlamaz, sadece yer
3. **Küçük hücre** → virüsün altına saklanır, etkileşim yok

| Parametre | Değer |
|---|---|
| Sahadaki virüs | 30 (sabit) |
| Doğuş / tavan kütle | 100 / 600 |
| Şişkinlik sönümü | 25 kütle/sn (tabana iner, saha temiz kalır) |
| Top fırlatma eşiği | 212 kütle → 120 kütlelik virüs topu fırlatılır |
| Top hızı | 800 px/sn |
| Görünüm | 36 diş, 144 kontur noktası, 0.8 rad/sn dönüş |

Uçan pellet (W) **yalnızca duran** virüsü besler; eşiğe ulaşınca top fırlatır.

---

## Pellet Sistemi (W)

Hücreden ayrılan ve yavaşlayıp yere düşen kütle — takım besleme / tuzak / virüs besleme.

| Parametre | Değer |
|---|---|
| Pellet kütlesi | 16 (hücreden düşer) |
| Ateşleme eşiği | Hücre ≥ 35 kütle |
| İlk hız / sürtünme | 900 px/sn / 3.0 /sn |
| Yere inme hızı | 70 px/sn altı → normal yeme döner |
| Hız sınırı | 7 pellet/sn (token bucket, tavan 14) |

---

## Kamera

```
zoom = baseZoom × (baseRadius / radius)^0.75
```

- Aralık: **0.15 – 1.0** (asla native ölçeğin üstüne çıkmaz)
- Sönümleme: `0.1` @60 Hz, kare hızından bağımsız formülle
- Tarayıcı zoom telafisi: Ctrl+tekerlek `devicePixelRatio`'ı değiştirse bile
  efektif görüş alanı sabit kalır (`refDpr / dpr` çarpanı)
- Ölürken: kamera lidere kilitlenir (spectate) veya ölüm noktasında sabit kalır

**Detay kademesi (LOD):** hücre ekran yarıçapı 28 px altına inince detay azalır,
14 px altına inince isim kaybolur (okunurluk).

---

## Parçacık Sistemi

`src/render/ParticlePool.ts` — **önceden ayrılmış nesne havuzu**.

| Özellik | Değer |
|---|---|
| Kapasite | 240 sabit slot (çalışma sırasında büyümez) |
| Türler | `dot`, `ring`, `spark`, `glyph`, `glow` |
| Slot tahsisi | Üretim yavaş → **önce boş slot kullanılır** (starvation yok) |
| Görsel bütçe | Adım başına 54 POOF (çoklu yem fırtınasında) |

**Neden boş slot önceliği:** imleç yalnızca ilerletilseydi, üretim ölümden hızlı
olduğunda her slotun ömrü tazelenir ve hiçbir parçacık ölmezdi; havuz kalıcı
dolar, yutma/ölüm geri bildirimi boğulurdu.

Parçacıklar **dünya koordinatında** tutulur, kamera transformuyla çizilir —
bu sayede zoom'a doğru ölçeklenirler.

---

## Efekt Marketi

5 slot, birbirinden bağımsız; aynı anda 5 efekt kuşanılabilir. Her efekt
oyuncu hücrelerine takılır.

| Slot | Efekt | Fiyat | Görsel |
|---|---|---|---|
| **İZ** | Neon İz | 300 | Cyan nokta izi |
| | Yıldız İzi | 500 | Beyaz/mor yıldız kıvılcımları |
| | Rün İzi | 650 | Dönen antik rün glifleri (8 karakter) |
| | **Galaktik İz** | 1200 | Gradyan, path-following premium şerit |
| **YUTMA** | Şok Dalgası | 600 | Rakibi yutarken genişleyen altın halka |
| **BÖLÜNME** | Sonic Boom | 450 | Bölünmede beyaz ses duvarı halkası |
| **AURA** | Yörünge | 800 | Hücre çevresinde dönen 3 gezegen |
| **ATIŞ** | Alev Topu | 550 | W pellet'leri alev topuna dönüşür |

### İki katmanlı efekt mimarisi

Satın alınan efektlerin görünürlüğü **garanti** olmak zorunda. Ölçüm bunu
zorunlu kıldı: yem POOF'ları havuzu doldurduğunda (240/240) havuzdan basılan
efekt sessizce eziliyordu.

| Katman | Ne çizer | Neden |
|---|---|---|
| **İmza** (`ImpactFx`) | Bölünme/yutma halkaları, radyal çizgiler, çekirdek flaş | 16 sabit slot, havuzdan **bağımsız**; yem fırtınasında bile okunur |
| **Doku** (`ParticlePool`) | Kırıntı, köz, alev izi, namlu | Oyunun ortak kaynağı + bütçeli; sıkışınca ezilmesi doğru davranış |
| **Çizim** (`OrbitAura`) | Aura gezegenleri (sürekli açık) | Parçacık **kullanmaz** — sürekli üretim havuzu boğardı |

Ek kurallar:

- **Gecikmeli kademe** — halkalar üst üste doğarsa tek kalın halka gibi okunur;
  sıraya binince gerçek dalga hissedilir (`Particle.delay`)
- **Ölçekleme** — yutma dalgası kurbanın, bölünme boom'u gövdenin boyutundan
  çıkar (eskiden sabit 220 px idi: her gövde aynı patlamayı alıyordu)
- **Beyaz zemin kontrastı** — agar.io zemini beyaz: soluk renkler (`#e0f2fe`,
  `#fde68a`, beyaz gezegen) görünmez. Her efekt kendi zıt paletini kullanır
- **Ekran-oranlı boyut** — dünya px'te sabit boyutlar küçük zoom'da kayboluyordu
  (aura gezegeni 1.9 ekran px'e düşüyordu); oran veya `/zoom` kullanılır

### Galaktik İz — path following

Diğer izler hücre merkezinden **aralıklı** parçacık basar (nokta dizisi).
Galaktik İz bunun yerine **tartılan yolu** izler:

1. Her hücre için son kare dünya konumu saklanır
2. Son konum → bu konum arası mesafe 16 px adımlara bölünür
3. Her adıma çekirdek nokta (keskin) + yumuşak hale (geniş) çifti basılır
4. Renk yol boyunca **hue akışı** (0.16 hue/px) + zamanla genel kayma (26°/sn)
5. Boyut sinüsle dalgalanır (5.2 rad/sn, %34 derinlik)
6. Ömür hıza bağlı: hızlı hücre = daha uzun iz

Havuz %70 doluyken iz basılmaz — yutma/ölüm geri bildirimi iz tarafından
boğulmaz. Hareket yavaşlayınca konum tazelenir, yeniden hızlanınca harita boyu
sıçrama olmaz.

---

## Skin Sistemi

15 skin, hepsi coin ile alınır; `classic` doğuştan açıktır ve sprite yerine
**prosedürel** çizilir (her zaman yüklenir, 404 riski yok).

| Skin | Fiyat | Skin | Fiyat |
|---|---|---|---|
| Classic Model | **0** | Lava Topu | 650 |
| Sevimli Karakter | 150 | Phantom | 700 |
| Slime | 250 | Galaksi | 750 |
| Alev Topu | 400 | Cosmic | 800 |
| Frostbite | 450 | Dragon | 900 |
| Kurt / Ejderha | 500 | Önerilen Model | 1000 |
| Cyborg | 550 | Celestial Dragon | 1200 |
| Aslan | 600 | | |

- Sprite'lar `public/skins/<id>.png` (14 dosya, ~2 MB)
- Seçim anında **ışık halkası** ile geri bildirim verilir (sessiz aksiyon yok)
- Satın alma tek kapıdan: bakiye + kilit + geçerli id → envantere yazılır

---

## Ekonomi: Coin, XP, Rank

### Coin (harcanabilir)

Yalnızca **ölümde** kazanılır, tek seferlik claim edilir:

```
coin = floor(skor × 0.2 + enİyiMass × 0.02 + süre(sn) × 0.1)
```

### XP (kalıcı ilerleme)

| Kaynak | XP |
|---|---|
| Yem | +2 |
| Virüs | +20 |
| Hücre yutma | `round(kurbanMass × 0.25)` |

Eğri: **L → L+1 için gerekli = round(80 × L^1.55)**, tavan **200. seviye**.

| Seviye | Gereken XP |
|---|---|
| 1 | 80 |
| 10 | 2 839 |
| 50 | 34 395 |
| 100 | 100 714 |
| 200 | 294 908 (tavan) |

Kilometre taşı rozetleri: **10. seviye** (yeşil), **25. seviye** (mor),
**50. seviye** (altın) — ulaşılan en yüksek rozet uygulanır.

### Rank (unvan)

20 seviyede bir unvan değişir, 10 basamaklı:

`ROOKIE → SCOUT → HUNTER → RAIDER → BERSERKER → WARLORD → JUGGERNAUT → PHANTOM → TITAN → OMEGA`

Rank rengi CSS değişkeni (`--rp`) olarak **bir kez** verilir; madalyon, ray,
kilometre taşı ve unvan satırı türevlerini oradan alır.

---

## HUD

Oyun alanını kaplamayan iki köşe modülü + ekran ortası tamamen açık.

**Sol modül — skor okuması**
- Hero `SCORE` (34 px) → dikey saç teli → `SIZE` / `COIN` ikilisi
- Altta tam taşmalı **rank ünitesi**: 46 px madalyon (yürüyen başlı noktalı
  ilerleme halkası) + kilometre taşlı XP rayı + yükselen XP metni
- Seviye atlarken madalyon pop + genişleyen şok dalgası + 2.4 sn gradient band

**Sağ modül — sıralama**
- Başlık + gradyan kural çizgisi + canlı sayacı
- Gerçek kütle sıralaması (YOU + botlar), 1. sıra altın aksan
- `YOU` satırı sol aksan işaretiyle

**Tek kabuk:** `rgba(8,10,18,0.9)` gövde, saç teli kenar, üstte nefes alan neon
hat. Skor rengi `#22d3ee`; coin altın.

**Kompakt (≤640 px):** skor 24 px, madalyon 36 px, ray 8 px, canlı sayacı
gizlenir, iki modül yan yana sığar. Yatay taşma yok.

---

## Menüler ve Akış

1. **İsim ekranı** — oyun adı + PLAY; oyun başlamadan dünya **donuk** (adım
   işlenmez). Ad kalıcı saklanır ve hücrede + leaderboard'da anında görünür.
2. **Oyun** — HUD + isim ekranı gizli
3. **Skin/efekt marketi (K)** — SKINLER / EFEKTLER akordeon bölümleri, coin
   bakiyesi, kilitli kartlarda fiyat. Açıkken oyun girdisi kapanır.
4. **Ölüm ekranı** — dramatik karanlık panel: skor, en iyi kütle, süre, katil
   avatarı, kazanılan coin; `TEKRAR OYNA` / `İZLE`
5. **Seviye bandı** — oyun içi, 2.4 sn

Tüm menüler React; oyun state'ine **yazmaz**, `Game` metodlarını çağırır
(`setSkin`, `setEffect`, `clearEffect`, `startGame`, `respawn`, `spectate`).

### Kalıcı depolama

| Anahtar | İçerik |
|---|---|
| `neon-arena.name` | Oyuncu adı |
| `neon-arena.coins` | Coin bakiyesi |
| `neon-arena.skins` | Satın alınan skin envanteri |
| `neon-arena.skin` | Kuşanılan skin |
| `neon-arena.effect` | Kuşanılan iz/efekt kimliği |
| `neon-arena.xp` | Toplam XP |

---

## Test Sistemi

`test/visual-test.mjs` — **108 kontrol**, Playwright ile gerçek tarayıcıda.
DOM/CSS kontrolleri "var" der; **piksel kontrolleri "görünür"** der
(PNG decode + renk/şekil sayımı).

**Son koşu: 108/108 geçti** (konsol hatası dahil).

| Alan | Kapsam |
|---|---|
| Oynanış | Başlangıç durumu, hareket, yön değişimi, toplama, büyüme formülü, stres |
| Görsel | Yem gövdesi, kontür yokluğu, glif yokluğu, hücre membranı, zemin |
| HUD | Senkron, renk, bump, köşe yerleşimi, panel çakışmaması, merkez açıklığı |
| Bot | Spawn, hareket, yem, kaç, saldırı, ekran çizimi |
| Yutma | Eşik, kütle/skor devri, ölüm, yeniden doğuş, saçılma |
| Harita | 20000², sınır çizgisi, void zemini, duvara yassılaşma |
| Ekonomi | Skin market, efekt kartları, sprite, XP |
| Efektler | 4 slot (YUTMA/BÖLÜNME/AURA/ATIŞ): tetiklenme, ömür, sızıntı, piksel |
| Regresyon | Parçacık havuzu: toplu yem fırtınası + açlık (starvation) |

### Test kancaları

Oyun `window` üzerine teşhis kancaları açar (`Game.ts`): `render_game_to_text`,
`advanceTime`, `test_spawn_food`, `test_remove_food`, `test_clear_near_player`,
`test_set_player_pos`, `test_set_bot_pos`, `test_set_bot_skin`, `test_set_combat`,
`test_set_mass`, `test_count_particles`, `test_clear_particles`,
`test_particle_kinds`, `test_reset_pulls`, `test_respawn`.

`render_game_to_text()` oyunun **metin özeti** (konum, kütle, yemler, kamera,
olaylar) döndürür; `advanceTime(ms)` deterministik adım atlatır.

**Ölüm akışı notu:** Olanda otomatik yeniden doğma yoktur (ölüm ekranı bekler).
Testler bunu `test_respawn()` ile taklit eder.

---

## Dosya Haritası

```
src/
├── main.tsx, App.tsx              Giriş + kabuk
├── game/Game.ts                   Ana döngü, olay tüketimi, test kancaları
├── logic/                         SAF KURALLAR (state'i yazar)
│   ├── GameState.ts               Durum sahibi + adım sırası
│   ├── Player.ts                  Hücre fiziği, split/merge, spawn
│   ├── Growth.ts                  Kütle → yarıçap formülü
│   ├── Food.ts                    Yem alanı + çekiliş/çözülme
│   ├── Bot.ts                     Bot üretimi + hedef kararı
│   ├── Devour.ts                  Hücre yutma + ölüm saçılması
│   ├── Virus.ts                   Virüs mekaniği
│   ├── Pellets.ts                 Uçan kütle
│   └── types.ts                   Paylaşılan tipler
├── render/                        SADECE OKUR
│   ├── Camera.ts                  Zoom + takip
│   ├── BackgroundRenderer.ts      Grid + dünya sınırı
│   ├── FoodRenderer.ts            Düz agar.io yemi
│   ├── PlayerRenderer.ts          Hücre, membran, isim plakası, yörünge
│   ├── VirusRenderer.ts           Dikenli virüs
│   ├── ParticlePool.ts            Parçacık havuzu (ortam dokusu)
│   ├── fx/                         EFEKTLER KATMANI
│   │   ├── Emitter.ts              tsParticles tarzı deklaratif emisyon
│   │   ├── ImpactFx.ts             İMZA efekti (garantili, havuzdan bağımsız)
│   │   ├── Effects.ts              YUTMA/BÖLÜNME/ATIŞ emisyonu
│   │   └── OrbitAura.ts            AURA çizimi (parçacıksız, LOD'lu)
│   ├── DevourFx.ts                Emilim hayaleti + gulp
│   ├── FloatText.ts               Yüzen XP metinleri
│   └── SkinAssets.ts              Sprite önbelleği
├── ui/                            React arayüz
│   ├── Hud.tsx                    İki modül + rank ünitesi
│   ├── LevelMeter.tsx             Madalyon, ray, band
│   ├── StartScreen.tsx / SkinMenu.tsx / SkinGrid.tsx
│   ├── DeathScreen.tsx / MenuBackdrop.tsx / leaderboard.ts
├── skins/
│   ├── registry.ts                15 skin kataloğu
│   ├── effects.ts                 8 efekt / 5 slot kataloğu
│   └── market.ts                  Coin + envanter
├── progression/xp.ts              XP eğrisi + seviye
├── input/PointerInput.ts          İmleç → dünya hedefi
└── theme/visualTheme.ts           Görsel kimliğin tek kaynağı

tools/
├── gen-skins.py                   Skin sprite üretimi (Gemini AI → public/skins)
└── SKIN_PROMPTS.md                Her skin için üretim promptu
```

**Kod tabanı:** 36 dosya, ~7 800 satır (TypeScript/TSX). Tema dosyası 1 070 satır,
590 tanım.

### Skin üretim hattı

Skin sprite'ları AI ile üretilir, kod ile **değil**:

1. `tools/SKIN_PROMPTS.md` içindeki prompt kullanılır
2. `python tools/gen-skins.py [id...]` → Gemini AI → `public/skins/<id>.png`
3. `src/render/SkinAssets.ts` görseli önbelleğe alır, daire içinde kırpar
4. Sprite yüklenemezse renderer `classic` prosedürel paletine **düşer**
   (boş gövde asla gösterilmez — test bunu doğrular)

---

## Bilinen Sınırlar

- **Sunucu yoktur** — oyun tamamen istemcidedir ve **hiçbir ağ isteği yapmaz**
  (kaynakta `fetch` / `WebSocket` yok). İlerleme verisi yalnızca `localStorage`
  alanında durur; tarayıcı verisi silinince sıfırlanır.
- **Hesap yoktur** — tüm ilerleme `localStorage`'dadır (tarayıcı/cihaz bağlı).
- **Çok oyunculu değildir** — 60 bot aynı fizik motoruyla simüle edilir.
- **Kütle tavanı yoktur** — büyük hücreler görünür büyük kalır; ekranı kaplama
  korkusu zoom'a emanet edilmiştir.
- **Tema ihlali notu:** `FoodRenderer` yem wobble'ını tema yerine sabit sayılarla
  hesaplar; `foodWobble` bloğu bu yüzden kullanılmıyor ve kaldırıldı.
