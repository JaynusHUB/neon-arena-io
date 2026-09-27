/**
 * visual-test.mjs — develop-web-game döngüsü: aksiyon → screenshot → state → kontrol.
 * Kullanım: node test/visual-test.mjs (dev sunucu açıkken)
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, unlinkSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = join(__dirname, 'shots');
mkdirSync(SHOT_DIR, { recursive: true });
// Eski koşudan kalma yanıltıcı shot'ları temizle
for (const f of readdirSync(SHOT_DIR)) {
  if (f.endsWith('.png')) unlinkSync(join(SHOT_DIR, f));
}

const URL = process.env.GAME_URL || 'http://localhost:5173';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tüm botları sahneden uzağa park et (skipIndex hariç) — kalabalık sahnede
 *  başıboş botlar deterministik sahneleri bozar (yem yeme/çekişme). Koordinat
 *  ızgarası bot sayısından bağımsız üretilir (botCount payload'dan okunur).
 *  BÖLGE: (10000..19000)² — 8d/11/12 sahne köşesi (4700,4700), §13 sağ duvar
 *  (≈19900,2500) ve §10 parkı (3700,3700) hep ≥7000px uzakta. ARALIK 1000px:
 *  komşu bot yarıçapları toplamı (<800) alt sığıyor → combat penceresinde
 *  birbirini yiyip ölüm saçılmasını şişiremiyor (eski 500px'te 4800,4800 sahneye
 *  141px geliyordu). */
const parkAll = async (page, skipIndex) => {
  const { botCount } = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  let k = 0;
  for (let i = 0; i < botCount; i++) {
    if (i === skipIndex) continue;
    const px = 10000 + (k % 10) * 1000;
    const py = 10000 + Math.floor(k / 10) * 1000;
    k++;
    await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [i, px, py]);
  }
};

const results = { checks: [], errors: [] };
function check(name, ok, detail = '') {
  results.checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
}

/* --- Piksel doğrulama: DOM/CSS kontrolleri "var" der, piksel kontrolü "görünür" der --- */
const CYAN = [34, 211, 238]; // theme: scoreValue.color — HUD'a özgü (yemler yeşil, oyuncu ekranda merkezde)

/** Minimal PNG decoder (8-bit, non-interlaced, RGB/RGBA) */
function decodePNG(buf) {
  let pos = 8;
  let w = 0;
  let h = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = colorType === 6 ? 4 : 3;
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = raw[p + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    p += stride;
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, bpp, data: out };
}

/** rect {x,y,w,h} içinde ref rengine (toleransla) uyan piksel sayısı */
function countPixels(img, rect, ref, tol) {
  const x0 = Math.max(0, Math.floor(rect.x) + 1);
  const y0 = Math.max(0, Math.floor(rect.y) + 1);
  const x1 = Math.min(img.w, Math.ceil(rect.x + rect.w) - 1);
  const y1 = Math.min(img.h, Math.ceil(rect.y + rect.h) - 1);
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * img.bpp;
      if (
        Math.abs(img.data[i] - ref[0]) < tol &&
        Math.abs(img.data[i + 1] - ref[1]) < tol &&
        Math.abs(img.data[i + 2] - ref[2]) < tol
      ) {
        n++;
      }
    }
  }
  return n;
}

/** rect {x,y,w,h} içinde pred(r,g,b) uyan piksel sayısı — esnek özel eşik
 *  (ADIM 11d: gloss parlaklık / glif yoklama küçük pencereleri için) */
function countIf(img, rect, pred) {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const x1 = Math.min(img.w, Math.round(rect.x + rect.w));
  const y1 = Math.min(img.h, Math.round(rect.y + rect.h));
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * img.bpp;
      if (pred(img.data[i], img.data[i + 1], img.data[i + 2])) n++;
    }
  }
  return n;
}

/** HSL → RGB (0-255) — yem hue'larını piksel referansına çevirmek için */
function hslToRgb(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** (cx,cy) merkezli halka (rIn..rOut) içinde AYNI hue ailesindeki piksel sayısı —
 *  yem STROKE kenarlığı doğrulaması: L penceresiyle gövde dolgusu hariç tutulur. */
function countHueRing(img, cx, cy, rIn, rOut, hue, hueTol, minS, minL, maxL) {
  let n = 0;
  const x0 = Math.max(0, Math.floor(cx - rOut));
  const y0 = Math.max(0, Math.floor(cy - rOut));
  const x1 = Math.min(img.w, Math.ceil(cx + rOut));
  const y1 = Math.min(img.h, Math.ceil(cy + rOut));
  const r2i = rIn * rIn;
  const r2o = rOut * rOut;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r2i || d2 > r2o) continue;
      const i = (y * img.w + x) * img.bpp;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const d = mx - mn;
      const L = (mx + mn) / 510;
      if (L < minL / 100 || L > maxL / 100 || d === 0) continue;
      const S = L <= 0.5 ? d / (mx + mn || 1) : d / (510 - mx - mn || 1);
      if (S * 100 < minS) continue;
      let hh;
      if (mx === r) hh = ((g - b) / d) % 6;
      else if (mx === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh *= 60; // standart HSL: hexagram adımı 60° (30 DEĞİL — hue hesabı kayıyordu)
      if (hh < 0) hh += 360;
      const diff = Math.abs(hh - hue);
      if (Math.min(diff, 360 - diff) > hueTol) continue;
      n++;
    }
  }
  return n;
}

/** rect içinde AYNI hue ailesinde, L∈[minL,maxL] piksel sayısı — glif
 *  doğrulaması: çekirdek (L78), yıldız (L78) ve %55-alfa halka (blend L~65)
 *  üçünü de tek pencereye sığdırır; gövde dolgusu (L50) minL ile elenir. */
