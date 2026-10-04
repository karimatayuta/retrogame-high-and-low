// PWA check: load the production preview, go offline, reload, and make sure the game still boots.
// Usage: bun run pwa:check   (builds, starts `vite preview` itself with --serve)
//        bun scripts/offline-check.mjs [url]   (against an already running preview)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const serve = process.argv.includes('--serve');
const url = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'http://localhost:5192/';
const server = serve ? spawn('bun', ['x', 'vite', 'preview', '--port', '5192', '--strictPort'], { stdio: 'ignore' }) : null;
process.on('exit', () => server?.kill());
for (let i = 0; serve && i < 100; i++) {
  try { if ((await fetch(url)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200));
}
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // let the SW control the page
await page.waitForTimeout(1000);
await context.setOffline(true);
await page.reload();
await page.waitForTimeout(2000);
const booted = await page.evaluate(() => !!document.querySelector('canvas') && !document.getElementById('boot'));
const manifest = await page.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href') ?? null);
await browser.close();
console.log(JSON.stringify({ booted, manifest, errors }));
process.exit(!booted || !manifest || errors.length ? 1 : 0);
