// Dev helper: drive the game in Chromium and capture screenshots of key situations.
// Usage: bun scripts/play.mjs <outDir> [scenario ...] [--size=1000x800] [--dpr=1] [--base=http://localhost:5180]
// Needs `bun x vite --port 5180 --strictPort` running. Scenarios: see SCENARIOS below.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => (args.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${def}`).split('=')[1];
const [outDir, ...names] = args.filter((a) => !a.startsWith('--'));
const [w, h] = opt('size', '1000x800').split('x').map(Number);
const dpr = Number(opt('dpr', '1'));
const base = opt('base', 'http://localhost:5180');
mkdirSync(outDir, { recursive: true });

const phase = (page) => page.evaluate(() => window.__twinjokers.view().phase);
const waitIdle = (page, ms = 6000) =>
  page.waitForFunction(() => window.__twinjokers.app.settled, null, { timeout: ms }).catch(() => undefined);

/** step: {banner: 'TEXT'} waits until that banner shows (then +350ms). string key | number (ms wait) | {shot} | {idle} | {until: phase} */
const SCENARIOS = {
  idle: { url: '/?seed=7', steps: [1200, { shot: 'idle' }] },
  betting: { url: '/?seed=7', steps: ['b', 'b', 'b', 600, { shot: 'betting' }] },
  dealing: { url: '/?scene=win', steps: [1100, { shot: 'dealing-a' }, 450, { shot: 'dealing-b' }, { idle: 1 }, 400, { shot: 'win' }] },
  doubleselect: { url: '/?scene=win', steps: [{ idle: 1 }, 2200, { shot: 'double-select' }] },
  standard: { url: '/?scene=standard', steps: [{ idle: 1 }, 1000, { shot: 'standard-pick' }, '3', 700, { shot: 'standard-flip' }, { idle: 1 }, { shot: 'standard-result' }] },
  redblack: { url: '/?scene=redblack', steps: [{ idle: 1 }, 1000, { shot: 'redblack-pick' }, '2', { idle: 1 }, { shot: 'redblack-result' }] },
  highlow: { url: '/?scene=highlow', steps: [{ idle: 1 }, 1000, { shot: 'highlow-start' }, 'ArrowUp', 700, { shot: 'highlow-step' }, { idle: 1 }, { shot: 'highlow-after' }] },
  freegame: { url: '/?scene=freegame', steps: [{ banner: 'FREE GAME' }, { shot: 'freegame-banner' }, { idle: 1 }, { shot: 'freegame-start' }, { idle: 1 }, 2500, { shot: 'freegame-running' }] },
  jackpot: { url: '/?scene=jackpot', steps: [{ banner: 'JACKPOT!' }, { shot: 'jackpot' }, 600, { shot: 'jackpot-b' }] },
  lose: { url: '/?scene=highlow', steps: [{ idle: 1 }, 1000, 'ArrowDown', 1000, { shot: 'highlow-1' }, { idle: 1 }, 'ArrowDown', { idle: 1 }, 'ArrowDown', { idle: 1 }, 'ArrowUp', { idle: 1 }, 'ArrowUp', 900, { shot: 'highlow-late' }] },
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const name of names.length ? names : Object.keys(SCENARIOS)) {
  const sc = SCENARIOS[name];
  if (!sc) { console.log('unknown scenario', name); continue; }
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, hasTouch: opt('touch', '0') === '1' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + sc.url);
  await page.waitForFunction(() => window.__twinjokers, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  for (const step of sc.steps) {
    if (typeof step === 'number') await page.waitForTimeout(step);
    else if (typeof step === 'string') await page.keyboard.press(step);
    else if (step.shot) await page.screenshot({ path: `${outDir}/${opt('prefix', '')}${step.shot}.png` });
    else if (step.banner) {
      await page.waitForFunction((t) => window.__twinjokers.app.bannerText === t, step.banner, { timeout: 12000, polling: 50 }).catch(() => console.log('banner not seen', step.banner));
      await page.waitForTimeout(350);
    } else if (step.idle) await waitIdle(page);
  }
  console.log(name, 'phase', await phase(page), errors.length ? errors : 'no errors');
  await ctx.close();
}
await browser.close();