function countHueRect(img, rect, hue, hueTol, minS, minL, maxL) {
  let n = 0;
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.w, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(img.h, Math.ceil(rect.y + rect.h));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.w + x) * img.bpp;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const mx = Math.max(r, g, b);
      const mn = Math.min(r, g, b);
      const d = mx - mn;
      const L = (mx + mn) / 510;
      if (L < minL / 100 || L > maxL / 100 || d === 0) continue;
      const S = L <= 0.5 ? d / (mx + mn || 1) : d / (510 - mx - mn || 1);
      if (S * 100 < minS) continue;
      let hh;
      if (mx === r) hh = ((g - b) / d) % 6;
      else if (mx === g) hh = (b - r) / d + 2;
      else hh = (r - g) / d + 4;
      hh *= 60;
      if (hh < 0) hh += 360;
      const diff = Math.abs(hh - hue);
      if (Math.min(diff, 360 - diff) > hueTol) continue;
      n++;
    }
  }
  return n;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') results.errors.push(`console.error: ${msg.text()}`);
});
page.on('pageerror', (err) => results.errors.push(`pageerror: ${err.message}`));

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(
    () => typeof window.render_game_to_text === 'function' && typeof window.advanceTime === 'function',
    { timeout: 15000 },
  );
  check('hooklar yüklü (render_game_to_text + advanceTime)', true);

  // Hücre-yutma (combat) testleri DIŞINDA kapalı tut → mevcut testler öngörülebilir kalır
  // (8d bölümü kendi pencerelerinde açar/kapatır)
  await page.evaluate(() => window.test_set_combat(false));

  // Market bakiyesi: galaxy750 KİLİTLİ kart — seçime (satın alma → setSkin →
  // menünün kapanması) giden akış için yeterli coin gerekiyor; buyItem tıklama
  // anında localStorage'dan taze okur (kilit kartta seçim uygulanmıyor).
  await page.evaluate(() => localStorage.setItem('neon-arena.coins', '5000'));

  // --- 0) İSIM EKRANI: ad + PLAY — oyunun giriş kapısı (karar 4) ---
  {
    const startVisible = await page.locator('[data-start="screen"]').isVisible();
    check('isim ekranı: sayfa açılışta görünür (ad input + PLAY)', startVisible);
    const playBox = await page.locator('[data-start="play"]').boundingBox();
    check(
      'isim ekranı: PLAY dokunmatik hedef ≥44px',
      !!playBox && playBox.width >= 44 && playBox.height >= 44,
      playBox ? `${playBox.width.toFixed(0)}x${playBox.height.toFixed(0)}px` : 'yok',
    );
    const preS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'isim ekranı: PLAY basılmadan dünya DONUK (step işlenmiyor)',
      preS.started === false,
      `started=${preS.started}`,
    );

    // r = √mass × 10 → spawn r=100: merkezde ~1-2 TEMAS yemi olabilir (mass'i
    // 100'den şaşırmasın) → donuk sahnede uzaklaştır + adedi uzak yemlerle koru
    const sanitize = async () => {
      const n = await page.evaluate(() => window.test_clear_near_player(150));
      for (let i = 0; i < n; i++) {
        await page.evaluate(
          (i) => window.test_spawn_food(300 + (i % 12) * 60, 300 + Math.floor(i / 12) * 60),
          i,
        );
      }
      return n;
    };
    await sanitize();

    await page.fill('[data-start="name"]', 'TESTER');
    await page.click('[data-start="play"]');
    await page.waitForSelector('[data-start="screen"]', { state: 'detached', timeout: 3000 });
    // startGame YENİ state üretir (createGameState → combatEnabled: true) →
    // yukarıdaki 243. satır PLAY'den ÖNCE yapıldığı için etkisiz kalıyordu;
    // botlar oyuncuyu yutup (score +4900, mass +900) sonraki tüm sahneleri
    // (av/kaçma/DPR/menü) bozuyordu. Kapıdan sonra kapat.
    await page.evaluate(() => window.test_set_combat(false));
    const startedS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      "isim ekranı: PLAY ile oyun başladı + isim payload/leaderboard'a geçti",
      startedS.started === true &&
        startedS.player.name === 'TESTER' &&
        startedS.standings.some((e) => e.isYou && e.name === 'TESTER'),
      `started=${startedS.started} name=${startedS.player.name}`,
    );
    const storedName = await page.evaluate(() => localStorage.getItem('neon-arena.name'));
    check('isim persist: localStorage yazıldı', storedName === 'TESTER', `stored=${storedName}`);

    // Piksel: isim hücrenin İÇİNDE ortada beyaz — imleç merkeze + kamera oturur
    await page.mouse.move(640, 360);
    await page.evaluate(() => window.advanceTime(800));
    await sanitize(); // bu adımda nadir respawn teması mass'i şaşırmasın
    // Hücre merkezi PAYLOAD'dan: kamera lag'i + hücre hâlâ kameraya koşuyor →
    // hücre ekranda ±18-30px kayabiliyordu (merkeze sabitlenmiş bölge 0px
    // verebiliyordu). Bölge, hücreye GÖRE ortalanır (isim = hücre ortası).
    const sName = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.screenshot({ path: join(SHOT_DIR, '00-name-on-cell.png') });
    const pngName = decodePNG(readFileSync(join(SHOT_DIR, '00-name-on-cell.png')));
    const ncx = Math.round((sName.player.x - sName.camera.x) * sName.camera.zoom + sName.viewportW / 2);
    const ncy = Math.round((sName.player.y - sName.camera.y) * sName.camera.zoom + sName.viewportH / 2);
    const whiteN = countPixels(pngName, { x: ncx - 60, y: ncy - 30, w: 120, h: 60 }, [255, 255, 255], 12);
    check(
      'isim piksel: beyaz isim hücrenin ortasında (piksel)',
      whiteN >= 60,
      `${whiteN} px (limit 60, hücre ekran (${ncx}, ${ncy}) r=${sName.player.r} zoom=${sName.camera.zoom})`,
    );
  }

  // --- 1) Başlangıç durumu ---
  const state0 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: join(SHOT_DIR, '01-baseline.png') });
  check('başlangıç: saha dolu (foodCount = foodTarget)', state0.foodCount === state0.foodTarget, `foodCount=${state0.foodCount} target=${state0.foodTarget}`);
  // §0'da kamera otururken yem yenmiş olabilir (nadir) → mutlak 100 yerine
  // oyun DEFTERİ tutarlılığı: mass = taban + yenen yem × kazanç (aynı kaynak:
  // set_mass ile mass'i zorlamak foodEaten'le mass'i ayırıp §5'i bozuyordu)
  // ve targetR = √mass × 10 (radius formülü birebir).
  {
    const s0p = state0.player;
    const expMass0 = state0.growth.baseMass + s0p.foodEaten * state0.growth.massGain;
    check(
      'başlangıç: mass=100 → r=100 (r = √mass × 10 birebir)',
      Math.abs(s0p.targetR - Math.sqrt(s0p.mass / 100) * 100) <= 0.01 &&
        Math.abs(s0p.mass - expMass0) <= 1,
      `mass=${s0p.mass} (beklenen ${expMass0} = ${state0.growth.baseMass} + ${s0p.foodEaten}×${state0.growth.massGain}) targetR=${s0p.targetR}`,
    );
  }

  // --- 1b) AGAR.IO YEM SAHASI: uniform + hue çeşitliliği + JEL GLOW (ADIM 11d):
  // jel gövde + koyu rim + sol-üst gloss + glif YOK (glif yoklama sağ-alt bölge) ---
  // zoom≈1 iken yap (yemler ekranda tam boyut); imleç merkeze: oyuncu dursun
  await page.mouse.move(640, 360);
  await page.evaluate(() => window.advanceTime(300));

  // Deterministik prob yemleri (ADIM 11d): oyuncunun SAĞ/ SOL / sağ-alt
  // çevresine 3 aday yem konur → komşu yem (π40²×yoğunluk ≈%5/aday) şansı
  // üçlemekte %0.01'e iner. Ekran ≈(860,360)/(420,360)/(860,420) — tümü
  // region [400,880]×[200,640] içinde, aura (1.55r=155) dışında.
  // Kontrol sonunda ÜÇÜ de kaldırılır → foodCount birebir nötr (clear yok:
  // clear kalıcı sayı açığı yaratır — saha üstlenimi yok, yem = yem yenince +1).
  const probeFoodIds = [...(await page.evaluate(() => {
    const s = JSON.parse(window.render_game_to_text());
    const p = s.player;
    const dxR = p.x + 220 <= s.world.w - 60 ? 220 : -220; // dünya içinde yer
    const dxL = dxR === 220 ? -220 : 220;
    const tx = (dx) => Math.min(Math.max(p.x + dx, 60), s.world.w - 60);
    const ty = (dy) => Math.min(Math.max(p.y + dy, 60), s.world.h - 60);
    return [
      window.test_spawn_food(tx(dxR), p.y),
      window.test_spawn_food(tx(dxL), p.y),
      window.test_spawn_food(tx(dxR), ty(60)),
    ];
  }))];

  const base = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

  // uniform disposition (clone foodUniformDisposition): 4 çeyrek dengeli dolu
  {
    const half = base.world.w / 2;
    const q = [0, 0, 0, 0];
    for (const f of base.foods) q[(f.x >= half ? 1 : 0) + (f.y >= half ? 2 : 0)]++;
    const minQ = Math.min(...q);
    check(
      'yem: uniform dağılım (4 çeyreğin her biri ≥ %12)',
      minQ >= base.foodTarget * 0.12,
      `çeyrekler=${JSON.stringify(q)}`,
    );
  }

  // hue çeşitliliği: agar.io gibi her yem rastgele renkli (payload köprüsü)
  {
    const hues = new Set(base.foods.slice(0, 200).map((f) => f.hue));
    check(
      'yem: renk çeşitliliği (seed hue — agar.io çok renkli saha)',
      hues.size >= 90,
      `${hues.size} farklı hue / 200 yem`,
    );
  }

  // Piksel: ekranda UYGUN tek prob yem — HUD köşelerinden, hücrelerden (ekran
  // yarıçapı + pay) ve komşu yemlerden uzak seçilir (0px flake yok)
  {
    // DAYANIKLI ARAMA: ilk deneme eski davranisin aynisi. Bulunamazsa
    // oyuncudan farkli acilarda yeni prob yemler dogurulur (en fazla 4 deneme).
    // Dogan yemler sonda silinir → foodCount notur.
    let probe = null;
    let png = null;
    // `camB` dongu disinda da okunuyor (piksel penceresi olcegi) → disariarda tut
    let camB = null;
    for (let attempt = 0; attempt < 4 && !probe; attempt++) {
      if (attempt > 0) {
        probeFoodIds.push(
          ...(await page.evaluate((a) => {
            const st = JSON.parse(window.render_game_to_text());
            const p = st.player;
            return [0, 1, 2].map((k) => {
              const ang = ((a * 3 + k) * Math.PI * 2) / 9 + 0.4;
              const r = 250 + ((a * 37 + k * 53) % 5) * 30;
              const x = Math.min(Math.max(p.x + Math.cos(ang) * r, 60), st.world.w - 60);
              const y = Math.min(Math.max(p.y + Math.sin(ang) * r, 60), st.world.h - 60);
              return window.test_spawn_food(x, y);
            });
          }, attempt)),
        );
        await page.evaluate(() => window.advanceTime(80));
      }
      const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      camB = st.camera;
      const toS = (wx, wy) => ({
        x: (wx - camB.x) * camB.zoom + st.viewportW / 2,
        y: (wy - camB.y) * camB.zoom + st.viewportH / 2,
      });
      const cellS = [
        ...st.bots.map((b) => ({ s: toS(b.x, b.y), r: b.r * camB.zoom })),
        { s: toS(st.player.x, st.player.y), r: st.player.r * camB.zoom },
      ];
      for (const f of st.foods) {
        const s = toS(f.x, f.y);
        if (s.x < 400 || s.x > 880 || s.y < 200 || s.y > 640) continue; // HUD köşeleri hariç
        if (cellS.some((c) => Math.hypot(c.s.x - s.x, c.s.y - s.y) < c.r + 50)) continue;
        if (st.foods.some((o) => o !== f && Math.hypot(o.x - f.x, o.y - f.y) < 70)) continue;
        probe = { f, s };
        break;
      }
      if (!probe) continue;
      await page.screenshot({ path: join(SHOT_DIR, '08-food-field.png') });
      png = decodePNG(readFileSync(join(SHOT_DIR, '08-food-field.png')));
    }
    if (!probe) {
      check('yem: düz gövde ekranda (piksel)', false, 'uygun prob yem yok');
      check('yem: kontur/rim YOK (piksel)', false, 'uygun prob yem yok');
      check('yem: glif YOK — sağ-alt saf dolgu (piksel)', false, 'uygun prob yem yok');
    } else {
      const { f, s } = probe;
      const rr = f.r * camB.zoom;
      const fillRgb = hslToRgb(f.hue, 100, 50);
      const distFill = (r, g, b) =>
        Math.hypot(r - fillRgb[0], g - fillRgb[1], b - fillRgb[2]);

      // DÜZ GÖVDE (referans drawFood birebir): hsl(hue,100%,50%) dolu daire.
      // r=24 → alan ~1800px; pencere rr+6 (blob payı ±%10 + drift %4 içinde).
      const bodyN = countPixels(
        png,
        { x: s.x - (rr + 6), y: s.y - (rr + 6), w: 2 * (rr + 6), h: 2 * (rr + 6) },
        fillRgb,
        30,
      );
      check('yem: düz gövde ekranda (piksel)', bodyN >= 200, `${bodyN} px (limit 200, hue=${f.hue})`);

      // KONTUR YOK: koyu halka bandında (rr±1.5) L40-48/S≥85 piksel ~sıfır olmalı
      // (düz dolguda kenar AA'si beyaza açılır → pencereye girmez).
      const rimN = countHueRing(png, s.x, s.y, rr - 1.5, rr + 1.5, f.hue, 15, 85, 40, 48);
      check('yem: kontur/rim YOK (piksel)', rimN <= 12, `${rimN} px (limit ≤12)`);

      // Glif YOK: SAĞ-ALT bölge saf dolgu — blob merkez bölgesi her fazda
      // dolgu içinde (kenar en fazla ±%10 oynar) → dolgu dışı ≥15 dist ≤3.
      const glyphN = countIf(
        png,
        { x: s.x + rr * 0.05, y: s.y + rr * 0.05, w: rr * 0.45, h: rr * 0.45 },
        (r, g, b) => distFill(r, g, b) >= 15,
      );
      check('yem: glif YOK — sağ-alt saf dolgu (piksel)', glyphN <= 3, `${glyphN} px (limit ≤3)`);
    }
    // Aday prob yemlerinin ÜÇÜ de kaldır → foodCount birebir eski haline döner
    await page.evaluate((ids) => ids.forEach((id) => window.test_remove_food(id)), probeFoodIds);
  }

  // --- 1c) JEL MEMBRAN (ADIM 11d): hücre kenarı 32 ışıncıkla taranır —
  // sinus dalga → kenar yarıçapı AÇIYA GÖRE oynamalı (düz dairede ~sabit).
  // Işınlar ismin DIŞINDAN (0.85rr) başlar: fill → kontur geçişini yakalar. ---
  {
    await page.mouse.move(640, 360);
    await page.evaluate(() => window.test_clear_near_player(170));
    await page.evaluate(() => window.advanceTime(1400)); // kamera tam oturur + duruş
    const sw = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.screenshot({ path: join(SHOT_DIR, '01b-cell-wobble.png') });
    const wimg = decodePNG(readFileSync(join(SHOT_DIR, '01b-cell-wobble.png')));
    const cxW = (sw.player.x - sw.camera.x) * sw.camera.zoom + sw.viewportW / 2;
    const cyW = (sw.player.y - sw.camera.y) * sw.camera.zoom + sw.viewportH / 2;
    const rrW = sw.player.r * sw.camera.zoom;
    const fillRef = [34, 211, 238]; // theme color.playerFill #22d3ee (tek kaynak köprüsü)
    const isFill = (i) =>
      Math.abs(wimg.data[i] - fillRef[0]) <= 30 &&
      Math.abs(wimg.data[i + 1] - fillRef[1]) <= 30 &&
      Math.abs(wimg.data[i + 2] - fillRef[2]) <= 30;
    const edges = [];
    const RAYS = 32;
    const rStart = Math.max(rrW * 0.85, 50); // isim ("TESTER", yarı genişlik ~63px) hariç
    for (let k = 0; k < RAYS; k++) {
      const a = (k / RAYS) * Math.PI * 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      let seen = false;
      let last = 0;
      for (let rI = rStart; rI < rrW + 15; rI++) {
        const px = Math.round(cxW + dx * rI);
        const py = Math.round(cyW + dy * rI);
        if (px < 0 || py < 0 || px >= wimg.w || py >= wimg.h) break;
        const i = (py * wimg.w + px) * wimg.bpp;
        if (isFill(i)) {
          seen = true;
          last = rI;
        } else if (seen) break; // fill → kontur geçişi = görünür membran kenarı
      }
      if (seen && last > 0) edges.push(last);
    }
    // Band dışı ölçümler (komşu hücre/parçacık/AA) ayıklanır
    const inBand = edges.filter((e) => e >= rrW * 0.7 && e <= rrW * 1.3).sort((a, b) => a - b);
    if (inBand.length >= 26) {
      const range = inBand[inBand.length - 1] - inBand[0];
      const mid = inBand[Math.floor(inBand.length / 2)];
      check(
        'hücre: jelly membran dalgası (piksel — ışıncık aralığı)',
        range >= 4 && range <= 40,
        `aralık=${range}px (limit 4..40, ${inBand.length}/${RAYS} ışın, amp≈${(rrW * 0.05).toFixed(1)}px)`,
      );
      check(
        'hücre: membran bütünlüğü (medyan yarıçap yerinde)',
        mid >= rrW * 0.7 && mid <= rrW * 1.3,
        `medyan=${mid}px (beklenen ~${(rrW - 5).toFixed(0)} = r − kontur/2, limit ±%30)`,
      );
    } else {
      check('hücre: jelly membran dalgası (piksel — ışıncık aralığı)', false, `yeterli temiz ışın yok: ${inBand.length}/${RAYS}`);
      check('hücre: membran bütünlüğü (medyan yarıçap yerinde)', false, `yeterli temiz ışın yok: ${inBand.length}/${RAYS}`);
    }
  }

  // --- 2) Sağ-ukareket ---
  const before = state0.player;
  await page.mouse.move(1100, 200);
  await page.evaluate(() => window.advanceTime(1000));
  const state1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: join(SHOT_DIR, '02-moved-right.png') });
  const movedDx = state1.player.x - before.x;
  const movedDy = state1.player.y - before.y;
  check('hareket: sağ-üste doğru ilerledi', movedDx > 50 && movedDy < -50, `dx=${movedDx.toFixed(0)} dy=${movedDy.toFixed(0)}`);
  const camGap = Math.hypot(state1.camera.x - state1.player.x, state1.camera.y - state1.player.y);
  check('kamera oyuncuyu takip ediyor (yakın)', camGap < 150, `gap=${camGap.toFixed(0)}px (smoothing nedeniyle hareket sırasında hafif geride kalır)`);

  // --- 3) Sol-aşağı hareket ---
  await page.mouse.move(200, 650);
  await page.evaluate(() => window.advanceTime(1000));
  const state2 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  await page.screenshot({ path: join(SHOT_DIR, '03-moved-left.png') });
  check('hareket: yön değişti (ters)', state2.player.x < state1.player.x, `dx=${(state2.player.x - state1.player.x).toFixed(0)}`);

  // --- 4) Toplama: en yakın yeme doğru sür (aşamalı, tekrarlı) ---
  // Saha referansı: §1b prob fazında (3 geçici yem sahadayken) yem yenirse
  // respawn target üstünde baskılanıp 1'lik kalıcı ev-bakiyesi açığı kalır
  // (6000→5999) → kontrol bu pencere ÖNCESİ sayıyı referans alır (±1 pay).
  const foodPre = JSON.parse(await page.evaluate(() => window.render_game_to_text())).foodCount;
  let eatenBefore = state2.player.foodEaten;
  for (let attempt = 0; attempt < 8 && eatenBefore === 0; attempt++) {
    const s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const p = s.player;
    let nearest = null;
    let best = Infinity;
    for (const f of s.foods) {
      const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
      if (d < best) {
        best = d;
        nearest = f;
      }
    }
    if (!nearest) break;
    // dünya → ekran — HÜCRE merkezli girdi (referans): hedef = hücre + offset
    const sx = (nearest.x - s.player.x) * s.camera.zoom + s.viewportW / 2;
    const sy = (nearest.y - s.player.y) * s.camera.zoom + s.viewportH / 2;
    await page.mouse.move(
      Math.max(10, Math.min(1270, sx)),
      Math.max(10, Math.min(710, sy)),
    );
    await page.evaluate(() => window.advanceTime(1000));
    const s2 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    eatenBefore = s2.player.foodEaten;
  }
  const stateAfter = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  // Toplama anını her koşuda güvenilir şekilde yakala (döngü dışına alındı)
  await page.screenshot({ path: join(SHOT_DIR, '04-collected.png') });
  check('toplama: en az 1 yem yenildi', stateAfter.player.foodEaten > 0, `foodEaten=${stateAfter.player.foodEaten}`);
  // agar.io ekonomisi: skor = yem sayısı (scorePerFood 1 — client'tan asla kabul edilmez)
  check(
    'toplama: skor arttı (score = foodEaten)',
    stateAfter.player.score === stateAfter.player.foodEaten && stateAfter.player.score > 0,
    `score=${stateAfter.player.score} foodEaten=${stateAfter.player.foodEaten}`,
  );
  // Yenilen yem bir kare sonra doğar + oyuncu hâlâ yeme doğru sürükleniyorsa
  // sayaç anlık eksik görünebilir → kısaca bekle, sonra bu pencere ÖNCESİ
  // sayıyla ±1 ev-payı ile doğrula: §4'te yenen N yem sahaya geri dönmüş
  // olmalı (bozuk respawn olsaydı açık N olurdu → hâlâ FAIL ederdi).
  let foodNow = stateAfter.foodCount;
  for (let i = 0; i < 10 && foodNow < foodPre - 1; i++) {
    await page.evaluate(() => window.advanceTime(150));
    foodNow = JSON.parse(await page.evaluate(() => window.render_game_to_text())).foodCount;
  }
  check(
    'toplama: saha yeniden doldu (spawn)',
    foodNow >= foodPre - 1,
    `foodCount=${foodNow} (§4 öncesi ${foodPre})`,
  );

  // --- 5) Büyüme formülü: mass LINEER → radius = baseR × √(mass/baseMass) ---
  {
    const g = stateAfter.growth;
    const mass = stateAfter.player.mass;
    const expectedR = Math.min(g.baseRadius * Math.sqrt(mass / g.baseMass), 400);
    check(
      'büyüme: radius = baseR × √(mass/baseMass) (tavan 400)',
      Math.abs(stateAfter.player.targetR - expectedR) < 0.5,
      `mass=${mass} expected=${expectedR.toFixed(2)} got=${stateAfter.player.targetR}`,
    );
    check(
      'büyüme: mass lineer arttı (base100 + yem kazanımı)',
      mass > g.baseMass && Number.isFinite(mass),
      `mass=${mass} foodEaten=${stateAfter.player.foodEaten}`,
    );
  }

  // --- 6) BÜYÜME STRESİ: 40-50 yem topla, ekran KAPANMAMALI ---
  {
    let s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const targetFood = 50;
    let iterations = 0;
    // Bütçe cömert: botların hedef yemi çalması (boş iterasyon) ya da nadir
    // ölüm-restart (foodEaten sıfırlanır) bütçeyi şişirebilir → 120 yetersizdi.
    while (s.player.foodEaten < targetFood && iterations < 240) {
      iterations++;
      const p = s.player;
      let nearest = null;
      let best = Infinity;
      for (const f of s.foods) {
        const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
        if (d < best) {
          best = d;
          nearest = f;
        }
      }
      if (!nearest) break;
      // dünya → ekran — HÜCRE merkezli girdi (hedef = hücre + offset/zoom)
      const sx = (nearest.x - s.player.x) * s.camera.zoom + s.viewportW / 2;
      const sy = (nearest.y - s.player.y) * s.camera.zoom + s.viewportH / 2;
      await page.mouse.move(
        Math.max(10, Math.min(1270, sx)),
        Math.max(10, Math.min(710, sy)),
      );
      // Yakınlaştıkça daha küçük adım (overshoot yok)
      const burst = s.player.foodEaten >= targetFood - 3 ? 300 : 900;
      await page.evaluate((ms) => window.advanceTime(ms), burst);
      s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    }

    await page.screenshot({ path: join(SHOT_DIR, '06-stress-50food.png') });

    const eaten = s.player.foodEaten;
    // son burst'ta yığılma/parazit payı → üst sınır 65 (saha yoğun kaldı)
    check('stres: 50+ yem toplandı', eaten >= 50 && eaten <= 65, `foodEaten=${eaten}`);

    // KRİTİK: ekran yarıçapı asla viewport'un makul kısmını aşmamalı
    // (zoomDamping 0.75 yumuşatıldı → hücre biraz daha büyük görünür;
    //  üst sınır %16 → %20: r=274'te ~129px < 144px limiti korur)
    const maxScreenR = Math.min(s.viewportW, s.viewportH) * 0.20; // stroke payı dahil tolerans
    check(
      'stres: OYUNCU EKRANI KAPLAMIYOR',
      s.screenRadius < maxScreenR,
      `screenRadius=${s.screenRadius}px (limit=${maxScreenR.toFixed(0)}px) zoom=${s.camera.zoom}`,
    );

    // Radius TAVANSIZ büyür (maxPlayerRadius kaldırıldı): 65 yemde mass ~750
    // → r = 100√7.5 ≈ 274 beklenir; ease payıyla üst sınır 300.
    check(
      'stres: radius tavansız formülde (100√(mass/100))',
      s.player.r <= 300,
      `r=${s.player.r}`,
    );

    // Zoom makul aralıkta + sönümlü eğri formülü birebir
    check(
      'stres: zoom min/max arasında',
      s.camera.zoom >= 0.14 && s.camera.zoom <= 1.001,
      `zoom=${s.camera.zoom}`,
    );
    const expZoom = Math.min(
      1,
      Math.max(0.15, Math.pow(s.growth.baseRadius / s.player.r, s.growth.zoomDamping)),
    );
    check(
      'stres: zoom = (baseR/r)^zoomDamping — ekran yarıçapı sabit bantta (damped)',
      Math.abs(s.camera.zoom - expZoom) < 0.01,
      `zoom=${s.camera.zoom.toFixed(3)} expected=${expZoom.toFixed(3)}`,
    );

    // Ekran hala boşluk gösteriyor mu? (tam kaplama değil, çevresinde harita görünür)
    check('stres: zaman ilerledi (oyun canlı)', s.timeSec > 1, `timeSec=${s.timeSec}`);
    globalThis.__stressState = s;
  }

  // --- 7) HUD: skor senkron + leaderboard + köşe yerleşimi (ORTA AÇIK) ---
  const hud = await page.evaluate(() => {
    // oyun state'i virtual modda donuk → HUD ile atomik okuma güvenli
    const state = JSON.parse(window.render_game_to_text());
    const q = (sel) => document.querySelector(sel);
    const rect = (sel) => {
      const el = q(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const rows = [...document.querySelectorAll('[data-hud="lb-row"]')].map((li) => li.textContent);
    const scoreEl = q('[data-hud="score"]');
    let bumpKeyframe = false;
    try {
      for (const sheet of document.styleSheets) {
        for (const rule of sheet.cssRules) {
          if (rule.name === 'hud-bump') bumpKeyframe = true;
        }
      }
    } catch {}
    return {
      state,
      score: scoreEl ? scoreEl.textContent : null,
      sizeText: q('[data-hud="size"]') ? q('[data-hud="size"]').textContent : null,
      scoreColor: scoreEl ? getComputedStyle(scoreEl).color : null,
      rows,
      left: rect('[data-hud="score-panel"]'),
      right: rect('[data-hud="leaderboard"]'),
      bumpKeyframe,
      vw: innerWidth,
      vh: innerHeight,
    };
  });

  check(
    "HUD: skor oyun state'iyle senkron",
    hud.score === hud.state.player.score.toLocaleString('en-US'),
    `hud=${hud.score} state=${hud.state.player.score}`,
  );
  check('HUD: size değeri formatlı', (hud.sizeText || '').startsWith('×'), `size=${hud.sizeText}`);
  check('HUD: neon cyan renk uygulanmış', hud.scoreColor === 'rgb(34, 211, 238)', `color=${hud.scoreColor}`);
  check('HUD: bump animasyonu tanımlı', hud.bumpKeyframe === true);
  // Leaderboard artık GERÇEK veri + MASS sıralı: DOM satırları, payload
  // standings'in ilk 5'iyle birebir (değer formatı HUD formatSize ile aynı)
  {
    const fmtMass = (mass) => {
      const mul = mass / 100;
      return mul >= 100 ? `×${Math.round(mul).toLocaleString('en-US')}` : `×${mul.toFixed(1)}`;
    };
    const real = [...hud.state.standings]
      .sort((a, b) => b.mass - a.mass)
      .slice(0, 5)
      .map((r, i) => `${i + 1}${r.name}${fmtMass(r.mass)}`);
    // giriş azsa kalan satırlar boş yuvadır (yalnızca sıra numarası görünür)
    const expectedRows = real.concat(
      Array.from({ length: 5 - real.length }, (_, k) => String(real.length + k + 1)),
    );
    check(
      'HUD: leaderboard gerçek masslerle sıralı (birebir eşleşme)',
      hud.rows.length === 5 && JSON.stringify(hud.rows) === JSON.stringify(expectedRows),
      JSON.stringify(hud.rows),
    );
  }
  check(
    'HUD: sol panel sol üst köşede',
    !!hud.left && hud.left.x < 60 && hud.left.y < 60,
    hud.left && `x=${hud.left.x.toFixed(0)} y=${hud.left.y.toFixed(0)}`,
  );
  check(
    'HUD: sağ panel sağ üst köşede',
    !!hud.right && hud.right.x + hud.right.w > hud.vw - 60 && hud.right.y < 60,
    hud.right && `right=${(hud.right.x + hud.right.w).toFixed(0)} (vw=${hud.vw})`,
  );
  check(
    'HUD: paneller birbirini örtmüyor',
    !!hud.left && !!hud.right && hud.left.x + hud.left.w < hud.right.x,
    hud.left && hud.right && `left ends ${(hud.left.x + hud.left.w).toFixed(0)} < right starts ${hud.right.x.toFixed(0)}`,
  );
  {
    // Merkez bölge (%30-70 kare) panellerle kesişmemeli
    const cx0 = hud.vw * 0.3;
    const cx1 = hud.vw * 0.7;
    const cy0 = hud.vh * 0.3;
    const cy1 = hud.vh * 0.7;
    const hits = (r) => !!r && r.x < cx1 && r.x + r.w > cx0 && r.y < cy1 && r.y + r.h > cy0;
    check('HUD: ekranın ortası AÇIK', !hits(hud.left) && !hits(hud.right));
  }
  await page.screenshot({ path: join(SHOT_DIR, '07-hud.png') });

  // Piksel doğrulama: HUD screenshot'a gerçekten BOYANMIŞ mı? ( köşe bölgelerinde
  // cyan'a özgü pikseller — yemler yeşil, oyuncu kamerada merkezde olduğu için
  // köşelere asla giremez → cyan = HUD ) Bu, ekran görüntüsü kanalına köprü kurmadan
  // dosya üzerinden yapılan güvenilir doğrulamadır.
  {
    const png = decodePNG(readFileSync(join(SHOT_DIR, '07-hud.png')));
    const leftCyan = countPixels(png, hud.left, CYAN, 70);
    const rightCyan = countPixels(png, hud.right, CYAN, 70);
    check('HUD piksel: sol panel screenshot\'ta görünüyor', leftCyan >= 50, `${leftCyan} cyan px (limit 50)`);
    check('HUD piksel: leaderboard screenshot\'ta görünüyor', rightCyan >= 100, `${rightCyan} cyan px (limit 100)`);
  }

  // --- 8) Durma: imleç merkeze → oyuncu durur ---
  await page.mouse.move(640, 360);
  await page.evaluate(() => window.advanceTime(1500));
  const state3 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const camDist = Math.hypot(state3.player.x - state3.camera.x, state3.player.y - state3.camera.y);
  check('durma: imleç merkezdeyken oyuncu kamera merkezinde', camDist < 5, `dist=${camDist.toFixed(1)}`);
  await page.screenshot({ path: join(SHOT_DIR, '05-idle-center.png') });

  // --- 8b) TOPLAMA ZİNCİRİ + EFEKTLER (pull → POOF → büyüme) ---
  {
    // Parazitlenme temizliği: merkez bölgesi boş → delta'lar deterministik
    await page.evaluate(() => window.test_clear_near_player(700));

    // a) Çekiliş: temas anında yem yutulmaz, 150ms çekilir
    const feA = JSON.parse(await page.evaluate(() => window.render_game_to_text())).player;
    const pullId = await page.evaluate(() => {
      const s = JSON.parse(window.render_game_to_text());
      return window.test_spawn_food(s.player.x, s.player.y);
    });
    await page.evaluate(() => window.advanceTime(60));
    const sPull = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const pullFood = sPull.foods.find((f) => f.id === pullId);
    check(
      'çekiliş: temasta hemen yutulmaz — pull animasyonu ortada (0<pull<1)',
      !!pullFood && pullFood.pull > 0 && pullFood.pull < 1 && sPull.player.foodEaten === feA.foodEaten,
      pullFood ? `pull=${pullFood.pull} foodEaten=${sPull.player.foodEaten} (önce ${feA.foodEaten})` : 'yem yok',
    );

    await page.evaluate(() => window.advanceTime(250));
    const sDone = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const cap0 = sDone.particles.cap;
    const dDone = sDone.player.foodEaten - feA.foodEaten;
    const mDone = +(sDone.player.mass - feA.mass).toFixed(2);
    const expGain = dDone * sDone.growth.massGain;
    // Bu pencerede mass DECAY de çalışır (theme.game.decay: mass×0.004×dt,
    // minMass üstü) → mutlak eşitlik yerine decay payına izin verilir.
    // pay ≈ mass × 0.004 × 0.5sn (zaman payı için ~2× güvenlik); lineerlik
    // ihlali (ör. massGain ikiye katlansa) bu payı katlarca aşar.
    const decayTol = sDone.player.mass * 0.004 * 0.5;
    check(
      'çözülme: pull bitti — mass +growth (lineer, tek tip yem)',
      !sDone.foods.some((f) => f.id === pullId) &&
        dDone >= 1 &&
        dDone <= 4 &&
        Math.abs(mDone - expGain) <= decayTol,
      `yemΔ=${dDone} massΔ=${mDone} (beklenen ${expGain} = Δ×${sDone.growth.massGain}, decay payı ±${decayTol.toFixed(2)})`,
    );
    check('POOF: çözülme anında havuzda aktif parça', sDone.particles.alive > 0, `alive=${sDone.particles.alive}`);
    check('havuz: kapasite sabit (nesne üretilmedi)', cap0 >= 100 && cap0 === sDone.particles.cap, `cap=${cap0}`);

    // doğurganlık zinciri kırılsın: doğan rastgele yem merkezden temizlenir
    await page.evaluate(() => window.test_clear_near_player(700));
    await page.evaluate(() => window.advanceTime(900));
    const sGone = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    // Botlar bu aralıkta yem yemiş olabilir → yeni POOF'lar yaşayabilir.
    // Eski parçacıklar sönmüş olmalı: alive yalnızca bot/oyuncu yemeleriyle
    // açıklanabilmeli (oyuncu da stray yem yakalayabilir → playerΔ dahil).
    const botEatenΔ = sGone.bots.reduce(
      (n, b, i) => n + (b.foodEaten - sDone.bots[i].foodEaten),
      0,
    );
    const playerΔ = sGone.player.foodEaten - sDone.player.foodEaten;
    const eatΔ = botEatenΔ + playerΔ;
    const aliveLimit = eatΔ * 20; // yem başına en fazla ~14 parça (12 poof + ring)
    check(
      'POOF: parçacıklar söndü, havuz geri alındı',
      sGone.particles.cap === cap0 &&
        (eatΔ === 0
          ? sGone.particles.alive === 0
          : sGone.particles.alive <= aliveLimit),
      `alive=${sGone.particles.alive} botΔ=${botEatenΔ} playerΔ=${playerΔ} cap=${sGone.particles.cap}`,
    );
  }

  // --- 8c) BOTLAR: spawn, hareket, yem, KAÇ/SALDIRI davranışı, ekran çizimi ---
  {
    const s0 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'bot: payload botCount kadar bot var (6-64)',
      s0.bots.length === s0.botCount && s0.botCount >= 6 && s0.botCount <= 64,
      `botCount=${s0.botCount}`,
    );
    check(
      'bot: isimler benzersiz + isim havuzundan',
      new Set(s0.bots.map((b) => b.name)).size === s0.bots.length &&
        s0.bots.every((b) => b.name.length >= 3),
      JSON.stringify(s0.bots.map((b) => b.name)),
    );
    check(
      'bot: standings = OYUNCU (isim) + botlar (leaderboard gerçek kaynağı)',
      s0.standings.length === s0.botCount + 1 &&
        s0.standings.some((e) => e.isYou && e.name === 'TESTER'),
      `standings=${s0.standings.length}`,
    );
    {
      const skins = s0.bots.map((b) => b.skin);
      check(
        'bot: TÜM botlar CLASSIC (tema skinDefault köprüsü, agar.io tarzı)',
        skins.length > 0 && skins.every((sid) => sid === s0.skinDefault),
        `skinDefault=${s0.skinDefault} ${JSON.stringify(skins)}`,
      );
    }

    // (a) HAREKET: botları harita ortasındaki AÇIK ızgaraya sahnele — duvar-deadlock
    // ve üst üste yığılma (botların tamamını dondurabilen nadir durum) elensin;
    // her bot serbestçe yem/gez hedefine yönelir. pickFarCorner (b)'de kullanılır.
    const pickFarCorner = (x, y) => {
      const corners = [
        [200, 200],
        [3800, 200],
        [200, 3800],
        [3800, 3800],
      ];
      let best = corners[0];
      let bestD = -1;
      for (const c of corners) {
        const d = Math.hypot(c[0] - x, c[1] - y);
        if (d > bestD) {
          bestD = d;
          best = c;
        }
      }
      return best;
    };
    await page.mouse.move(640, 360);
    // Izgara: bot SAYISINDAN üretilir (6..64 bot — sabit 8 nokta 60 botta
    // `GRID[i]` undefined → suite çöküyordu). Botlar arası ≥1000px (chase/flee
    // yarıçapı 300 → birbirine karışmaz). Bölge (6500..13500)²: (a)'daki oyuncu
    // parkı (3500,3500), (b)'deki uzak-köşe parkı (≤3800) ve 8d sahnesi
    // (2000,2000) hep ≥3800px uzakta → oyuncu ile bot asla temas menzilinde değil.
    const GRID = Array.from({ length: s0.bots.length }, (_, i) => [
      6500 + (i % 8) * 1000,
      6500 + Math.floor(i / 8) * 1000,
    ]);
    for (let i = 0; i < s0.bots.length; i++) {
      await page.evaluate(
        ([idx, x, y]) => window.test_set_bot_pos(idx, x, y),
        [i, GRID[i][0], GRID[i][1]],
      );
    }
    // oyuncu ızgaradan uzak köşede dursun (bot yarıçaplarına girmesin)
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [3500, 3500]);
    const staged = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const p0 = staged.bots.map((b) => ({ x: b.x, y: b.y }));
    await page.evaluate(() => window.advanceTime(800));
    const s1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    let maxMove = 0;
    for (let i = 0; i < s1.bots.length; i++) {
      const d = Math.hypot(s1.bots[i].x - p0[i].x, s1.bots[i].y - p0[i].y);
      if (d > maxMove) maxMove = d;
    }
    check('bot: hareket ediyor (kendi kararıyla)', maxMove > 20, `maxΔ=${maxMove.toFixed(0)}px`);

    // (b) YEM YEME: oyuncu uzak köşede → bot0'un tam üstüne yem doğur
    const b0 = s1.bots[0];
    const far = pickFarCorner(b0.x, b0.y);
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), far);
    const eatenBefore = b0.foodEaten;
    const massBefore = b0.mass;
    await page.evaluate(([x, y]) => window.test_spawn_food(x, y), [b0.x, b0.y]);
    await page.evaluate(() => window.advanceTime(400));
    const s2 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'bot: yem yedi — aynı Growth sistemi (mass/skor arttı)',
      s2.bots[0].foodEaten >= eatenBefore + 1 && s2.bots[0].mass > massBefore,
      `foodEaten=${s2.bots[0].foodEaten} mass=${massBefore}→${s2.bots[0].mass} score=${s2.bots[0].score}`,
    );

    const biggestIdx = (st) => {
      let m = 0;
      for (let i = 1; i < st.bots.length; i++) if (st.bots[i].mass > st.bots[m].mass) m = i;
      return m;
    };

    // (c) SALDIRI: KONTROLLÜ KÜTLE + YEMSİZ SAHNE (ölçüm determinizmi)
    //
    // Neden sabit kütle: "en büyük bot" seçimi sınav boyunca büyüyen
    // botlarda 3000+ kütleye çıkıyordu. Hareket üstel yaklaşım
    // (ease = dist/(50+radius)) olduğu için büyük yarıçap avı YAVAŞLATIR:
    //   mass 3091 → r 556 → glide 606 → 1200ms net yer değiştirme ~13px
    // Ölçümün geçmesi botun yeme dolambaçına girmesine bağlıydı (rastgele).
    //   mass 400 → r 200 → glide 250 → net ~115px (eşiğin 2.8×'i) → kalıcı
    const CHASE_BOT_MASS = 400;
    const CHASE_PLAYER_MASS = 100;
    let sT = s2;
    const bigIdx = biggestIdx(sT);
    await page.evaluate(() => window.test_reset_pulls());
    await page.evaluate((m) => window.test_set_mass('player', m), CHASE_PLAYER_MASS);
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [bigIdx, CHASE_BOT_MASS]);
    await page.evaluate(() => window.advanceTime(60)); // hedef radius ease
    await page.evaluate((m) => window.test_set_mass('player', m), CHASE_PLAYER_MASS);
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [bigIdx, CHASE_BOT_MASS]);
    sT = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const big0 = sT.bots[bigIdx];
    check(
      'bot davranış: av botu > oyuncu (kontrollü kütle, av senaryosu kuruldu)',
      big0.mass === CHASE_BOT_MASS && sT.player.mass === CHASE_PLAYER_MASS,
      `bot mass=${big0.mass} (=${CHASE_BOT_MASS}) player=${sT.player.mass} (=${CHASE_PLAYER_MASS})`,
    );

    // Ölçüm determinizmi: diğeri botlar rastgele gezinir ve 1200ms'de ~315px
    // kat edebilir → chase/flee yarıçapına (300/260) girip botun "av" seçimini
    // çalabiliyordu (av başka bot → yön ölçüm yönüne ters, dot<0 flake'si).
    // Yolculuk mesafesinden çok uzaklaştır: sadece sahnelenen av/tehdit menzilte.
    // Uzak park: SABİT 8 liste 60 botta `FAR[i]` undefined → suite çöküyordu.
    // Bot sayısından üretilir; her nokta (2000,2000) sahnesinden ≥4000px uzakta
    // (chase 300 / flee 260 menzili + 1200ms gezinme payı) ve birbirine ≥400px
    // (arkadan birbirini kovalayıp ölçümü çalmasınlar).
    const FAR = Array.from({ length: sT.bots.length }, (_, i) => [
      5000 + (i % 10) * 400,
      5000 + Math.floor(i / 10) * 400,
    ]);
    for (let i = 0; i < sT.bots.length; i++) {
      if (i === bigIdx) continue;
      await page.evaluate(
        ([idx, x, y]) => window.test_set_bot_pos(idx, x, y),
        [i, FAR[i][0], FAR[i][1]],
      );
    }
    // Sahne: av botu harita ORTASINA ışınla — duvar yok, hareket serbest
    // (botlar kenara sıkışabilir → duvara basıp 0px kalabiliyor).
    await page.evaluate(([i]) => window.test_set_bot_pos(i, 2000, 2000), [bigIdx]);
    // YEM TEMİZLİĞİ: ölçüm penceresinde bot yem ararken dolambaça giriyor
    // (1200ms'de ~16 yem = +160 kütle) → hem kütlesi kayıyor hem av
    // ilişkisi kayabiliyor. Sahneyi yemsiz bırakıyoruz: yem yenilemesi
    // yem YENDİĞİNDE olur, silinen yem geri gelmez.
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [2000, 2000]);
    await page.evaluate(() => window.test_clear_near_player(900));
    // KÜTLE KİLİDİ: temizlik sırasında yem çözülmesi olabilir → yeniden sabitle
    await page.evaluate(() => window.test_reset_pulls());
    await page.evaluate((m) => window.test_set_mass('player', m), CHASE_PLAYER_MASS);
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [bigIdx, CHASE_BOT_MASS]);
    // oyuncu 200px uzağa ışınla (chaseRadius 300 içinde) → bot YAKLAŞMALI
    const tx = 2200;
    const ty = 2000;
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [tx, ty]);
    const ch0 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    // hedef: ch0 anındaki en yakın küçük hücre (botun seçtiği av)
    const cbCh0 = ch0.bots[bigIdx];
    let prey0 = null;
    let preyD = Infinity;
    for (const c of [ch0.player, ...ch0.bots.filter((_, i) => i !== bigIdx)]) {
      if (c.mass >= cbCh0.mass) continue;
      const d = Math.hypot(c.x - cbCh0.x, c.y - cbCh0.y);
      if (d < preyD) {
        preyD = d;
        prey0 = c;
      }
    }
    // Ölçüm penceresi: yemsiz sahne + kilitli kütle → tam deterministik.
    // Yaklaşma ÜSTELDİR (ease = dist/(50+r)); 200px'den başlayıp 1200ms'de
    // ~115px yer değiştirir (kontrollü mass 400 → r 200, glide 250).
    // Kütle oyuncu da değişirse eşiği tutturamayabilirdi → ölçüm sonrası da
    // kontrol edilir (hata mesajında görünür).
    await page.evaluate(() => window.advanceTime(1200));
    const ch1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const cbCh1 = ch1.bots[bigIdx];
    const cmx = cbCh1.x - cbCh0.x;
    const cmy = cbCh1.y - cbCh0.y;
    const cMoved = Math.hypot(cmx, cmy);
    // avın BAŞLANGIÇ konumuna doğru net bileşen — kamera/oyuncu drift'ine bağışık
    const cDot = prey0 ? cmx * (prey0.x - cbCh0.x) + cmy * (prey0.y - cbCh0.y) : -1;
    check(
      'bot SALDIRI: küçük avın konumuna doğru yaklaştı (chase)',
      !!prey0 && preyD < 300 && cMoved > 40 && cDot > 0,
      `preyD=${preyD.toFixed(0)} moved=${cMoved.toFixed(0)}px dot=${cDot.toFixed(0)} | bot ${cbCh0.mass.toFixed(0)}→${cbCh1.mass.toFixed(0)} oyuncu ${ch0.player.mass}→${ch1.player.mass} av?${cbCh1.mass > ch1.player.mass}`,
    );

    // (d) KAÇMA: oyuncuyu doğrudan büyük yap (test_set_mass) → sonra 200px yakına
    sT = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const playerTarget = Math.max(sT.player.mass, sT.bots[bigIdx].mass + 41);
    // Aynı marj koruması (c)'deki gibi: bot 50ms'de yem yiyip +41'lik marjı
    // eritemesin (flake: player=1061 > bot=1030+40).
    await page.evaluate(() => window.test_reset_pulls());
    await page.evaluate((m) => window.test_set_mass('player', m), playerTarget);
    await page.evaluate(() => window.advanceTime(50)); // hedef radius ease
    sT = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'bot davranış: oyuncu > en büyük bot (tehlike senaryosu kuruldu)',
      sT.player.mass > sT.bots[bigIdx].mass + 40,
      `player=${sT.player.mass} > bot=${sT.bots[bigIdx].mass}`,
    );

    // Sahne: tekrar harita ortasına ışınla (duvarsız zemin) → player +70px.
    // KAÇ determinizmi: fleeRadius 260 → tehdit, 70+90=160px kaçışta da
    // menzilde kalır; 700ms'de bot ~90px (133px/s — slowDown 2.55, mass 1030)
    // kaçabilir → tüm pencere KAÇ modu. (200px başlangıçta menzil 60px'de
    // terk edilip rastgele yem/konma hedefi yönü iptal ediyordu → flake.)
    // (c) penceresinde uzak botlar gezindi → (d) ölçümü öncesi tekrar UZAKA park
    // (bot sayısı: (c) bloğunda hâlâ geçerli olan `sT`'den — eski `sStage`
    //  değişkeni (c) sahne kurulumu sadeleşince kaldırıldı)
    for (let i = 0; i < sT.bots.length; i++) {
      if (i === bigIdx) continue;
      await page.evaluate(
        ([idx, x, y]) => window.test_set_bot_pos(idx, x, y),
        [i, FAR[i][0], FAR[i][1]],
      );
    }
    await page.evaluate(([i]) => window.test_set_bot_pos(i, 2000, 2000), [bigIdx]);
    const sStage2 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const cb = sStage2.bots[bigIdx];
    const ftx = cb.x + 70;
    const fty = cb.y;
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [ftx, fty]);
    const fl0 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const fb0 = fl0.bots[bigIdx];
    const fp0 = { x: fl0.player.x, y: fl0.player.y };
    // Ölçüm penceresi: efekt yok → ölçüm deterministik
    await page.evaluate(() => window.advanceTime(700));
    const fl1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const fb1 = fl1.bots[bigIdx];
    const mx = fb1.x - fb0.x;
    const my = fb1.y - fb0.y;
    const moved = Math.hypot(mx, my);
    const dot = mx * (fb0.x - fp0.x) + my * (fb0.y - fp0.y); // oyuncudan UZAK yön
    check(
      'bot KAÇMA: büyük tehditten uzaklaştı (flee)',
      moved > 40 && dot > 0,
      `moved=${moved.toFixed(0)}px dot=${dot.toFixed(0)}`,
    );

    // (e) EKRAN: rastgele SKIN çizimi — bigIdx botuna lava skin'i zorla,
    // diğer botları uzağa park et → pencere SADECE bu botu gösterir.
    {
      const preS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      await parkAll(page, bigIdx);
      await page.evaluate((i) => window.test_set_bot_skin(i, 'lava'), bigIdx);
      await page.evaluate(() => window.advanceTime(50)); // park + skin render
      const sv = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      const botv = sv.bots[bigIdx];
      const sx = (botv.x - sv.camera.x) * sv.camera.zoom + sv.viewportW / 2;
      const sy = (botv.y - sv.camera.y) * sv.camera.zoom + sv.viewportH / 2;
      await page.screenshot({ path: join(SHOT_DIR, '08-bots.png') });
      const pngBots = decodePNG(readFileSync(join(SHOT_DIR, '08-bots.png')));
      // theme SKIN_VARIANTS.lava.ring = #f87171 (248,113,113) — skin kenar halkası.
      // r = √mass × 10 ölçeğinde halka EKRAN yarıçapı kadar geniş → pencere buna göre.
      const LAVA_RING = [248, 113, 113];
      const botRScr = botv.r * sv.camera.zoom;
      const wx0 = Math.max(0, Math.floor(sx - botRScr - 30));
      const wy0 = Math.max(0, Math.floor(sy - botRScr - 30));
      const wx1 = Math.min(sv.viewportW, Math.ceil(sx + botRScr + 30));
      const wy1 = Math.min(sv.viewportH, Math.ceil(sy + botRScr + 30));
      const botN = countPixels(pngBots, { x: wx0, y: wy0, w: wx1 - wx0, h: wy1 - wy0 }, LAVA_RING, 35);
      check(
        'bot çizimi: lava skin neon halkası ekranda',
        sx > 40 && sx < sv.viewportW - 40 && sy > 40 && sy < sv.viewportH - 40 && botN >= 15,
        `screen=(${sx.toFixed(0)},${sy.toFixed(0)}) rScr=${botRScr.toFixed(0)} ${botN} px`,
      );
    }
  }

  // --- 8d) HÜCRE-YUTMA (Agar.io): yutma eşiği, mass/skor devri, ölüm + yeniden doğuş ---
  {
    // Sahne KÖŞE'de (4700,4700): spawn inset bölgesi (≤4400) DIŞINDA → yeniden
    // doğuş her zaman ≥424px uzağa düşer → "yeniden doğdu" kanıtı deterministik.
    const SX = 4700;
    const SY = 4700;
    const B = 0; // sahnedeki bot — diğerleri uzağa park edilir

    // Sahne hazırlayıcı — hepsi combat OFF'da:
    //  1) eski çekilişleri çöz  2) mass hedefini kur  3) OFF pencerede radius
    //     ease'ini tamamla (yutma mesafesi radyuslara bağlı → birebir gerekli)
    //  4) dış botları park et  5) ikiliyi aynı noktaya sahnele, mass'i KİLİTLE,
    //     pull'ları iptal + bölgeyi temizle. ON'dan sonra hiç adım yok (donuk geometri).
    const stagePair = async (playerMass, botMass) => {
      await page.evaluate(() => window.advanceTime(400));
      await page.evaluate((m) => window.test_set_mass('player', m), playerMass);
      await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, botMass]);
      await page.evaluate(() => window.advanceTime(400)); // OFF: radius ease
      await parkAll(page, B);
      await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [B, SX, SY]);
      await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [SX, SY]);
      await page.evaluate((m) => window.test_set_mass('player', m), playerMass); // kilitle
      await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, botMass]);
      await page.evaluate(() => window.test_reset_pulls());
      // Yem temizliği oyuncunun yarıçapından GENİŞ olmalı: 400 kütlelik
      // oyuncunun yarıçapı 200px, 300px'lik temizlik yalnızca 1.5× pay
      // bırakıyordu (çekiliş tam sınırdan başlar → kalan yem 100ms'lik
      // pencerede çözülüp skoru +1 kaydırıyor, birebir "+100" kontrolünü
      // bozuyordu). 600px: hareket + çekiliş payı tamamen kapsanır.
      await page.evaluate(() => window.test_clear_near_player(600));
      // Eski ölüm/POOF parçacıklarını söndür → yerel patlama sayımı 0'dan başlar
      await page.evaluate(([x, y]) => window.test_clear_particles(x, y, 200), [SX, SY]);
    };

    // (A) OYUNCU BOTU YUTAR: player 400 ≥ 100×1.2, tam üst üste → mass + skor devri
    await stagePair(400, 100);
    const aPre = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.evaluate(() => window.test_set_combat(true));
    await page.evaluate(() => window.advanceTime(100));
    await page.evaluate(() => window.test_set_combat(false));
    const a1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    // Bu pencerede mass DECAY de çalışır (theme.game.decay: mass×0.004×dt,
    // minMass 150 üstü) → 500'ün tam değeri yerine decay payına izin ver.
    const aTol = 500 * 0.004 * 0.5;
    // TESHİS: savaş öncesi kilitlenen kütle + sahneye YAKIN bot sayısı.
    // Beklenen: oyuncu 400, bot 100, yakında 1 bot. Sapma varsa ya kütle
    // kaymış ya da ikinci bir kurban menzile girmiş demektir.
    const aNear = aPre.bots.filter(
      (b) => Math.hypot(b.x - SX, b.y - SY) < 1500,
    ).length;
    const subA = {
      kitle: Math.abs(a1.player.mass - 500) <= aTol,
      skor: a1.player.score === aPre.player.score + 100,
      botSayisi: a1.botCount === 60,
    };
    const badA = Object.entries(subA)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    check(
      'yutma: oyuncu botu yuttu — mass + skor devri (agar.io kuralı)',
      badA.length === 0,
      `mass=${a1.player.mass} (beklenen 500 ±${aTol.toFixed(2)}) score=${aPre.player.score}→${a1.player.score} (beklenen +100) botCount=${a1.botCount} | ÖNCESİ: player=${aPre.player.mass} bot=${aPre.bots[B].mass} sahnedeYakinBot=${aNear}` +
        (badA.length ? ` | BOZUK: ${badA.join(',')}` : ''),
    );
    const aBotDist = Math.hypot(a1.bots[B].x - SX, a1.bots[B].y - SY);
    check(
      'yutma: yenen bot rastgele yeniden doğdu',
      aBotDist > 200 && a1.bots[B].mass === 100,
      `dist=${aBotDist.toFixed(0)}px mass=${a1.bots[B].mass}`,
    );

    // (B) BOT OYUNCUYU YUTAR → ölüm: tabana dönüş + kamera snap + ekran flaşı
    await stagePair(300, 500);
    // Global `alive` bot yemlerinden gürültülü (8 bot her an POOF bırakabilir) →
    // altın patlama ÖLÜM NOKTASINDA yerel olarak sayılır (200px pencere).
    const bNear0 = await page.evaluate(
      ([x, y]) => window.test_count_particles(x, y, 200),
      [SX, SY],
    );
    await page.evaluate(() => window.test_set_combat(true));
    await page.evaluate(() => window.advanceTime(100));
    await page.evaluate(() => window.test_set_combat(false));
    const b1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const bNear1 = await page.evaluate(
      ([x, y]) => window.test_count_particles(x, y, 200),
      [SX, SY],
    );
    // Tasarım: ölüm → DeathScreen (OTOMATİK respawn yok), yeniden doğuş
    // "TEKRAR OYNA" ile elle çağrılır (test_respawn aynı kapı). Önce ölüm
    // anını (dead=true, mass=0), sonra taban durumunu doğrula.
    const deadNow = b1.dead === true && b1.player.mass === 0;
    await page.evaluate(() => window.test_respawn());
    const b2 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const bDeathDist = Math.hypot(b2.player.x - SX, b2.player.y - SY);
    check(
      'ölüm: oyuncu yutuldu → tabana döndü (mass 100, skor 0, rastgele konum)',
      deadNow &&
        b2.player.mass === 100 &&
        b2.player.score === 0 &&
        bDeathDist > 200,
      `dead=${b1.dead} mass=${b1.player.mass}→${b2.player.mass} score=${b2.player.score} dist=${bDeathDist.toFixed(0)}`,
    );
    const camGap = Math.hypot(b2.camera.x - b2.player.x, b2.camera.y - b2.player.y);
    check(
      'ölüm: kamera anında yeni konuma snap (harita fly-by yok)',
      camGap < 5,
      `cam gap=${camGap.toFixed(1)}px`,
    );
    check(
      'ölüm: ekran flaşı + altın ölüm patlaması (görsel geri bildirim)',
      b1.flash > 0.2 && bNear1 - bNear0 >= 15,
      `flash=${b1.flash} ölüm noktası parçacık ${bNear0}→${bNear1} (Δ${bNear1 - bNear0})`,
    );
    // mass DECAY (yiyen bot 800 > minMass 150) → mutlak 800 yerine pay
    const bTol = 800 * 0.004 * 0.5;
    check(
      'yutma: yiyen bot mass devrini aldı',
      Math.abs(b1.bots[B].mass - 800) <= bTol,
      `bot mass=${b1.bots[B].mass} (beklenen 800 ±${bTol.toFixed(2)})`,
    );

    // (C) YUTMA EŞİĞİ: 110 vs 100 (< ×1.15) → üst üste gelseler bile YUTMA YOK
    await stagePair(110, 100);
    const cPre = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.evaluate(() => window.test_set_combat(true));
    await page.evaluate(() => window.advanceTime(60));
    await page.evaluate(() => window.test_set_combat(false));
    const c1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const cBotDist = Math.hypot(c1.bots[B].x - SX, c1.bots[B].y - SY);
    check(
      'yutma eşiği: küçük mass farkıyla YUTMA YOK (1.1× < 1.15×)',
      c1.player.mass === 110 &&
        c1.player.score === cPre.player.score &&
        cBotDist < 20 &&
        c1.bots[B].mass === 100 &&
        c1.botCount === 60,
      `player=${c1.player.mass} score=${c1.player.score} botDist=${cBotDist.toFixed(1)} botMass=${c1.bots[B].mass}`,
    );
  }

  // --- 9) TARAYICI ZOOM SUİSTİMALİ TELAFİSİ ---
  {
    const visOf = (s) => s.viewportW / s.camera.zoom; // görünen dünya genişliği (css px)

    // a) Ctrl+tekerlek engellenir (preventDefault), normal wheel serbest kalır
    const ctrl = await page.evaluate(() => {
      const ev = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, cancelable: true, bubbles: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    check('tarayıcı zoom: ctrl+wheel preventDefault edildi', ctrl === true);

    const plain = await page.evaluate(() => {
      const ev = new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true });
      window.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    check('tarayıcı zoom: normal wheel engellenmedi', plain === false);

    // Gerçek ctrl+wheel denemesi → görünen harita alanı değişmemeli
    const v0 = visOf(JSON.parse(await page.evaluate(() => window.render_game_to_text())));
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await sleep(150);
    await page.evaluate(() => window.advanceTime(50));
    const z0 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'ctrl+wheel: görünen harita alanı sabit',
      Math.abs(visOf(z0) - v0) / v0 < 0.03,
      `önce ${v0.toFixed(0)} sonra ${visOf(z0).toFixed(0)}px`,
    );

    // b) DPR telafisi: %150 tarayıcı zoom'u emülasyonu
    //    (gerçek zoom: css viewport 1280→853, devicePixelRatio 1→1.5)
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 853,
      height: 480,
      deviceScaleFactor: 1.5,
      mobile: false,
    });
    await sleep(300); // matchMedia(resolution) change + resize
    await page.evaluate(() => window.advanceTime(50)); // kamera zoom yeniden hesap + render
    const z1 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const v1 = visOf(z1);
    check(
      'DPR değişimi yakalandı (matchMedia/resize)',
      z1.dpr.cur === 1.5 && z1.viewportW >= 850 && z1.viewportW <= 860,
      `dpr=${z1.dpr.cur} vw=${z1.viewportW}`,
    );
    check(
      "DPR telafisi: %150 zoom'da görünen dünya alanı sabit",
      Math.abs(v1 - v0) / v0 < 0.03,
      `önce ${v0.toFixed(0)} sonra ${v1.toFixed(0)}px (effZoom=${z1.camera.zoom})`,
    );

    // Geri al: referans DPR'a dön
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await sleep(200);
    await page.evaluate(() => window.advanceTime(50));
    const z2 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'DPR referansa döndü (görünüm eski haline geldi)',
      z2.dpr.cur === z2.dpr.ref && Math.abs(visOf(z2) - v0) / v0 < 0.03,
      `dpr=${z2.dpr.cur} vw=${z2.viewportW} visible=${visOf(z2).toFixed(0)}`,
    );
    await cdp.detach();
  }

  // --- 10) SKIN SİSTEMİ: menü (K/Esc) → seçim → persist → sprite piksel + fallback ---
  {
    // Sahne: oyuncu merkezde dursun, botlar uzak ızgarada (pencere temiz kalsın),
    //Combat OFF kalır (8d kapattı — burada da garantiye al).
    await page.evaluate(() => window.test_set_combat(false));
    const PARK9 = [
      [500, 500], [1500, 500], [2500, 500], [500, 1500],
      [1500, 1500], [2500, 1500], [500, 2500], [1500, 2500],
    ];
    await page.evaluate(
      ([pts]) => {
        window.test_set_player_pos(3700, 3700);
        for (let i = 0; i < pts.length; i++) window.test_set_bot_pos(i, pts[i][0], pts[i][1]);
        window.test_clear_near_player(400);
      },
      [PARK9],
    );
    let s9 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.mouse.move(Math.round(s9.viewportW / 2), Math.round(s9.viewportH / 2));
    await page.evaluate(() => window.advanceTime(1200)); // kamera settle + render
    s9 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    // a) K ile menü açılır → oyun girdisi kapanır (kart tıklaması hücreyi sürüklenmesin)
    await page.keyboard.press('k');
    await page.waitForSelector('[data-skin-menu]', { timeout: 3000 });
    const openS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check('skin menü: K ile açılır, oyun girdisi kapanır', openS.inputEnabled === false, `inputEnabled=${openS.inputEnabled}`);

    // b) Kart gridi: akordeon kapalıyken kart YOK → SKINLER açılınca 15 skin
    // kartı + kilitli kartta fiyat görünür (market dili)
    await page.click('[data-market-section="skins"]');
    const cardInfo = await page.evaluate(() => ({
      count: document.querySelectorAll('[data-skin-card]').length,
      galaxyPrice: !!Array.from(document.querySelectorAll('[data-skin-card]')).find(
        (el) => el.getAttribute('data-skin-card') === 'galaxy' && el.textContent.includes('750'),
      ),
    }));
    check(
      'skin menü: 15 kart + kilitli fiyatta görünür',
      cardInfo.count === 15 && cardInfo.galaxyPrice,
      `kart=${cardInfo.count} galaxy750=${cardInfo.galaxyPrice}`,
    );
    // c) EFEKTLER bölümü: 7 efekt kartı
    await page.click('[data-market-section="effects"]');
    const fxCount = await page.evaluate(() => document.querySelectorAll('[data-fx-card]').length);
    check('efekt menü: 8 efekt kartı', fxCount === 8, `kart=${fxCount}`);

    // c) Mobil dokunmatik hedef ≥44px (açma butonu)
    const tBox = await page.locator('[data-skin-toggle]').boundingBox();
    check(
      'skin: dokunmatik hedef ≥44px',
      !!tBox && tBox.height >= 44 && tBox.width >= 44,
      tBox ? `${tBox.width}x${tBox.height}` : 'yok',
    );

    // d) Esc ile kapanır → girdi geri açılır
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-skin-menu]', { state: 'detached', timeout: 3000 });
    const escS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check('skin menü: Esc ile kapanır, girdi geri açılır', escS.inputEnabled === true, `inputEnabled=${escS.inputEnabled}`);

    // e) Seçim: GALAXİ → satın alma → payload'a yansır (anında uygulanır).
    // Akordeon: menü her açılışta YENİDEN MOUNT olur (useState false) → önce
    // SKINLER bölümü açılır. Tasarım gereği SEÇİM MENÜYÜ KAPATMAZ (panel ipucu:
    // "K ile aç/kapat · Esc ile kapat") → seçim sonrası Esc ile kapanır.
    await page.keyboard.press('k');
    await page.waitForSelector('[data-skin-menu]', { timeout: 3000 });
    const skinsOpen = await page.evaluate(
      () => document.querySelectorAll('[data-skin-card]').length > 0,
    );
    if (!skinsOpen) await page.click('[data-market-section="skins"]');
    await page.waitForSelector('[data-skin-card="galaxy"]', { timeout: 3000 });
    await page.click('[data-skin-card="galaxy"]');
    const pickS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-skin-menu]', { state: 'detached', timeout: 3000 });
    const selS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'skin seçimi: galaxy uygulandı + seçimden sonra Esc menüyü kapatır',
      pickS.skin === 'galaxy' &&
        pickS.inputEnabled === false &&
        selS.skin === 'galaxy' &&
        selS.inputEnabled === true,
      `skin=${pickS.skin} input(seçim)=${pickS.inputEnabled} input(Esc)=${selS.inputEnabled}`,
    );

    // f) localStorage kalıcılığı
    const storedSkin = await page.evaluate(() => localStorage.getItem('neon-arena.skin'));
    check('skin persist: localStorage yazıldı', storedSkin === 'galaxy', `stored=${storedSkin}`);

    // g) Sprite yüklendi (public/skins/galaxy.png) → payload köprüsü
    await page.waitForFunction(
      () => JSON.parse(window.render_game_to_text()).skinLoaded === true,
      { timeout: 5000 },
    ).catch(() => {});
    const loadS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check('skin sprite: görsel yüklendi (image modu)', loadS.skinLoaded === true, `skin=${loadS.skin} loaded=${loadS.skinLoaded}`);

    // h) Piksel: GALAXİ moru oyuncu gövdesinde ekranda (theme'den referans)
    await page.evaluate(() => window.test_clear_near_player(400));
    await page.evaluate(() => window.advanceTime(100));
    let shotS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.screenshot({ path: join(SHOT_DIR, '11-skin-galaxy.png') });
    {
      const sx = (shotS.player.x - shotS.camera.x) * shotS.camera.zoom + shotS.viewportW / 2;
      const sy = (shotS.player.y - shotS.camera.y) * shotS.camera.zoom + shotS.viewportH / 2;
      const png = decodePNG(readFileSync(join(SHOT_DIR, '11-skin-galaxy.png')));
      // theme.skin.variants.galaxy.fill = #7c3aed (109, 40, 217) — başka hiçbir elementte yok
      const n = countPixels(png, { x: Math.round(sx) - 44, y: Math.round(sy) - 44, w: 88, h: 88 }, [109, 40, 217], 50);
      check('skin render piksel: galaksi moru gövdede net', n >= 100, `${n} px (limit 100) — ekran pos (${Math.round(sx)},${Math.round(sy)})`);
    }

    // i) Fallback zinciri: CLASSIC'e dön → sprite kapanır, klasik palet geri gelir
    // (menü her açılışta remount → SKINLER bölümü kapalı başlar; seçim kapatmaz)
    await page.keyboard.press('k');
    await page.waitForSelector('[data-skin-menu]', { timeout: 3000 });
    const skinsOpen2 = await page.evaluate(
      () => document.querySelectorAll('[data-skin-card]').length > 0,
    );
    if (!skinsOpen2) await page.click('[data-market-section="skins"]');
    await page.waitForSelector('[data-skin-card="classic"]', { timeout: 3000 });
    await page.click('[data-skin-card="classic"]');
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-skin-menu]', { state: 'detached', timeout: 3000 });
    const backS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'skin fallback: classic → payload + sprite modu kapandı',
      backS.skin === 'classic' && backS.skinLoaded === false,
      `skin=${backS.skin} loaded=${backS.skinLoaded}`,
    );
    await page.evaluate(() => window.advanceTime(100));
    shotS = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.screenshot({ path: join(SHOT_DIR, '12-skin-classic.png') });
    {
      const sx = (shotS.player.x - shotS.camera.x) * shotS.camera.zoom + shotS.viewportW / 2;
      const sy = (shotS.player.y - shotS.camera.y) * shotS.camera.zoom + shotS.viewportH / 2;
      const png = decodePNG(readFileSync(join(SHOT_DIR, '12-skin-classic.png')));
      // theme.color.playerFill = #22d3ee (34, 211, 238) — klasik gövde geri döndü
      const n = countPixels(png, { x: Math.round(sx) - 44, y: Math.round(sy) - 44, w: 88, h: 88 }, [34, 211, 238], 50);
      check('skin fallback piksel: klasik cyan gövde geri geldi', n >= 80, `${n} px (limit 80)`);
    }
  }

  // --- 11) ÖLÜM EKONOMİSİ: ölen hücre mass'in bir kısmını yem olarak saçar ---
  {
    // Sahne 8d gibi KÖŞE'de (4700,4700): spawn inset (≤4400) dışında → yeniden
    // doğuş deterministik uzağa düşer. Combat OFF, botlar uzak köşe parkında.
    await page.evaluate(() => window.test_set_combat(false));
    const SX = 4700;
    const SY = 4700;
    const B = 0;

    // Sahneleme (8d stagePair aynısı): pull flush → mass → OFF radius ease →
    // dış botları park et → ikiliyi aynı noktaya sahnele → mass kilitle →
    // pull reset + bölge temizle. ON'a kadar hiç adım yok (donuk geometri).
    await page.evaluate(() => window.advanceTime(400));
    await page.evaluate((m) => window.test_set_mass('player', m), 130); // r≈114 → halka (114+100)×1.3≈278 < 300 (duvar clamp'siz)
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, 100]);
    await page.evaluate(() => window.advanceTime(400)); // OFF: radius ease
    await parkAll(page, B);
    await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [B, SX, SY]);
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [SX, SY]);
    // Kamera yerleşimi ÖNCE: oyuncu (4700,4700)'ye ışınlandı ama kamera hâlâ
    // §10 konumunda (~2000px boşluk) → 6 adımda kapanamaz, pixel ekranı
    // viewport DIŞINA taşardı (0px flake). İmleç MERKEZDE (offset 0 → hücre
    // DURUR, referans canvas.js gameInput) 4 faz (1000ms) kamera oyuncuya
    // oturur; faz boyunca bot hareketi aşağıdaki TEKRAR sahnele + mass
    // kilidiyle sıfırlanır.
    for (let ph = 0; ph < 4; ph++) {
      const st = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
      const ax = Math.round(st.viewportW / 2);
      const ay = Math.round(st.viewportH / 2);
      await page.mouse.move(ax, ay);
      await page.evaluate(() => window.advanceTime(250));
    }
    // Fazlar boyunca bot/oyuncu hareket etti (bot kaçtı, oyuncu clamp'e yürüdü)
    // → sahne TAM yeniden kilitlenir
    await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [B, SX, SY]);
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [SX, SY]);
    await page.evaluate((m) => window.test_set_mass('player', m), 130); // kilitle
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, 100]);
    await page.evaluate(() => window.test_reset_pulls());
    // Saçılma halkası penceresi (ringBase+30 ≈ 314px) TEMİZLİK DIŞINDA kalmamalı:
    // 300'ün üstündeki saha yemleri annülusa girip "halka yemi" sayımını şişiriyordu
    // (8 = 5 saçılma + 3 saha yemi). Yarıçap pencere üstünü + marj kapsar.
    await page.evaluate(() => window.test_clear_near_player(360));

    // İmleç MERKEZ → offset 0 → hedef = oyuncunun kendisi: hücre DURUR
    // (kamera konumundan bağımsız — referans canvas.js gameInput modeli)
    const s11pre = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.mouse.move(Math.round(s11pre.viewportW / 2), Math.round(s11pre.viewportH / 2));

    // Beklenen pellet: kurban mass × ratio / normal yem kazanımı (temadan)
    const expectN = Math.max(
      1,
      Math.min(
        s11pre.scatter.maxCount,
        Math.round((s11pre.bots[B].mass * s11pre.scatter.ratio) / s11pre.growth.massGain),
      ),
    );
    const fN0 = s11pre.foodCount;
    const eaten0 = s11pre.player.foodEaten;

    await page.evaluate(() => window.test_set_combat(true));
    await page.evaluate(() => window.advanceTime(100));
    await page.evaluate(() => window.test_set_combat(false));
    const s11 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    // mass DECAY (230 > minMass 150) → mutlak 230 yerine decay payına izin ver
    const eTol = 230 * 0.004 * 0.5;
    check(
      'ölüm ekonomisi: yiyen mass+skor devrini aldı (devour.gain=1 korunur)',
      Math.abs(s11.player.mass - 230) <= eTol &&
        s11.player.score === s11pre.player.score + 100,
      `mass=${s11.player.mass} (beklenen 230 ±${eTol.toFixed(2)}) score=${s11pre.player.score}→${s11.player.score}`,
    );
    check(
      'ölüm ekonomisi: kurban mass inin bir kısmı yem olarak saçıldı (foodCount tam)',
      s11.foodCount === fN0 + expectN,
      `${fN0}→${s11.foodCount} (beklenen +${expectN})`,
    );

    // Saçılan yemler ölüm noktasında HALLKA içinde (intikam yolu).
    // Halka yarıçapı = (yiyenR + kurbanR) × ringFactor — payload köprüsünden
    // (r = √mass × 10 ölçeğinde halka büyük; 66..150 eski penceresi geçersiz).
    const ringBase = (s11pre.player.r + s11pre.bots[B].r) * s11pre.scatter.ringFactor;
    const ringN = s11.foods.filter((f) => {
      const d = Math.hypot(f.x - SX, f.y - SY);
      return d >= ringBase - 30 && d <= ringBase + 30;
    }).length;
    check(
      'ölüm ekonomisi: saçılma halkası ölüm noktasında (yiyen erişiminin dışı)',
      ringN >= expectN && ringN <= expectN + 2,
      `${ringN} yem (beklenen ${expectN}±2, halka r=${ringBase.toFixed(0)})`,
    );

    check(
      'ölüm ekonomisi: yiyen saçılmış yemleri anında vakumlamadı (intikam yolu açık)',
      s11.player.foodEaten === eaten0,
      `foodEaten=${eaten0}→${s11.player.foodEaten}`,
    );

    const respawnD = Math.hypot(s11.bots[B].x - SX, s11.bots[B].y - SY);
    check(
      'ölüm ekonomisi: kurban yine rastgele yeniden doğdu (8d davranışı korunur)',
      respawnD > 200 && s11.bots[B].mass === 100,
      `dist=${respawnD.toFixed(0)}px mass=${s11.bots[B].mass}`,
    );

    // Piksel: saçılma yemleri HUE renkleriyle ekranda — halka penceresi
    // (eaterR + victimR) × ringFactor (hücre gövdesi halkadan çok içeride)
    await page.screenshot({ path: join(SHOT_DIR, '13-death-scatter.png') });
    {
      const png = decodePNG(readFileSync(join(SHOT_DIR, '13-death-scatter.png')));
      let n = 0;
      let counted = 0;
      for (const f of s11.foods) {
        const d = Math.hypot(f.x - SX, f.y - SY);
        if (d < ringBase - 30 || d > ringBase + 30) continue; // halka yemleri
        const fx = (f.x - s11.camera.x) * s11.camera.zoom + s11.viewportW / 2;
        const fy = (f.y - s11.camera.y) * s11.camera.zoom + s11.viewportH / 2;
        const rgb = hslToRgb(f.hue, 100, 50);
        const rr = f.r * s11.camera.zoom + 6;
        n += countPixels(png, { x: fx - rr, y: fy - rr, w: 2 * rr, h: 2 * rr }, rgb, 35);
        counted++;
      }
      check(
        'ölüm ekonomisi piksel: saçılma yemleri hue renkleriyle ekranda',
        counted > 0 && n >= 20,
        `${n} px / ${counted} yem (limit 20)`,
      );
    }
  }

  // --- 12) KORUMASIZ YUTMA: kalkan oyundan komple kalktı — büyük bot,
  // küçük kurbanı bekleme penceresi olmadan ilk framelerde yutar ---
  {
    await page.evaluate(() => window.test_set_combat(false));
    const SX = 4700;
    const SY = 4700;
    const B = 0;

    // DURUM NORMALİZASYONU — önceki bölümler (özellikle 11) oyuncuyu
    // 1600 kütle / 60+ skor ile bırakıyor. Bu sahnenin "KÜÇÜK kurban"
    // varsayımı bozulursa yutma gerçekleşmez ve kontrol zinciri sessizce
    // düşer. Tek basına 4/4 geçen bu blok, tam suite içinde kırılıyordu.
    await page.evaluate(() => {
      if (window.test_respawn()) return; // ölüyse canlandır (taban: 100 kütle)
    });
    await page.evaluate(() => window.advanceTime(200));
    await page.evaluate((m) => window.test_set_mass('player', m), 100);
    await page.evaluate(() => window.test_reset_pulls());

    // Sahne: BÜYÜK bot (saldıran) + KÜÇÜK oyuncu (kurban) tam üst üste —
    // 1. adımda yutulacak kesin geometri (koruma penceresi YOK).
    await page.evaluate(() => window.advanceTime(400)); // pull flush + radius ease
    await page.evaluate((m) => window.test_set_mass('player', m), 100);
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, 800]);
    await page.evaluate(() => window.advanceTime(400)); // OFF: radius ease
    await parkAll(page, B);
    await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [B, SX, SY]);
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [SX, SY]);
    await page.evaluate((m) => window.test_set_mass('player', m), 100); // kilitle
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, 800]);
    await page.evaluate(() => window.test_reset_pulls());
    await page.evaluate(() => window.test_clear_near_player(300));

    // Kalkan izi yok: payload + tema köprüsü temiz
    const pre = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'kalkan YOK: payload shield alanı taşımıyor',
      pre.player.shieldT === undefined && pre.bots[B].shieldT === undefined,
      `shieldT=${pre.player.shieldT}`,
    );
    check(
      'kalkan YOK: tema köprüsünde shieldDur yok, scatter duruyor',
      pre.shieldDur === undefined && pre.scatter.ratio > 0 && pre.scatter.maxCount >= 1,
      `shieldDur=${pre.shieldDur} scatter=${pre.scatter.ratio}x max${pre.scatter.maxCount}`,
    );

    // Fare → merkez (offset 0 → oyuncu durur); bot oyuncuyu kovalar (glued)
    await page.mouse.move(Math.round(pre.viewportW / 2), Math.round(pre.viewportH / 2));

    // 120ms ON (< 150ms yem çekilişi → hiçbir stray yem çözülemez, mass EXACT)
    await page.evaluate(() => window.test_set_combat(true));
    await page.evaluate(() => window.advanceTime(120));
    await page.evaluate(() => window.test_set_combat(false));
    const s12 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));

    // Tasarım: ölüm → DeathScreen (otomatik respawn YOK) → test_respawn ile
    // tabana dön; "kalkan olmadan ilk pencerede yutuldu" kanıtını iki aşamada
    // doğrula (ölüm anı + yeniden doğuş). Bot kütüsü DECAY paylı (900 > 150).
    const dead12 = s12.player.mass === 0;
    const bTol12 = 900 * 0.004 * 0.5;
    await page.evaluate(() => window.test_respawn());
    const s12r = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const d12 = Math.hypot(s12r.player.x - SX, s12r.player.y - SY);
    // Hata mesajı HANGİ alt koşulun bozulduğunu tek tek sayar — tek
    // koşullu "false" yerine teşhis edilebilir kırılma raporu.
    const sub12 = {
      'ölü': dead12,
      'respawnKutle': s12r.player.mass === 100,
      'respawnSkor': s12r.player.score === 0,
      'dogusUzak': d12 > 200,
      'botKutle': Math.abs(s12.bots[B].mass - 900) <= bTol12,
      'botSkor': s12.bots[B].score === pre.bots[B].score + 100,
    };
    const broken12 = Object.entries(sub12)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    check(
      'kalkan YOK: büyük bot küçüğü beklemeden yuttu (mass + skor devri)',
      broken12.length === 0,
      broken12.length === 0
        ? `player=${s12.player.mass}→${s12r.player.mass} bot=${s12.bots[B].mass.toFixed(2)} score=${pre.bots[B].score}→${s12.bots[B].score} dist=${d12.toFixed(0)}`
        : `BOZUK: ${broken12.join(',')} | player=${s12.player.mass}→${s12r.player.mass} bot=${s12.bots[B].mass.toFixed(2)} (900±${bTol12}) scoreΔ=${s12.bots[B].score - pre.bots[B].score} (beklenen 100) dist=${d12.toFixed(0)} (esik 200)`,
    );

    // Yeniden doğuşta da koruma başlamıyor: aynı geometri anında tekrar yer
    await page.evaluate((m) => window.test_set_mass('player', m), 100);
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, 800]);
    await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [B, SX, SY]);
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [SX, SY]);
    await page.evaluate((m) => window.test_set_mass('player', m), 100);
    await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, 800]);
    await page.evaluate(() => window.test_reset_pulls());
    await page.evaluate(() => window.test_clear_near_player(300));
    const pre2 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.evaluate(() => window.test_set_combat(true));
    await page.evaluate(() => window.advanceTime(120));
    await page.evaluate(() => window.test_set_combat(false));
    const sd = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const dead2 = sd.player.mass === 0;
    await page.evaluate(() => window.test_respawn());
    const sdr = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const deathD = Math.hypot(sdr.player.x - SX, sdr.player.y - SY);
    check(
      'kalkan YOK: yeniden doğuşta koruma başlamıyor, anında tekrar yutulur',
      dead2 &&
        sdr.player.mass === 100 &&
        sdr.player.score === 0 &&
        deathD > 200 &&
        Math.abs(sd.bots[B].mass - 900) <= bTol12 &&
        sd.bots[B].score === pre2.bots[B].score + 100,
      `player=${sd.player.mass}→${sdr.player.mass} botMass=${sd.bots[B].mass} score=${pre2.bots[B].score}→${sd.bots[B].score} dist=${deathD.toFixed(0)}`,
    );
  }

  // --- 13) AGAR.IO HARİTASI: 20000² (4× dünya) + kenar modeli (net çizgi + void + yassılaşma) ---
  {
    await page.evaluate(() => window.test_set_combat(false));
    await page.evaluate(() => window.test_clear_near_player(400));
    const s13 = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'harita: 20000×20000 (4× dünya) + hedef 6000 yem (yoğun FFA)',
      s13.world.w === 20000 && s13.world.h === 20000 && s13.foodTarget === 6000,
      `world=${s13.world.w}×${s13.world.h} foodTarget=${s13.foodTarget}`,
    );

    // Sahne: oyuncu SAĞ duvarına yapış (merkez r/3 içeride — referans
    // adjustForBoundaries), fare duvarın TAŞINA → hücre basar, kontur duvara
    // kırpılır (yassılaşma).
    const r13 = s13.player.r;
    const wallX = s13.world.w - r13 / 3; // referans: inset = radius/3
    await parkAll(page, -1); // hepsi parkta (kimse sahneye karışmaz)
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [wallX, 2500]);
    // İmleç daima EKRAN SAĞ KENARINDA: hedef = hücre + 630/zoom (hücre
    // merkezli girdi — kamera lag'den BAĞIMSIZ) → her koşulda duvarın
    // dışında kalır, hücre duvara basar. (Eski flake: kamera bazlı hedef
    // ekran dışı kalıp input'u düşürüyor, hücre duvardan uzaklaşıyordu.)
    await page.mouse.move(1270, 360);
    await page.evaluate(() => window.advanceTime(1400)); // kamera yerleş + duvara bas
    const s13b = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    await page.screenshot({ path: join(SHOT_DIR, '15-world-edge.png') });
    const pngW = decodePNG(readFileSync(join(SHOT_DIR, '15-world-edge.png')));

    // Ekran x'i — kenar VE hücre AYNI kameradan hesaplanır (kamera gecikmesi
    // ikisini de aynı yana kaydırır → bağıl geometri değişmez)
    const bx = (s13b.world.w - s13b.camera.x) * s13b.camera.zoom + s13b.viewportW / 2;
    const pScr = {
      x: (s13b.player.x - s13b.camera.x) * s13b.camera.zoom + s13b.viewportW / 2,
      y: (s13b.player.y - s13b.camera.y) * s13b.camera.zoom + s13b.viewportH / 2,
    };

    // a) Kenar: İNCE NET SİYAH sınır çizgisi (clone drawBorder → theme.worldEdge)
    const edgeN = countPixels(pngW, { x: bx - 6, y: 80, w: 12, h: 200 }, [0, 0, 0], 45);
    check(
      'kenar: net SİYAH sınır çizgisi ekranda (agar.io modeli)',
      edgeN >= 25,
      `${edgeN} px (limit 25, bx=${bx.toFixed(0)})`,
    );

    // b) Sınırın DIŞI = ızgarasız saf BEYAZ zemin (beyaz zemin kararı)
    const voidN = countPixels(pngW, { x: bx + 12, y: 80, w: 60, h: 200 }, [255, 255, 255], 4);
    check('kenar: dışında ızgarasız saf BEYAZ zemin', voidN >= 8000, `${voidN} px (limit 8000)`);

    // c) Yassılaşma: duvara basan hücrede gövde kenara DEK (düz şerit) boyanır.
    //    Yay (tangent) olsaydı şerit boş kalırdı — merkez r/3 içeride clamp
    //    + kontur duvara kırpılıyor (agar.io-clone regulatePoint modeli).
    //    Şerit y+40: isim hücre İÇİNDE ortalanır (font≈34px) → şerit ismin ALTINDA.
    const strip = { x: bx - 6, y: pScr.y + 40, w: 6, h: 8 };
    const bodyN = countPixels(pngW, strip, [34, 211, 238], 60);
    check(
      'kenar: hücre duvara bastığında YASSILAŞTI (gövde şeridi)',
      bodyN >= 8,
      `${bodyN} px (limit 8, strip x=${strip.x.toFixed(0)} y=${strip.y.toFixed(0)} player=${pScr.x.toFixed(0)})`,
    );
  }

  // --- 14) HAVUZ REGRESYONU (starvation) — DİKKAT: SUİTİN SONU ---
  // Bu blok sahneyi KASITLI olarak bozar (40 yem yedirir, saha 40 yemle
  // dolar, mass +400). Bu yüzden EN SONDA çalışır: ara sahne ondan sonra
  // ölçüm yapmaz. Önceki denemede 8c'den önce çalışınca oyuncu mass'ı
  // sızıyordu → bot av yerine KAÇIYORdu (dot<0) ve kenar testi tutmuyordu.
  //
  // Mevcut 'POOF: parçacıklar söndü' kontrolü bu hatayı yakalayamaz: test
  // sahnesi oyuncunun çevresini temizlediği (clear_near_player) gerçek
  // tetikleyici — ölüm saçılma halkasının tek adımda çözdürdüğü 40+ yem —
  // hiç oluşmuyor. OYUNDA tetikleyici: saçılma halkası + 60 botun kendi
  // yemleri. Sonuç: havuz tavanı aşıyor ve (take() aktif slotu ezdiği için)
  // parçacıklar HİÇ ölmüyor → yutma/ölüm/level-up geri bildirimi boğuluyor.
  {
    const pB = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    // 40 yem tam oyuncu üstüne → pull + çözülme tek pencerede toplu
    await page.evaluate(
      ([px, py, n]) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          window.test_spawn_food(px + Math.cos(a) * 25, py + Math.sin(a) * 25);
        }
      },
      [pB.player.x, pB.player.y, 40],
    );
    await page.evaluate(() => window.advanceTime(600));
    const sFlood = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const floodD = sFlood.player.foodEaten - pB.player.foodEaten;
    check(
      'havuz: toplu yem fırtınasında kapasite aşılmaz (görsel bütçe)',
      floodD >= 20 && sFlood.particles.alive <= sFlood.particles.cap,
      `yemΔ=${floodD} alive=${sFlood.particles.alive}/${sFlood.particles.cap}`,
    );
    // Fırtına bitti: yemler temizlenir, beklenir → havuz BOŞALMALI
    // (botlar yemeye devam eder ama bot yemesi artık parçacık basmıyor).
    await page.evaluate(() => window.test_clear_near_player(900));
    await page.evaluate(() => window.advanceTime(1500));
    const sDrain = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const kindsDrain = await page.evaluate(() => window.test_particle_kinds());
    check(
      'havuz: fırtınadan sonra tamamen boşalır (açlık/starvation yok)',
      sDrain.particles.alive <= 4 && kindsDrain.dot <= 4 && kindsDrain.glow <= 4,
      `alive=${sDrain.particles.alive} tur=${JSON.stringify(kindsDrain)}`,
    );
  }

  // --- 15) EFEKTLER: YUTMA / BÖLÜNME / AURA / ATIŞ ---
  // Satın alınmış 4 efketin GERÇEKTEN çalıştığını kanıtlar. Ölçülebilir
  // olan her şey sayıyla: imza katmanı (garantili), parçacık havuzu tür
  // kırılımı ve aura için piksel FARKI (açık/kapalı karşılaştırması).
  {
    const CAP0 = JSON.parse(await page.evaluate(() => window.render_game_to_text())).particles.cap;

    // Ortak temizlik: tüm efektler düş, havuz ve imza katmanı boş
    const fxReset = async () => {
      await page.evaluate(() => window.test_set_effect('none'));
      await page.evaluate(() => window.test_clear_particles(0, 0, 1e9));
      await page.evaluate(() => window.test_impact_count(true));
      await parkAll(page, -1);
    };
    const kinds = () => page.evaluate(() => window.test_particle_kinds());
    const impacts = (reset) => page.evaluate((r) => window.test_impact_count(r), !!reset);
    const total = (k) => k.dot + k.ring + k.spark + k.glyph + k.glow;

    // ---------------------------------------------------------------------
    // (A) BÖLÜNME — Sonic Boom: bölünme anında imza katmanı tetiklenir
    // ---------------------------------------------------------------------
    await fxReset();
    await page.evaluate(() => window.test_set_effect('fx-sonic'));
    await page.evaluate(() => window.test_set_mass('player', 900));
    await page.evaluate(() => window.advanceTime(500)); // radius ease
    await page.evaluate(() => window.test_clear_particles(0, 0, 1e9));
    const sonicBefore = await impacts(false);
    await page.keyboard.press('Space');
    await page.evaluate(() => window.advanceTime(40));
    const sonicAfter = await impacts(false);
    check(
      'efekt/BÖLÜNME: sonic kuşanılınca imza katmanı tetiklenir (havuzdan bağımsız)',
      sonicBefore === 0 && sonicAfter >= 1,
      `önce=${sonicBefore} bölünme sonrası=${sonicAfter}`,
    );
    // Ömür bitince katman BOŞALMALI (sızıntı yok — sürekli dolan imza yığılır)
    await page.evaluate(() => window.advanceTime(1200));
    const sonicAfter2 = await impacts(false);
    check(
      'efekt/BÖLÜNME: imza ömrü dolunca katman boşalır (birikme/sızıntı yok)',
      sonicAfter2 === 0,
      `kalan=${sonicAfter2}`,
    );

    // ---------------------------------------------------------------------
    // (B) YUTMA — Şok Dalgası + HAVUZ BAĞIMSIZLIK GARANTİSİ
    //   Havuz oyunun ortak kaynağı; büyük oyuncu durduğunda yem fırtınası
    //   onu dolduruyor. Satın alınmış imza efekti o karede EZİLMEMELİ.
    // ---------------------------------------------------------------------
    await fxReset();
    await page.evaluate(() => window.test_set_effect('fx-shockwave'));
    // 1) Havuzu bilerek DOLDUR: oyuncunun üstüne 90 yem bırak (hepsi yenir)
    await page.evaluate(() => {
      const s = JSON.parse(window.render_game_to_text());
      for (let i = 0; i < 140; i++) {
        const a = (i / 140) * Math.PI * 2;
        const r = 40 + (i % 5) * 30;
        window.test_spawn_food(s.player.x + Math.cos(a) * r, s.player.y + Math.sin(a) * r);
      }
    });
    // NOT: yem teması ANINDA yutulmaz — 150ms'lik çekiliş vardır
    // (theme.animation.collectPullSec). 120ms'de havuz hiç dolmuyordu.
    await page.evaluate(() => window.advanceTime(400));
    const busy = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    // 2) Yutma sahnesi: büyük oyuncu küçük botu yer
    const FX_SX = 4700;
    const FX_SY = 4700;
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [FX_SX, FX_SY]);
    await page.evaluate(() => window.advanceTime(1200)); // kamera yerleşsin
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [FX_SX, FX_SY]);
    await page.evaluate(([i, x, y]) => window.test_set_bot_pos(i, x, y), [0, FX_SX, FX_SY]);
    await page.evaluate(() => window.test_set_mass('player', 1600));
    await page.evaluate(() => window.test_set_mass(0, 100));
    await page.evaluate(() => window.test_reset_pulls());
    await page.evaluate(() => window.test_impact_count(true));
    await page.evaluate(() => window.test_set_combat(true));
    await page.evaluate(() => window.advanceTime(120));
    const shock = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const shockImpact = await impacts(false);
    await page.evaluate(() => window.test_set_combat(false));
    check(
      'efekt/YUTMA: yutma anında şok dalgası tetiklenir (kurban ölçeğinde)',
      shock.player.mass > 1600 && shockImpact >= 1,
      `mass=${shock.player.mass} (>1600 → yutuldu) imza=${shockImpact}`,
    );
    check(
      'efekt/YUTMA: havuz doysa bile imza efekti EZİLMEZ (garantili katman)',
      busy.particles.alive > 60 && shockImpact >= 1 && shock.particles.cap === CAP0,
      `yutma anı havuz=${shock.particles.alive}/${shock.particles.cap} imza=${shockImpact} (önceden dolduruldu: ${busy.particles.alive})`,
    );

    // ---------------------------------------------------------------------
    // (C) AURA — Yörünge: parçacık HAVUZUNU KULLANMAZ + ekranda çizilir
    //   Sürekli açık bir efekt havuzu kirletirse yutma/ölüm geri bildirimi
    //   boğulur. Ölçüm: aura açıkken havuz tamamen boş kalmalı.
    // ---------------------------------------------------------------------
    await fxReset();
    await page.evaluate(() => window.test_set_effect('fx-orbiters'));
    await page.evaluate(() => window.test_set_mass('player', 1200));
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [6000, 6000]);
    await page.evaluate(() => window.advanceTime(1200)); // kamera yerleşsin
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [6000, 6000]);
    await page.evaluate(() => window.test_set_mass('player', 1200));
    // ÖNCE yemi kaldır: duran büyük oyuncu çevresindeki yemleri yiyip POOF
    // bırakıyordu ve "havuz temiz" ölçümünü kendisi bozuyordu.
    await page.evaluate(() => window.test_clear_near_player(900));
    await page.evaluate(() => window.advanceTime(300));
    await page.evaluate(() => window.test_clear_near_player(900));
    await page.evaluate(() => window.test_clear_particles(0, 0, 1e9));
    await page.evaluate(() => window.test_impact_count(true));
    await page.evaluate(() => window.advanceTime(250));
    const auraKinds = await kinds();
    check(
      'efekt/AURA: sürekli açık aura parçacık havuzunu KİRLETMEZ',
      total(auraKinds) === 0 && (await impacts(false)) === 0,
      `havuz=${JSON.stringify(auraKinds)} imza=${await impacts(false)}`,
    );

    // Piksel KANITI: aura kapalı vs açık aynı karede — yörünge bandında
    // belirgin fark olmalı. Bant hücre DIŞINDA (yörüngeler hücreyi sarar).
    const auraRect = { x: 640 - 300, y: 360 - 300, w: 600, h: 600 };
    const shotPath = (n) => join(SHOT_DIR, n + '.png');
    // OFF
    await page.evaluate(() => window.test_set_effect('none'));
    await page.evaluate(() => window.test_clear_particles(0, 0, 1e9));
    await page.screenshot({ path: shotPath('fx-aura-off') });
    // ON — arada zaman İLERLETMİYORUZ (hücre jelly'si kaymasın)
    await page.evaluate(() => window.test_set_effect('fx-orbiters'));
    await page.evaluate(() => window.test_clear_particles(0, 0, 1e9));
    await page.screenshot({ path: shotPath('fx-aura-on') });
    const imgOff = decodePNG(readFileSync(shotPath('fx-aura-off')));
    const imgOn = decodePNG(readFileSync(shotPath('fx-aura-on')));
    let diff = 0;
    for (let y = auraRect.y; y < auraRect.y + auraRect.h; y++) {
      for (let x = auraRect.x; x < auraRect.x + auraRect.w; x++) {
        const xi = Math.round(x);
        const yi = Math.round(y);
        if (xi < 0 || yi < 0 || xi >= imgOff.w || yi >= imgOff.h) continue;
        const i = (yi * imgOff.w + xi) * imgOff.bpp;
        // Güçlü fark eşiği: kenar kayması (jel) ince fark verir, aura kalın
        // renk bantları verir → yalnız "belirgin fark" sayılır.
        const d =
          Math.abs(imgOff.data[i] - imgOn.data[i]) +
          Math.abs(imgOff.data[i + 1] - imgOn.data[i + 1]) +
          Math.abs(imgOff.data[i + 2] - imgOn.data[i + 2]);
        if (d > 60) diff++;
      }
    }
    check(
      'efekt/AURA: yörünge + gezegenler hücre dışında çizilir (piksel farkı)',
      diff > 1200,
      `açık/kapalı belirgin piksel farkı=${diff} (eşik 1200)`,
    );

    // ---------------------------------------------------------------------
    // (D) ATIŞ — Alev Topu: namlu + uçuş izi havuza düşer, sonra TEMİZLENİR
    // ---------------------------------------------------------------------
    await fxReset();
    await page.evaluate(() => window.test_set_effect('fx-firepellets'));
    await page.evaluate(() => window.test_set_mass('player', 900));
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [6000, 6000]);
    await page.evaluate(() => window.advanceTime(1200));
    await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [6000, 6000]);
    await page.evaluate(() => window.test_set_mass('player', 900));
    await page.evaluate(() => window.test_clear_particles(0, 0, 1e9));
    await page.mouse.move(640, 640); // namlu aşağıya baksın
    await page.keyboard.press('KeyW');
    await page.evaluate(() => window.advanceTime(80));
    const fireK = await kinds();
    check(
      'efekt/ATIŞ: namlu konisi + ateş izi parçacık havuzuna düşer',
      fireK.spark >= 4 && fireK.glow >= 2,
      `spark=${fireK.spark} glow=${fireK.glow} dot=${fireK.dot}`,
    );
    // Pelletin yere düşmesi bekleniyor: iz SIZINTISI olmamalı.
    // Yalnız ateşe ÖZEL türler denetlenir (spark, glow): `dot`/`ring` yem
    // POOF'unun ORTAK kanalıdır — duran oyuncu 3 sn'de yem yiyip 12 dot
    // bırakıyor ve test kendi ölçümünü bozuyordu.
    await page.evaluate(() => window.advanceTime(3000));
    const fireK2 = await kinds();
    check(
      'efekt/ATIŞ: yere düşen pellet izi bırakmaz (ateş türleri sıfırlanır)',
      fireK2.spark === 0 && fireK2.glow === 0,
      `ateş türleri: spark=${fireK2.spark} glow=${fireK2.glow} | (yem POOF kanalı: dot=${fireK2.dot} ring=${fireK2.ring})`,
    );

    // ---------------------------------------------------------------------
    // (E) SLOT BAĞIMSIZLIĞI + KAPASİTE DEĞİŞMEZ
    // ---------------------------------------------------------------------
    await fxReset();
    const allOn = await page.evaluate(() => {
      window.test_set_effect('none');
      const ok = ['fx-sonic', 'fx-shockwave', 'fx-orbiters', 'fx-firepellets'].map((id) =>
        window.test_set_effect(id),
      );
      return ok.every(Boolean);
    });
    await page.evaluate(() => window.test_set_mass('player', 900));
    await page.evaluate(() => window.advanceTime(400));
    await page.evaluate(() => window.test_clear_particles(0, 0, 1e9));
    await page.evaluate(() => window.test_impact_count(true));
    await page.keyboard.press('Space');
    await page.evaluate(() => window.advanceTime(40));
    const allImpact = await impacts(false);
    const allState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    check(
      'efekt: 5 slot bağımsız — 4 efekt aynı anda kuşanılır, kapasite sabit',
      allOn && allImpact === 1 && allState.particles.cap === CAP0,
      `dördü=${allOn} tek bölünme=${allImpact} imza (beklenen 1) cap=${allState.particles.cap} (başlangıç ${CAP0})`,
    );
  }

  // --- 16) Konsol hataları ---
  check('konsol hatası yok', results.errors.length === 0, results.errors.join(' | ') || ' temiz');

  // --- Sonuç ---
  const failed = results.checks.filter((c) => !c.ok);
  console.log(`\n=== ÖZET: ${results.checks.length - failed.length}/${results.checks.length} geçti ===`);
  if (failed.length) {
    console.log('Başarısız:', JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
} catch (err) {
  console.error('TEST HATASI:', err);
  try {
    await page.screenshot({ path: join(SHOT_DIR, '99-error.png') });
  } catch {}
  process.exitCode = 1;
} finally {
  await browser.close();
}
