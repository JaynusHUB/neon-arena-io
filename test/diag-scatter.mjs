// Teşhis: §11 saçılma yem pikseli neden 0 olabilir? Radial renk profili + sayım.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const URL = 'http://localhost:5173';
const SHOT_DIR = join(process.cwd(), 'test', 'shots');

function decodePNG(path) {
  const buf = readFileSync(path);
  let p = 8;
  let w = 0;
  let h = 0;
  let bpp = 4;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(p + 8);
      h = buf.readUInt32BE(p + 12);
      bpp = buf[p + 17] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(buf.subarray(p + 8, p + 8 + len));
    p += 12 + len;
    if (type === 'IEND') break;
  }
  const un = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let pos = 0;
  let prev = Buffer.alloc(stride);
  const paeth = (a, b, c) => {
    const pp = a + b - c;
    const pa = Math.abs(pp - a);
    const pb = Math.abs(pp - b);
    const pc = Math.abs(pp - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const filter = un[pos++];
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const v = un[pos + x];
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let r;
      if (filter === 0) r = v;
      else if (filter === 1) r = v + a;
      else if (filter === 2) r = v + b;
      else if (filter === 3) r = v + ((a + b) >> 1);
      else r = v + paeth(a, b, c);
      cur[x] = r & 255;
    }
    pos += stride;
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, bpp, data: out };
}

const px = (img, x, y) => {
  x = Math.max(0, Math.min(img.w - 1, Math.round(x)));
  y = Math.max(0, Math.min(img.h - 1, Math.round(y)));
  const i = (y * img.w + x) * img.bpp;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

function hslToRgb(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => window.test_set_combat(false));

// --- §11 sahneleme (test ile birebir) ---
const SX = 4700;
const SY = 4700;
const B = 0;
const PARK = [[300, 300], [700, 300], [1100, 300], [300, 700], [700, 700], [1100, 700], [300, 1100]];
let k = 0;
for (let i = 1; i < 8; i++) {
  await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [i, PARK[k][0], PARK[k][1]]);
  k++;
}
await page.evaluate(([idx, x, y]) => window.test_set_bot_pos(idx, x, y), [B, SX, SY]);
await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [SX, SY]);
await page.evaluate((m) => window.test_set_mass('player', m), 400);
await page.evaluate(([i, m]) => window.test_set_mass(i, m), [B, 100]);
await page.evaluate(([i, s]) => window.test_set_shield(i, s), [B, 0]);
await page.evaluate(() => window.test_reset_pulls());
await page.evaluate(() => window.test_clear_near_player(300));

const pre = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const aimX = Math.round((SX - pre.camera.x) * pre.camera.zoom + pre.viewportW / 2);
const aimY = Math.round((SY - pre.camera.y) * pre.camera.zoom + pre.viewportH / 2);
console.log(`aim=(${aimX},${aimY}) camPre=(${pre.camera.x.toFixed(0)},${pre.camera.y.toFixed(0)}) z=${pre.camera.zoom.toFixed(2)} flash=${pre.flash}`);
await page.mouse.move(aimX, aimY);

await page.evaluate(() => window.test_set_combat(true));
await page.evaluate(() => window.advanceTime(100));
await page.evaluate(() => window.test_set_combat(false));
const s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
console.log(`post: player=(${s.player.x.toFixed(0)},${s.player.y.toFixed(0)}) r=${s.player.r.toFixed(1)} mass=${s.player.mass} cam=(${s.camera.x.toFixed(0)},${s.camera.y.toFixed(0)}) z=${s.camera.zoom.toFixed(3)} flash=${s.flash} shield=${s.player.shieldT}`);

const ring = s.foods
  .map((f) => ({ f, d: Math.hypot(f.x - SX, f.y - SY) }))
  .filter(({ d }) => d >= 66 && d <= 150);
console.log(`halka yem sayısı=${ring.length}`);
for (const { f, d } of ring) {
  const fx = (f.x - s.camera.x) * s.camera.zoom + s.viewportW / 2;
  const fy = (f.y - s.camera.y) * s.camera.zoom + s.viewportH / 2;
  console.log(`  d=${d.toFixed(0)} hue=${f.hue} pull=${f.pull.toFixed(2)} ekran=(${fx.toFixed(0)},${fy.toFixed(0)}) beklenen=${hslToRgb(f.hue, 100, 50).join(',')}`);
}

await page.screenshot({ path: join(SHOT_DIR, 'diag-scatter.png') });
const IMG = decodePNG(join(SHOT_DIR, 'diag-scatter.png'));
for (const { f, d } of ring) {
  const fx = (f.x - s.camera.x) * s.camera.zoom + s.viewportW / 2;
  const fy = (f.y - s.camera.y) * s.camera.zoom + s.viewportH / 2;
  const rgb = hslToRgb(f.hue, 100, 50);
  let n = 0;
  const rr = f.r * s.camera.zoom + 6;
  for (let y = Math.floor(fy - rr) + 1; y < Math.ceil(fy + rr) - 1; y++) {
    for (let x = Math.floor(fx - rr) + 1; x < Math.ceil(fx + rr) - 1; x++) {
      const c = px(IMG, x, y);
      if (Math.abs(c[0] - rgb[0]) < 35 && Math.abs(c[1] - rgb[1]) < 35 && Math.abs(c[2] - rgb[2]) < 35) n++;
    }
  }
  console.log(`  SAYIM d=${d.toFixed(0)} hue=${f.hue}: ${n}px; merkez=${px(IMG, fx, fy).join(',')} beklenen=${rgb.join(',')}`);
}

// Radial profil: oyuncu merkezinden birkaç açıda renk (glow erişim mesafesi)
const csx = (s.player.x - s.camera.x) * s.camera.zoom + s.viewportW / 2;
const csy = (s.player.y - s.camera.y) * s.camera.zoom + s.viewportH / 2;
console.log(`oyuncu ekran=(${csx.toFixed(0)},${csy.toFixed(0)}) r_screen=${(s.player.r * s.camera.zoom).toFixed(1)}`);
for (const ang of [0.35, 1.2, 2.4, 4.0, 5.3]) {
  const parts = [];
  for (let d = 40; d <= 170; d += 13) {
    const sx = csx + Math.cos(ang) * d * s.camera.zoom;
    const sy = csy + Math.sin(ang) * d * s.camera.zoom;
    parts.push(`${d}:${px(IMG, sx, sy).join('/')}`);
  }
  console.log(`a=${ang}: ` + parts.join(' '));
}

// Tol35 ile hue eşleşmesi yapan toplam piksel (tüm halka, limit 20 testi)
let total = 0;
for (const { f, d } of ring) {
  const fx = (f.x - s.camera.x) * s.camera.zoom + s.viewportW / 2;
  const fy = (f.y - s.camera.y) * s.camera.zoom + s.viewportH / 2;
  const rgb = hslToRgb(f.hue, 100, 50);
  const rr = f.r * s.camera.zoom + 6;
  for (let y = Math.floor(fy - rr) + 1; y < Math.ceil(fy + rr) - 1; y++) {
    for (let x = Math.floor(fx - rr) + 1; x < Math.ceil(fx + rr) - 1; x++) {
      const c = px(IMG, x, y);
      if (Math.abs(c[0] - rgb[0]) < 35 && Math.abs(c[1] - rgb[1]) < 35 && Math.abs(c[2] - rgb[2]) < 35) total++;
    }
  }
}
console.log(`TOPLAM [85,150] filtresi yok, halka tamamı: ${total}px`);
await browser.close();
