/**
 * Screen geometry (320x240 logical pixels, Pyxel layout) and the responsive canvas math.
 * Pure: no Pixi, no DOM, so it is unit tested in Node.
 */
import { CARD_H, CARD_W } from '@/presentation/cardPixels';
import type { Action } from '@/presentation/input';

export const W = 320;
export const GAME_H = 240;
/** Logical height of the portrait (touch) layout: the game on top, a big button pad below. */
export const TALL_H = 400; // minimum / reference height of the portrait layout

export const CARD_GAP = 8;
export const CARDS_X0 = (W - (5 * CARD_W + 4 * CARD_GAP)) / 2;
export const CARDS_Y = 94;
export const HOLD_Y = CARDS_Y + CARD_H + 5;
export const HOLD_H = 11;
export const STRIP_Y = 221;
export const STRIP_H = 14;

export type LayoutMode = 'wide' | 'tall';

export const logicalHeight = (mode: LayoutMode): number => (mode === 'wide' ? GAME_H : TALL_H);

export const slotX = (i: number): number => CARDS_X0 + i * (CARD_W + CARD_GAP);

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export const holdRect = (i: number): Rect => ({ x: slotX(i), y: HOLD_Y, w: CARD_W, h: HOLD_H });

export const contains = (r: Rect, px: number, py: number): boolean =>
  px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;

/** One on-screen button. `dynamicLabel` buttons (DEAL) get their text from the view. */
export interface ButtonSpec extends Rect {
  readonly id: string;
  readonly label: string;
  readonly action: Action;
  /** Small utility button (never dimmed by game state). */
  readonly utility: boolean;
}

const hold = (n: number): Action => ({ kind: 'hold', n });

function row(
  y: number,
  h: number,
  gap: number,
  items: readonly { id: string; label: string; w: number; action: Action; utility?: boolean }[],
  x0?: number,
): ButtonSpec[] {
  const total = items.reduce((s, b) => s + b.w, 0) + gap * (items.length - 1);
  let x = x0 ?? Math.floor((W - total) / 2);
  return items.map((b) => {
    const spec: ButtonSpec = { id: b.id, label: b.label, x, y, w: b.w, h, action: b.action, utility: b.utility ?? false };
    x += b.w + gap;
    return spec;
  });
}

/** The strip at the bottom of the wide layout (the Pyxel button strip + small utilities). */
export function wideButtons(): readonly ButtonSpec[] {
  return row(STRIP_Y, STRIP_H, 2, [
    { id: 'bet', label: 'BET', w: 26, action: { kind: 'bet' } },
    { id: 'max', label: 'MAX', w: 26, action: { kind: 'maxBet' } },
    { id: 'deal', label: 'DEAL', w: 36, action: { kind: 'deal' } },
    ...[1, 2, 3, 4, 5].map((n) => ({ id: `hold${n}`, label: String(n), w: 16, action: hold(n) })),
    { id: 'collect', label: 'COLLECT', w: 42, action: { kind: 'collect' } },
    { id: 'add', label: '+MEDAL', w: 34, action: { kind: 'addMedals' } },
    { id: 'sound', label: 'SND', w: 20, action: { kind: 'mute' }, utility: true },
    { id: 'crt', label: 'CRT', w: 20, action: { kind: 'crt' }, utility: true },
  ]);
}

/** Lay out `weights.length` buttons across `totalW` starting at `x0` (widths proportional to the weights). */
function flexRow(
  x0: number,
  y: number,
  h: number,
  gap: number,
  totalW: number,
  items: readonly { id: string; label: string; weight: number; action: Action; utility?: boolean }[],
): ButtonSpec[] {
  const sum = items.reduce((t, i) => t + i.weight, 0);
  const avail = totalW - gap * (items.length - 1);
  let x = x0;
  return items.map((it, n) => {
    const w = n === items.length - 1 ? x0 + totalW - x : Math.floor((avail * it.weight) / sum);
    const spec: ButtonSpec = { id: it.id, label: it.label, x, y, w, h, action: it.action, utility: it.utility ?? false };
    x += w + gap;
    return spec;
  });
}

/** Vertical placement of the portrait stack: the game on top, the touch pad below, centred together. */
export function tallStack(logicalH: number): { gameY: number; padTop: number; padH: number } {
  const margin = 8;
  const gap = 12;
  const idealPad = 120 + 84 + 32 + 2 * 8;
  const padH = Math.max(120, Math.min(idealPad, logicalH - GAME_H - gap - margin * 2));
  const total = GAME_H + gap + padH;
  const gameY = Math.max(0, Math.floor((logicalH - total) / 2));
  return { gameY, padTop: gameY + GAME_H + gap, padH };
}

/**
 * The pad below the game in the portrait layout: big thumb-sized buttons that use the whole
 * width of the canvas.
 */
