/**
 * skin-lava-check.mjs — ADIM 11 entegrasyonu: Lav Topu skin'i kart + uygulama.
 * Tek seferlik doğrulama: menü kart görseli yüklüyor mu + seçim payload'a geçiyor mu.
 * Kullanım: node test/skin-lava-check.mjs (dev sunucu açıkken)
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOT = join(__dirname, 'shots', 'skin-menu-lava.png');
mkdirSync(join(__dirname, 'shots'), { recursive: true });

const URL = process.env.GAME_URL || 'http://localhost:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.fill('[data-start="name"]', 'TESTER');
await page.click('[data-start="play"]');
await page.waitForSelector('[data-start="screen"]', { state: 'detached', timeout: 3000 });

// Skin menüsü (K)
await page.keyboard.press('k');
await page.waitForSelector('text=Lav Topu', { timeout: 3000 });
// Tüm avatar görselleri TAMAMEN yüklensin (classic kartı div olduğu için img seç)
await page.waitForFunction(
  () => [...document.querySelectorAll('img.skin-avatar')].every((e) => e.complete),
  null,
  { timeout: 5000 },
);
await sleep(200);

// 1) Kart görselleri: her img.skin-avatar yüklendi mi (özellikle lava)
const imgs = await page.$$eval('img.skin-avatar', (els) =>
  els.map((e) => ({
    src: e.getAttribute('src'),
    ok: e.complete && e.naturalWidth > 0,
    w: e.naturalWidth,
  })),
);
const lava = imgs.find((i) => i.src === '/skins/lava.png');
const allOk = imgs.length > 0 && imgs.every((i) => i.ok);

await page.screenshot({ path: SHOT });

// 2) Lav Topu'nu seç → payload'a geçti mi (persist + state köprüsü)
await page.click('button:has-text("Lav Topu")');
await sleep(250);
const skin = await page.evaluate(() => JSON.parse(window.render_game_to_text()).skin);
await page.keyboard.press('Escape');

console.log(`kart görselleri: ${imgs.length} adet, tümü yüklü: ${allOk}`);
for (const i of imgs) console.log(`  ${i.ok ? 'OK ' : 'HATA'} ${i.src} ${i.w}px`);
console.log(`lava avatar: ${lava ? `${lava.src} → ${lava.w}px OK=${lava.ok}` : 'BULUNAMADI'}`);
console.log(`seçim sonrası payload skin: ${skin}`);
console.log(`konsol hatası: ${errors.length ? errors.join(' | ') : 'temiz'}`);
console.log(`shot: ${SHOT}`);

const pass = allOk && lava?.ok && skin === 'lava' && errors.length === 0;
console.log(`\n=== ${pass ? 'PASS' : 'FAIL'} — lav topu entegrasyonu ===`);

await browser.close();
process.exit(pass ? 0 : 1);
