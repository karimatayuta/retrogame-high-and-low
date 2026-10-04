/** Dev-only parts gallery: open /gallery.html with `bun run dev`. */
import { Application, Container, Graphics, Sprite, Ticker } from 'pixi.js';
import { HAND_RANKS, PAY_LINES, FREE_GAME_TRIGGERS, HIGH_LOW_BONUSES, DOUBLE_DOWN_MENU_ITEMS } from '@/domain/enums';
import { PALETTE, PALETTE_LIST } from '@/presentation/palette';
import { applyPixelArtDefaults, createNumberText, createText } from '@/presentation/pixelFont';
import { createCardTextures, CARD_H, CARD_W, HIGHLIGHT_PAD } from '@/presentation/cardArt';
import { createCrtFilters, setCrtEnabled } from '@/presentation/crt';
import { createSoundBoard, SFX_NAMES } from '@/presentation/sound';
import { SUITS } from '@/domain/cards';

applyPixelArtDefaults();
const DPR = Math.max(1, Math.round(window.devicePixelRatio || 1));

async function makeApp(host: HTMLElement, logicalW: number, logicalH: number): Promise<{ app: Application; stage: Container }> {
  const app = new Application();
  await app.init({
    width: logicalW * 2,
    height: logicalH * 2,
    background: PALETTE.BG,
    antialias: false,
    resolution: DPR,
    autoDensity: true,
    roundPixels: true,
  });
  host.appendChild(app.canvas);
  const stage = new Container();
  stage.scale.set(2);
  app.stage.addChild(stage);
  return { app, stage };
}

async function catalog(): Promise<void> {
  const { app, stage } = await makeApp(document.getElementById('catalog') as HTMLElement, 640, 420);
  const cards = createCardTextures(app.renderer);
  // palette
  PALETTE_LIST.forEach(([name, color], i) => {
    const g = new Graphics().rect(0, 0, 18, 12).fill(color);
    g.position.set(4 + i * 39, 4);
    stage.addChild(g);
    const t = createText(name, { color: PALETTE.CARD_FACE });
    t.position.set(4 + i * 39, 18);
    // labels are long: show first 6 chars
    t.setText(name.slice(0, 9));
    stage.addChild(t);
  });
  // font
  const lines = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789',
    "& / . , : ! ? - + × ' * ♠ ♥ ♦ ♣",
    ...HAND_RANKS.slice(0, 5),
    PAY_LINES[3] as string,
    FREE_GAME_TRIGGERS.join('  '),
    HIGH_LOW_BONUSES.slice(0, 4).join('  '),
    DOUBLE_DOWN_MENU_ITEMS.join('  '),
  ];
  let y = 36;
  lines.forEach((l, i) => {
    const t = createText(l, { color: i % 2 ? PALETTE.TEXT : PALETTE.GOLD, shadow: true });
    t.position.set(4, y);
    stage.addChild(t);
    y += 7;
  });
  const big = createText('FREE GAME  JACKPOT  WIN 1234', { color: PALETTE.GOLD, scale: 2, shadow: true });
  big.position.set(4, y + 2);
  stage.addChild(big);
  // cards
  const top = 124;
  SUITS.forEach((suit, row) => {
    for (let rank = 2; rank <= 14; rank++) {
      const s = new Sprite(cards.face({ kind: 'normal', rank: rank as 2, suit }));
      s.position.set(4 + (rank - 2) * 49, top + row * 64);
      stage.addChild(s);
    }
  });
  const rowY = top + 4 * 64;
  const extras = [cards.face({ kind: 'joker', id: 1 }), cards.face({ kind: 'joker', id: 2 }), cards.back];
  extras.forEach((tx, i) => {
    const s = new Sprite(tx);
    s.position.set(4 + i * 49, rowY);
    stage.addChild(s);
  });
  const sel = new Sprite(cards.face({ kind: 'normal', rank: 14, suit: 'S' }));
  sel.position.set(4 + 3 * 49, rowY);
  const hl = new Sprite(cards.highlight);
  hl.position.set(sel.x - HIGHLIGHT_PAD, sel.y - HIGHLIGHT_PAD);
  stage.addChild(sel, hl);
}

async function mock(): Promise<void> {
  const { app, stage } = await makeApp(document.getElementById('mock') as HTMLElement, 320, 240);
  const bloomOn = (document.getElementById('bloom') as HTMLInputElement).checked;
  const cards = createCardTextures(app.renderer);
  stage.addChild(new Graphics().rect(0, 0, 320, 240).fill(PALETTE.FELT_DARK));
  stage.addChild(new Graphics().rect(0, 0, 320, 14).fill(PALETTE.NAVY));
  const title = createText('FREE DEAL TWIN JOKERS', { color: PALETTE.GOLD, shadow: true });
  title.position.set(8, 4);
  stage.addChild(title);
  const hand = [
    { kind: 'normal', rank: 14, suit: 'S' },
    { kind: 'joker', id: 1 },
    { kind: 'normal', rank: 12, suit: 'H' },
    { kind: 'normal', rank: 7, suit: 'D' },
    { kind: 'normal', rank: 10, suit: 'C' },
  ] as const;
  hand.forEach((c, i) => {
    const s = new Sprite(cards.face(c));
    s.position.set(14 + i * 58, 60);
    stage.addChild(s);
    if (i === 1 || i === 2) {
      const hl = new Sprite(cards.highlight);
      hl.position.set(s.x - HIGHLIGHT_PAD, s.y - HIGHLIGHT_PAD);
      stage.addChild(hl);
      const h = createText('HOLD', { color: PALETTE.GOLD, shadow: true, align: 'center' });
      h.position.set(s.x + CARD_W / 2, s.y + CARD_H + 4);
      stage.addChild(h);
    }
  });
  const win = createText('JOKER ANYTHING', { color: PALETTE.CYAN, shadow: true, scale: 2, align: 'center' });
  win.position.set(160, 140);
  stage.addChild(win);
  const lbl = (t: string, x: number, y: number, color: number): void => {
    const s = createText(t, { color, shadow: true });
    s.position.set(x, y);
    stage.addChild(s);
  };
  lbl('CREDITS', 8, 226, PALETTE.TEXT);
  lbl('BET', 130, 226, PALETTE.TEXT);
  lbl('WIN', 220, 226, PALETTE.GOLD);
  const credits = createNumberText(0, { color: PALETTE.CARD_FACE, scale: 1, shadow: true });
  credits.position.set(70, 226);
  stage.addChild(credits);
  const crt = createCrtFilters({ bloom: bloomOn });
  setCrtEnabled(stage, true, crt);
  (document.getElementById('crt') as HTMLInputElement).addEventListener('change', (e) => {
    setCrtEnabled(stage, (e.target as HTMLInputElement).checked);
  });
  let n = 0;
  app.ticker.add((t: Ticker) => {
    crt.update(t.deltaMS);
    n += t.deltaMS * 0.05;
    credits.setValue(Math.floor(n));
  });
}

function sounds(): void {
  const board = createSoundBoard();
  const host = document.getElementById('sounds') as HTMLElement;
  for (const name of SFX_NAMES) {
    const b = document.createElement('button');
    b.textContent = name;
    b.addEventListener('click', () => {
      board.unlock();
      board.play(name);
    });
    host.appendChild(b);
  }
  (document.getElementById('mute') as HTMLInputElement).addEventListener('change', (e) => board.setMuted((e.target as HTMLInputElement).checked));
}

void catalog();
void mock();
sounds();
