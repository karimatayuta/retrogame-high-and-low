import type { Card, Suit } from '@/domain/cards';
import { isJoker, suitColor } from '@/domain/cards';
import { Bitmap } from '@/presentation/pixelBitmap';
import { PALETTE as P, SKIN } from '@/presentation/palette';

/** Same size as the Pyxel version. */
export const CARD_W = 44;
export const CARD_H = 62;

const SUIT_7: Readonly<Record<Suit, readonly string[]>> = {
  S: ['...#...', '..###..', '.#####.', '#######', '#######', '...#...', '..###..'],
  H: ['.##.##.', '#######', '#######', '#######', '.#####.', '..###..', '...#...'],
  D: ['...#...', '..###..', '.#####.', '#######', '.#####.', '..###..', '...#...'],
  C: ['..###..', '.#####.', '..###..', '##.#.##', '#######', '##.#.##', '...#...'],
};

const INK = (suit: Suit): number => (suitColor(suit) === 'RED' ? P.CARD_RED : P.BLACK);

function body(b: Bitmap, face: number, edge: number): void {
  const w = CARD_W;
  const h = CARD_H;
  b.rect(0, 0, w, h, edge);
  b.rect(1, 1, w - 2, h - 2, face);
  // rounded corners: carve the corner pixel and soften the next one
  for (const [x, y] of [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ] as const) {
    b.set(x, y, -1);
  }
  for (const [x, y] of [
    [1, 1],
    [w - 2, 1],
    [1, h - 2],
    [w - 2, h - 2],
  ] as const) {
    b.set(x, y, edge);
  }
}

function label(rank: number): string {
  return rank === 14 ? 'A' : rank === 13 ? 'K' : rank === 12 ? 'Q' : rank === 11 ? 'J' : String(rank);
}

function corner(b: Bitmap, rank: number, suit: Suit): void {
  const col = INK(suit);
  const text = label(rank);
  const tw = text === '10' ? 7 : 3;
  const small = { S: '♠', H: '♥', D: '♦', C: '♣' }[suit];
  const tmp = new Bitmap(7, 13);
  tmp.text(0, 0, text, col);
  tmp.text(Math.floor((tw - 5) / 2) + (tw < 5 ? 1 : 0), 7, small, col);
  blit(tmp, b, 3, 3);
  tmp.stampRotated(b, CARD_W - 3 - tmp.w, CARD_H - 3 - tmp.h);
}

function blit(src: Bitmap, dst: Bitmap, x: number, y: number): void {
  for (let j = 0; j < src.h; j++)
    for (let i = 0; i < src.w; i++) {
      const c = src.get(i, j);
      if (c >= 0) dst.set(x + i, y + j, c);
    }
}

const COLS = [14, 22, 30] as const;
const ROW3 = [14, 31, 48] as const;
const ROW4 = [14, 26, 36, 48] as const;

/** Pip centres (cx, cy) per rank 2..10. */
function pipLayout(rank: number): [number, number][] {
  const [L, C, R] = COLS;
  const [t, m, bt] = ROW3;
  const [r1, r2, r3, r4] = ROW4;
  switch (rank) {
    case 2: return [[C, t], [C, bt]];
    case 3: return [[C, t], [C, m], [C, bt]];
    case 4: return [[L, t], [R, t], [L, bt], [R, bt]];
    case 5: return [[L, t], [R, t], [C, m], [L, bt], [R, bt]];
    case 6: return [[L, t], [R, t], [L, m], [R, m], [L, bt], [R, bt]];
    case 7: return [[L, t], [R, t], [C, 22], [L, m], [R, m], [L, bt], [R, bt]];
    case 8: return [[L, t], [R, t], [C, 22], [L, m], [R, m], [C, 40], [L, bt], [R, bt]];
    case 9: return [[L, r1], [R, r1], [L, r2], [R, r2], [C, m], [L, r3], [R, r3], [L, r4], [R, r4]];
    default: return [[L, r1], [R, r1], [C, 20], [L, r2], [R, r2], [L, r3], [R, r3], [C, 42], [L, r4], [R, r4]];
  }
}

