// E2E smoke: boots the dev server, lets the bot play ~20 s (plus key mashing and resizes),
// fails on any console error / page error or if CREDITS never change. Run: bun run smoke
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 5191;
const server = spawn('bun', ['x', 'vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('dev server did not start');
}

let failed = false;
try {
  await waitForServer();
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/?autoplay=1&seed=3`);
  await page.waitForFunction(() => window.__twinjokers, null, { timeout: 20000 });
  const seen = new Set();
  const sample = async () => seen.add(await page.evaluate(() => window.__twinjokers.view().credits));
  const t0 = Date.now();
  let phase = 0;
  while (Date.now() - t0 < 20000) {
    await page.waitForTimeout(500);
    await sample();
    const s = (Date.now() - t0) / 1000;
    if (s > 8 && phase === 0) { phase = 1; await page.setViewportSize({ width: 390, height: 844 }); } // resize mid-animation
    if (s > 12 && phase === 1) {
      phase = 2;
      for (let i = 0; i < 60; i++) await page.keyboard.press(['1', '2', '3', '4', '5', 'b', 'm', 'c', 'a', ' ', 'ArrowUp', 'ArrowDown'][i % 12]);
      await page.setViewportSize({ width: 1100, height: 600 });
    }
  }
  const view = await page.evaluate(() => window.__twinjokers.view());
  console.log('credits seen:', [...seen].slice(0, 12).join(', '), '... phase', view.phase);
  if (seen.size < 2) { console.error('FAIL: credits never changed'); failed = true; }
  if (errors.length) { console.error('FAIL: console/page errors:\n' + errors.join('\n')); failed = true; }
  await browser.close();
} catch (e) {
  console.error('FAIL:', e);
  failed = true;
} finally {
  stop();
}
if (!failed) console.log('smoke OK');
process.exit(failed ? 1 : 0);
