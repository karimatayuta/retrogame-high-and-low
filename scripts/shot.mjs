// Dev helper: screenshot a page served by Vite. Usage: bun scripts/shot.mjs <url> <out.png> [waitMs] [w] [h]
import { chromium } from 'playwright';
const [url, out, wait = '1500', w = '1300', h = '1100'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