function pips(b: Bitmap, rank: number, suit: Suit): void {
  const col = INK(suit);
  if (rank === 14) {
    b.pattern(22 - 7, 31 - 7, SUIT_7[suit], col, 2);
    return;
  }
  for (const [cx, cy] of pipLayout(rank)) {
    b.pattern(cx - 3, cy - 3, SUIT_7[suit], col, 1, cy > 31);
  }
}

/** Half of a face-card figure, 24 wide x 16 tall, head at the top. */
function figureHalf(rank: number, suit: Suit): Bitmap {
  const h = new Bitmap(24, 16);
  const robe = suitColor(suit) === 'RED' ? P.CARD_RED : P.BLUE;
  const hair = rank === 12 ? P.ORANGE : P.GREY_DARK;
  // robe + trim
  h.rect(2, 11, 20, 5, robe);
  h.rect(2, 11, 20, 1, P.GOLD);
  h.rect(11, 11, 2, 5, P.GOLD);
  // neck + face
  h.rect(10, 9, 4, 2, SKIN);
  h.rect(7, 3, 10, 7, SKIN);
  h.rect(8, 10, 8, 1, SKIN);
  h.rect(9, 5, 2, 1, P.BLACK); // eyes
  h.rect(13, 5, 2, 1, P.BLACK);
  h.rect(11, 7, 2, 1, P.CARD_RED); // nose / mouth hint
  h.rect(10, 8, 4, 1, P.BLACK);
  if (rank === 13) {
    // king: tall crown, beard
    h.rect(7, 0, 10, 3, P.GOLD);
    h.set(7, -1, P.GOLD);
    for (const x of [7, 11, 15]) h.rect(x, 0, 2, 1, P.CARD_FACE);
    h.rect(7, 8, 10, 1, hair);
    h.rect(8, 9, 8, 1, hair);
    h.rect(6, 3, 1, 5, hair);
    h.rect(17, 3, 1, 5, hair);
  } else if (rank === 12) {
    // queen: small crown with gem, long hair
    h.rect(8, 1, 8, 2, P.GOLD);
    h.set(11, 1, P.CARD_RED);
    h.set(12, 1, P.CYAN);
    h.rect(5, 2, 2, 9, hair);
    h.rect(17, 2, 2, 9, hair);
    h.rect(7, 3, 10, 1, hair);
  } else {
    // jack: cap with feather
    h.rect(6, 1, 12, 3, robe);
    h.rect(4, 3, 16, 1, robe);
    h.rect(17, 0, 1, 1, P.CYAN);
    h.rect(18, -1, 1, 1, P.CYAN);
    h.rect(19, 0, 1, 2, P.CYAN);
    h.rect(6, 4, 1, 4, hair);
  }
  return h;
}

function faceCardArt(b: Bitmap, rank: number, suit: Suit): void {
  const ink = INK(suit);
  const x0 = 10;
  const y0 = 14;
  const w = 24;
  const hgt = 34;
  b.rect(x0, y0, w, hgt, P.CARD_FACE);
  b.rectb(x0 - 1, y0 - 1, w + 2, hgt + 2, ink);
  const half = figureHalf(rank, suit);
  blit(half, b, x0, y0 + 1);
  half.stampRotated(b, x0, y0 + hgt - 1 - half.h);
  // diagonal divider hint
  b.rect(x0, y0 + hgt / 2 - 1, w, 1, P.GREY_LIGHT);
  b.pattern(x0 + 1, y0 + hgt / 2 - 8, SUIT_7[suit], ink);
  b.pattern(x0 + w - 8, y0 + hgt / 2 + 1, SUIT_7[suit], ink, 1, true);
}

