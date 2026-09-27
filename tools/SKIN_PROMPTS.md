# Skin Sprite Üretim Rehberi — AI Studio Web

**Nerede:** https://aistudio.google.com → sol menü **Generate images** (ücretsiz, aynı Nano Banana modelleri)
**Ayarlar:** Aspect ratio **1:1 (kare)** · Model: Nano Banana / Gemini 2.5 Flash Image (varsa Pro daha kaliteli)

Her prompt'u yapıştır → üret → **Download PNG** ile indir.

## Dosya adları (önemli!) → `public/skins/` klasörüne bu isimlerle kaydet

| # | Prompt (kopyala-yapıştır) | Kaydedilecek dosya |
|---|---|---|
| 1 | `Game asset for a neon .io arcade game: a single perfectly circular orb character, perfectly centered and inscribed touching all four edges of the square frame, circular body fills 100% of the frame. MODERN CYAN FLAME ORB — icy cyan-to-azure glossy sphere with a fierce determined expression, wispy electric-blue flame aura licking around the rim. Polished game-art quality, smooth airbrushed shading, vibrant neon rim light, big glossy expressive eyes, subtle inner gradient depth, crisp edges, no text, no watermark, no border, pure solid black background.` | `recommended.png` |
| 2 | `Game asset for a neon .io arcade game: a single perfectly circular orb character, perfectly centered and inscribed touching all four edges of the square frame, circular body fills 100% of the frame. FIRE ORB — orange-red blazing sphere with angry competitive eyes, yellow-hot core fading to deep red edges, small flame licks around the rim. Polished game-art quality, smooth airbrushed shading, vibrant neon rim light, big glossy expressive eyes, subtle inner gradient depth, crisp edges, no text, no watermark, no border, pure solid black background.` | `ignite.png` |
| 3 | `Game asset for a neon .io arcade game: a single perfectly circular orb character, perfectly centered and inscribed touching all four edges of the square frame, circular body fills 100% of the frame. CUTE BLOB — friendly pastel blue smiley sphere, huge sparkly kawaii eyes, soft rosy cheeks, warm welcoming expression, gentle pastel gradient. Polished game-art quality, smooth airbrushed shading, vibrant neon rim light, subtle inner gradient depth, crisp edges, no text, no watermark, no border, pure solid black background.` | `cute.png` |
| 4 | `Game asset for a neon .io arcade game: a single perfectly circular orb character, perfectly centered and inscribed touching all four edges of the square frame, circular body fills 100% of the frame. DARK WOLF WARRIOR — dark navy-black orb decorated like a snarling wolf mask, piercing icy-blue glowing eyes, sharp angular fur markings, aggressive intimidating look. Polished game-art quality, smooth airbrushed shading, vibrant neon rim light, subtle inner gradient depth, crisp edges, no text, no watermark, no border, pure solid black background.` | `wolf.png` |
| 5 | `Game asset for a neon .io arcade game: a single perfectly circular orb character, perfectly centered and inscribed touching all four edges of the square frame, circular body fills 100% of the frame. GALAXY SWIRL — deep purple cosmic sphere with a spiral nebula core, twinkling stars inside, violet-to-magenta glow, dreamy premium look. Polished game-art quality, smooth airbrushed shading, vibrant neon rim light, subtle inner gradient depth, crisp edges, no text, no watermark, no border, pure solid black background.` | `galaxy.png` |
| 6 | `Game asset for a neon .io arcade game: a single perfectly circular orb character, perfectly centered and inscribed touching all four edges of the square frame, circular body fills 100% of the frame. GREEN SLIME BLOB — translucent jelly-green slime ball with a happy innocent face, wobbly glossy gel surface, a small slime bubble on top, playful and colorful. Polished game-art quality, smooth airbrushed shading, vibrant neon rim light, subtle inner gradient depth, crisp edges, no text, no watermark, no border, pure solid black background.` | `slime.png` |
| 7 | `Game asset for a neon .io arcade game: a single perfectly circular orb character, perfectly centered and inscribed touching all four edges of the square frame, circular body fills 100% of the frame. LAVA ORB — molten magma sphere with glowing cracks, menacing fiery eyes, dark cooled crust over a white-hot core, threatening and powerful. Polished game-art quality, smooth airbrushed shading, vibrant neon rim light, big glossy expressive eyes, subtle inner gradient depth, crisp edges, no text, no watermark, no border, pure solid black background.` | `lava.png` |

## Notlar
- Gövde **kareyi kenarlara kadar doldursun** — renderer görseli daire içinde clip eder (arka plan köşeleri kırpılır).
- Siyah zemin tercih sebebi: glow kenarları zeminle bütünleşir.
- İstersen sonuçları beğenmezsen prompt'taki tarif kısmını değiştirip yeniden üret.
- Dosyalar `public/skins/` altına indirildiği an oyun otomatik kullanır (yenileme yeterli).

## Alternatif: API (faturalandırma açık ise)
`python tools/gen-skins.py` — yukarıdaki 7 skin'i toplu üretir (aynı prompt'lar, `.env` GEMINI_API_KEY ile).
