// Teşhis: §13 kenar/void/şerit pikselleri neden 0? Satır taraması + payload.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';

const URL = 'http://localhost:5173';
const SHOT_DIR = join(process.cwd(), 'test', 'shots');

function decodePNG(path) {
  const buf = readFileSync(path);
  // minimal PNG decode (test/visual-test.mjs'teki ile aynı prensip)
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
  const raw = Buffer.concat(idat);
  const un = zlib.inflateSync(raw);
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
  const i = (y * img.w + x) * img.bpp;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE ERR:', m.text()));
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.render_game_to_text === 'function');
await page.evaluate(() => window.test_set_combat(false));

// §13 ile AYNI sahneleme
await page.evaluate(() => window.test_clear_near_player(400));
const s = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
console.log('before stage:', JSON.stringify({ p: { x: s.player.x | 0, y: s.player.y | 0, r: s.player.r, m: s.player.mass }, cam: { x: s.camera.x | 0, y: s.camera.y | 0, z: +s.camera.zoom.toFixed(3) }, flash: s.flash, shield: s.player.shieldT }));
const wallX = s.world.w - s.player.r * 0.6;
await page.evaluate(([x, y]) => window.test_set_player_pos(x, y), [wallX, 2500]);
await page.evaluate(() => window.test_set_shield('player', 0));
await page.mouse.move(1270, 360);
await page.evaluate(() => window.advanceTime(1400));
const b = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
console.log('after:', JSON.stringify({ p: { x: +b.player.x.toFixed(1), y: +b.player.y.toFixed(1), r: b.player.r, m: b.player.mass }, cam: { x: +b.camera.x.toFixed(1), y: +b.camera.y.toFixed(1), z: +b.camera.zoom.toFixed(3) }, flash: b.flash, vw: b.viewportW, vh: b.viewportH, dpr: b.dpr }));

const bx = (b.world.w - b.camera.x) * b.camera.zoom + b.viewportW / 2;
const py = (b.player.y - b.camera.y) * b.camera.zoom + b.viewportH / 2;
const pxp = (b.player.x - b.camera.x) * b.camera.zoom + b.viewportW / 2;
console.log(`bx=${bx.toFixed(1)} playerScreen=(${pxp.toFixed(1)},${py.toFixed(1)})`);

await page.screenshot({ path: join(SHOT_DIR, 'diag-edge.png') });
const img = decodePNG(join(SHOT_DIR, 'diag-edge.png'));
console.log(`png ${img.w}x${img.h} bpp=${img.bpp}`);

console.log('--- yatay tarama y=150, x=600..760 (her 8px) ---');
let line = [];
for (let x = 600; x <= 760; x += 8) line.push(`${x}:${px(img, x, 150).join(',')}`);
console.log(line.join('  '));
console.log('--- yatay tarama y=360, x=600..760 (her 8px) ---');
line = [];
for (let x = 600; x <= 760; x += 8) line.push(`${x}:${px(img, x, 360).join(',')}`);
console.log(line.join('  '));
console.log('--- kenar bölgesi y=150, x=bx-8..bx+8 ---');
line = [];
for (let x = Math.round(bx) - 8; x <= Math.round(bx) + 8; x++) line.push(`${x}:${px(img, x, 150).join(',')}`);
console.log(line.join('  '));
console.log('--- void örneği (bx+30, y=150):', px(img, Math.round(bx) + 30, 150).join(','));
console.log('--- şerit örnekleri player yakını y=py+14..20, x=bx-6..bx-1 ---');
for (let y = Math.round(py) + 14; y <= Math.round(py) + 20; y++) {
  line = [];
  for (let x = Math.round(bx) - 6; x <= Math.round(bx) - 1; x++) line.push(`${x}:${px(img, x, y).join(',')}`);
  console.log(`y=${y}: ` + line.join(' '));
}
console.log('--- ekran köşeleri: (0,0)=', px(img, 0, 0).join(','), ' (1279,719)=', px(img, 1279, 719).join(','), ' (900,150)=', px(img, 900, 150).join(','));
await browser.close();