function jokerArt(b: Bitmap, id: 1 | 2): void {
  const accent = id === 1 ? P.CARD_RED : P.BLUE;
  b.rectb(3, 3, CARD_W - 6, CARD_H - 6, accent);
  b.rect(5, 5, CARD_W - 10, 9, accent);
  b.text(Math.floor((CARD_W - 19) / 2), 7, 'JOKER', P.CARD_FACE);
  // jester: two-horned hat with bells, face, diamond-pattern body
  const cx = 22;
  b.rect(cx - 9, 24, 6, 3, accent);
  b.rect(cx + 3, 24, 6, 3, P.GOLD);
  b.rect(cx - 12, 20, 4, 5, accent);
  b.rect(cx + 8, 20, 4, 5, P.GOLD);
  b.rect(cx - 13, 18, 2, 2, P.GOLD);
  b.rect(cx + 11, 18, 2, 2, accent);
  b.rect(cx - 9, 27, 18, 3, P.GOLD);
  b.rect(cx - 6, 30, 12, 9, SKIN);
  b.rect(cx - 4, 33, 2, 2, P.BLACK);
  b.rect(cx + 2, 33, 2, 2, P.BLACK);
  b.rect(cx - 3, 37, 6, 1, P.CARD_RED);
  b.rect(cx - 8, 40, 16, 8, accent);
  for (let i = 0; i < 4; i++) {
    b.set(cx - 6 + i * 4, 42, P.GOLD);
    b.set(cx - 4 + i * 4, 44, P.CARD_FACE);
    b.set(cx - 6 + i * 4, 46, P.GOLD);
  }
  b.text(7, CARD_H - 11, '*', P.GOLD);
  b.text(CARD_W - 10, CARD_H - 11, '*', P.GOLD);
  b.text(7, 17, '*', P.GOLD);
  b.text(CARD_W - 10, 17, '*', P.GOLD);
}

export function renderCardFace(card: Card): Bitmap {
  const b = new Bitmap(CARD_W, CARD_H);
  body(b, P.CARD_FACE, P.BLACK);
  if (isJoker(card)) {
    jokerArt(b, card.id);
    return b;
  }
  corner(b, card.rank, card.suit);
  if (card.rank >= 11 && card.rank <= 13) faceCardArt(b, card.rank, card.suit);
  else pips(b, card.rank, card.suit);
  return b;
}

export function renderCardBack(): Bitmap {
  const b = new Bitmap(CARD_W, CARD_H);
  body(b, P.BLUE, P.BLACK);
  b.rect(3, 3, CARD_W - 6, CARD_H - 6, P.NAVY);
  for (let y = 4; y < CARD_H - 4; y++)
    for (let x = 4; x < CARD_W - 4; x++) if ((x + y) % 4 === 0 || (x - y + 400) % 4 === 0) b.set(x, y, P.BLUE);
  b.rectb(3, 3, CARD_W - 6, CARD_H - 6, P.BLUE);
  b.rectb(5, 5, CARD_W - 10, CARD_H - 10, P.CYAN);
  const cx = CARD_W / 2;
  const cy = CARD_H / 2;
  for (let d = 0; d < 9; d++) {
    b.rect(cx - d, cy - 8 + d, d * 2, 1, d % 2 ? P.GOLD : P.ORANGE);
    b.rect(cx - d, cy + 8 - d, d * 2, 1, d % 2 ? P.GOLD : P.ORANGE);
  }
  return b;
}

export const HIGHLIGHT_PAD = 2;
/** Gold selection frame (transparent inside), CARD_W+4 x CARD_H+4; draw at card position minus 2. */
export function renderHighlight(color: number = P.GOLD): Bitmap {
  const b = new Bitmap(CARD_W + HIGHLIGHT_PAD * 2, CARD_H + HIGHLIGHT_PAD * 2);
  b.rectb(0, 0, b.w, b.h, color);
  b.rectb(1, 1, b.w - 2, b.h - 2, color);
  for (const [x, y] of [[0, 0], [b.w - 1, 0], [0, b.h - 1], [b.w - 1, b.h - 1]] as const) b.set(x, y, -1);
  return b;
}
