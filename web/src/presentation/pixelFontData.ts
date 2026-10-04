/**
 * Pure glyph data of the code-defined bitmap font (no Pixi, testable in Node).
 * Letters/digits are 3x5 (4px advance like Pyxel's 4x6 cell), punctuation is
 * proportional, suits are 5x5. '#' is a lit pixel.
 */
export const GLYPH_HEIGHT = 5;
/** Line height including the 1px gap (matches Pyxel's 6px font cell). */
export const LINE_HEIGHT = 6;
export const SPACE_WIDTH = 2;

const g = (...rows: string[]): readonly string[] => rows;

export const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: g('.#.', '#.#', '###', '#.#', '#.#'),
  B: g('##.', '#.#', '##.', '#.#', '##.'),
  C: g('.##', '#..', '#..', '#..', '.##'),
  D: g('##.', '#.#', '#.#', '#.#', '##.'),
  E: g('###', '#..', '##.', '#..', '###'),
  F: g('###', '#..', '##.', '#..', '#..'),
  G: g('.##', '#..', '#.#', '#.#', '.##'),
  H: g('#.#', '#.#', '###', '#.#', '#.#'),
  I: g('###', '.#.', '.#.', '.#.', '###'),
  J: g('..#', '..#', '..#', '#.#', '.#.'),
  K: g('#.#', '#.#', '##.', '#.#', '#.#'),
  L: g('#..', '#..', '#..', '#..', '###'),
  M: g('#.#', '###', '###', '#.#', '#.#'),
  N: g('##.', '#.#', '#.#', '#.#', '#.#'),
  O: g('.#.', '#.#', '#.#', '#.#', '.#.'),
  P: g('##.', '#.#', '##.', '#..', '#..'),
  Q: g('.#.', '#.#', '#.#', '##.', '.##'),
  R: g('##.', '#.#', '##.', '#.#', '#.#'),
  S: g('.##', '#..', '.#.', '..#', '##.'),
  T: g('###', '.#.', '.#.', '.#.', '.#.'),
  U: g('#.#', '#.#', '#.#', '#.#', '###'),
  V: g('#.#', '#.#', '#.#', '#.#', '.#.'),
  W: g('#.#', '#.#', '###', '###', '#.#'),
  X: g('#.#', '#.#', '.#.', '#.#', '#.#'),
  Y: g('#.#', '#.#', '.#.', '.#.', '.#.'),
  Z: g('###', '..#', '.#.', '#..', '###'),
  '0': g('###', '#.#', '#.#', '#.#', '###'),
  '1': g('.#.', '##.', '.#.', '.#.', '###'),
  '2': g('##.', '..#', '.#.', '#..', '###'),
  '3': g('##.', '..#', '.#.', '..#', '##.'),
  '4': g('#.#', '#.#', '###', '..#', '..#'),
  '5': g('###', '#..', '##.', '..#', '##.'),
  '6': g('.##', '#..', '###', '#.#', '###'),
  '7': g('###', '..#', '.#.', '.#.', '.#.'),
  '8': g('###', '#.#', '###', '#.#', '###'),
  '9': g('###', '#.#', '###', '..#', '##.'),
  '&': g('.#.', '#.#', '.#.', '#.#', '.##'),
  '/': g('..#', '..#', '.#.', '#..', '#..'),
  '.': g('.', '.', '.', '.', '#'),
  ',': g('.', '.', '.', '#', '#'),
  ':': g('.', '#', '.', '#', '.'),
  '!': g('#', '#', '#', '.', '#'),
  '?': g('##.', '..#', '.#.', '...', '.#.'),
  '-': g('...', '...', '###', '...', '...'),
  '+': g('...', '.#.', '###', '.#.', '...'),
  '=': g('...', '###', '...', '###', '...'),
  '×': g('...', '#.#', '.#.', '#.#', '...'),
  "'": g('#', '#', '.', '.', '.'),
  '*': g('#.#', '.#.', '###', '.#.', '#.#'),
  '%': g('#.#', '..#', '.#.', '#..', '#.#'),
  '(': g('.#', '#.', '#.', '#.', '.#'),
  ')': g('#.', '.#', '.#', '.#', '#.'),
  '<': g('..#', '.#.', '#..', '.#.', '..#'),
  '>': g('#..', '.#.', '..#', '.#.', '#..'),
  '♠': g('..#..', '.###.', '#####', '#####', '..#..'),
  '♥': g('.#.#.', '#####', '#####', '.###.', '..#..'),
  '♦': g('..#..', '.###.', '#####', '.###.', '..#..'),
  '♣': g('..#..', '.###.', '#####', '#.#.#', '..#..'),
};

/** Normalise to what the font can draw (upper-case; everything else is unchanged). */
export function normalizeChar(ch: string): string {
  return ch.toUpperCase();
}

export function hasGlyph(ch: string): boolean {
  return ch === ' ' || GLYPHS[normalizeChar(ch)] !== undefined;
}

/** Characters of `text` that the font cannot draw. */
export function missingGlyphs(text: string): string[] {
  return [...new Set([...text].filter((c) => !hasGlyph(c)))];
}

export function glyphWidth(ch: string): number {
  if (ch === ' ') return SPACE_WIDTH;
  const rows = GLYPHS[normalizeChar(ch)];
  return rows ? (rows[0]?.length ?? 0) : 3; // unknown chars render as a blank 3px cell
}

/** Logical pixel width of `text` at scale 1 (glyph widths + 1px gaps, no trailing gap). */
export function textWidthPx(text: string): number {
  let w = 0;
  let n = 0;
  for (const ch of text) {
    w += glyphWidth(ch);
    n++;
  }
  return n === 0 ? 0 : w + (n - 1);
}