export function tallButtons(logicalW = W, logicalH = TALL_H): readonly ButtonSpec[] {
  const gap = 8;
  const { padTop, padH } = tallStack(logicalH);
  const smallH = Math.min(32, Math.max(22, Math.round(padH * 0.13)));
  const rem = padH - smallH - gap * 2;
  const holdH = Math.max(28, Math.min(120, Math.round(rem * 0.58)));
  const mainH = Math.max(28, Math.min(84, rem - holdH));
  const margin = 8;
  const y0 = padTop;
  const x0 = margin;
  const cw = logicalW - margin * 2;
  return [
    ...flexRow(x0, y0, holdH, gap, cw, [1, 2, 3, 4, 5].map((n) => ({ id: `hold${n}`, label: String(n), weight: 1, action: hold(n) }))),
    ...flexRow(x0, y0 + holdH + gap, mainH, gap, cw, [
      { id: 'bet', label: 'BET', weight: 68, action: { kind: 'bet' } },
      { id: 'max', label: 'MAX BET', weight: 74, action: { kind: 'maxBet' } },
      { id: 'deal', label: 'DEAL', weight: 82, action: { kind: 'deal' } },
      { id: 'collect', label: 'COLLECT', weight: 72, action: { kind: 'collect' } },
    ]),
    ...flexRow(x0, y0 + holdH + mainH + gap * 2, smallH, gap, cw, [
      { id: 'add', label: 'ADD MEDALS', weight: 108, action: { kind: 'addMedals' } },
      { id: 'sound', label: 'SOUND', weight: 80, action: { kind: 'mute' }, utility: true },
      { id: 'crt', label: 'CRT', weight: 60, action: { kind: 'crt' }, utility: true },
    ]),
  ];
}

export const buttonsFor = (fit: Pick<Fit, 'mode' | 'logicalW' | 'logicalH'>): readonly ButtonSpec[] =>
  fit.mode === 'wide' ? wideButtons() : tallButtons(fit.logicalW, fit.logicalH);

/** Something that can be pressed: a button, or the HOLD label under a card (= HOLD n). */
export interface HitTarget {
  readonly id: string;
  readonly rect: Rect;
  readonly action: Action;
}

export function hitTargets(fit: Pick<Fit, 'mode' | 'logicalW' | 'logicalH' | 'offsetX' | 'offsetY'>): readonly HitTarget[] {
  const out: HitTarget[] = buttonsFor(fit).map((b) => ({ id: b.id, rect: b, action: b.action }));
  for (let i = 0; i < 5; i++) {
    const r = holdRect(i);
    out.push({ id: `label${i + 1}`, rect: { ...r, x: r.x + fit.offsetX, y: r.y + fit.offsetY }, action: hold(i + 1) });
  }
  return out;
}

export function hitTest(fit: Pick<Fit, 'mode' | 'logicalW' | 'logicalH' | 'offsetX' | 'offsetY'>, x: number, y: number): HitTarget | null {
  for (const t of hitTargets(fit)) if (contains(t.rect, x, y)) return t;
  return null;
}

// ---------------------------------------------------------------- responsive fit

/** Portrait-ish windows get the touch pad layout. */
export function chooseMode(winW: number, winH: number): LayoutMode {
  return winH > winW * 1.1 ? 'tall' : 'wide';
}

export interface Fit {
  readonly mode: LayoutMode;
  readonly logicalW: number;
  readonly logicalH: number;
  /** x of the 320-wide game area inside the canvas (portrait layouts are wider than 320) */
  readonly offsetX: number;
  /** y of the game area inside the canvas (portrait: the stack is centred) */
  readonly offsetY: number;
  /** device pixels per logical pixel (an integer whenever possible: crisp pixel font) */
  readonly deviceScale: number;
  /** CSS pixels per logical pixel */
  readonly cssScale: number;
  readonly cssW: number;
  readonly cssH: number;
}

/** Whole device pixels per logical pixel; fractional only when even 2x does not fit. */
function pickScale(free: number): number {
  const whole = Math.floor(free);
  if (whole >= 2) return whole;
  if (whole === 1) return free < 1.5 ? 1 : free;
  return free;
}

const MIN_TALL_H = GAME_H + 150;

/**
 * Wide: 320x240 at the largest integer scale that fits (letterboxed).
 * Tall: integer scale chosen by width; the canvas then covers the whole window in logical
 * pixels (wider than 320, taller than the game) so the touch pad can use the space.
 */
export function computeFit(winW: number, winH: number, dpr: number): Fit {
  const mode = chooseMode(winW, winH);
  const d = Math.max(0.5, dpr || 1);
  const dw = Math.max(1, winW) * d;
  const dh = Math.max(1, winH) * d;
  if (mode === 'wide') {
    const k = pickScale(Math.max(0.25, Math.min(dw / W, dh / GAME_H)));
    return { mode, logicalW: W, logicalH: GAME_H, offsetX: 0, offsetY: 0, deviceScale: k, cssScale: k / d, cssW: Math.floor(W * k) / d, cssH: Math.floor(GAME_H * k) / d };
  }
  const k = pickScale(Math.max(0.25, Math.min(dw / W, dh / MIN_TALL_H)));
  const logicalW = Math.max(W, Math.floor(dw / k));
  const logicalH = Math.max(MIN_TALL_H, Math.floor(dh / k));
  return {
    mode,
    logicalW,
    logicalH,
    offsetX: Math.floor((logicalW - W) / 2),
    offsetY: tallStack(logicalH).gameY,
    deviceScale: k,
    cssScale: k / d,
    cssW: Math.floor(logicalW * k) / d,
    cssH: Math.floor(logicalH * k) / d,
  };
}

/** Client coordinates -> logical coordinates of the canvas. */
export function toLogical(
  clientX: number,
  clientY: number,
  box: { left: number; top: number; width: number; height: number },
  fit: Pick<Fit, 'logicalW' | 'logicalH'>,
): { x: number; y: number } {
  const w = box.width || 1;
  const h = box.height || 1;
  return { x: ((clientX - box.left) / w) * fit.logicalW, y: ((clientY - box.top) / h) * fit.logicalH };
}
