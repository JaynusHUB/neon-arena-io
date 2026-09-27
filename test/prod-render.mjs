/**
 * test/prod-render.mjs — ÜRETİM DERLEMESİ DOGRULAMASI (regresyon koruması).
 *
 * Neden ayrı bir test: `test/visual-test.mjs` GELİŞTİRME sunucusuna bağlanır
 * (http://localhost:5173) ve orada `import.meta.env.DEV` **doğrudur** → test
 * kancaları kuruludur. Bu yüzden suite ÜRETİM yolunu hiç yürütmez.
 *
 * Gerçekte yaşanan hata: kancaları üretimde kapatırken oyun döngüsünün
 * başlatılması da yanlışlıkla kancaların içine taşındı. Prodüksiyonda kapı
 * o metodu atladı → `requestAnimationFrame(this.frame)` hiç çağrılmadı →
 * oyun DONU kaldı. HUD çalışıyordu, konsol temizdi, 108/108 test yeşildi;
 * yalnızca canvas BOŞTU. Ekran görüntüsü yakalayıp piksel saymadan görünmezdi.
 *
 * Bu betik `dist/`'i kendi sunucusunda açar, oyunu başlatır ve canvas'a
 * GERÇEKTEN piksel çizildiğini ölçer. Çalıştırmak için önce `npm run build`.
 *
 *   npm run test:prod
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = 4399;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ yok. Once `npm run build` calistir.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

/** dist/ dosyalarini sunar (SPA fallback: bilinmeyen yol -> index.html). */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  let file = path.join(DIST, url === '/' ? 'index.html' : url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html');
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => errors.push(`istek basarisiz: ${r.url()}`));

let fail = 0;
const ok = (name, cond, detail) => {
  if (!cond) fail++;
  console.log(`  ${cond ? 'GECTI' : 'DUSTU'}  ${name}${detail ? '  — ' + detail : ''}`);
};

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
  await page.fill('[data-start="name"]', 'PROD');
  await page.click('[data-start="play"]');
  await page.waitForSelector('[data-start="screen"]', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(1500);

  const hooks = await page.evaluate(() =>
    ['render_game_to_text', 'advanceTime', 'test_set_mass', 'test_spawn_food'].filter(
      (n) => typeof window[n] === 'function',
    ),
  );
  ok('uretimde test kancalari kapali', hooks.length === 0, hooks.join(', ') || '0 tane');

  // ASIL KORUMA: canvas gercekten cizim yapiyor mu? (dongu baslamadiysa 0)
  const px = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c || !c.width) return null;
    const off = document.createElement('canvas');
    off.width = c.width;
    off.height = c.height;
    const o = off.getContext('2d');
    o.drawImage(c, 0, 0);
    const d = o.getImageData(0, 0, off.width, off.height).data;
    let cyan = 0;
    let food = 0;
    let grid = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (b > 170 && g > 150 && r < 110) cyan++;
      else if (Math.max(r, g, b) - Math.min(r, g, b) > 90 && Math.max(r, g, b) > 150) food++;
      else if (r < 235 && r > 200) grid++;
    }
    return { cyan, food, grid };
  });
  ok('canvas oyuncu govdesi ciziyor', !!px && px.cyan > 3000, px ? `${px.cyan} px` : 'canvas yok');
  ok('canvas yem ciziyor', !!px && px.food > 500, px ? `${px.food} px` : '-');
  ok('canvas zemin ciziyor', !!px && px.grid > 1000, px ? `${px.grid} px` : '-');

  // Dongu ilerliyor mu: skor yem yemekle artar
  const s0 = await page.evaluate(() => document.querySelector('[data-hud="score"]')?.textContent?.trim());
  await page.mouse.move(1000, 250);
  await page.waitForTimeout(3000);
  const s1 = await page.evaluate(() => document.querySelector('[data-hud="score"]')?.textContent?.trim());
  ok('oyun dongusu ilerliyor (skor artti)', s0 !== s1, `${s0} -> ${s1}`);

  ok('konsol hatasi / basarisiz istek yok', errors.length === 0, errors.slice(0, 2).join(' | ') || 'temiz');
} catch (e) {
  console.error('  HATA:', e.message);
  fail++;
} finally {
  await browser.close();
  server.close();
}

console.log(fail === 0 ? '\nURETIM DERLEMESI SAGLIKLI' : `\n${fail} SORUN`);
process.exit(fail === 0 ? 0 : 1);
