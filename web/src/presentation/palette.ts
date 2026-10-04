/**
 * Fixed 16-colour palette of the green arcade cabinet (ported from the Pyxel
 * version's palette.py). Always use the semantic names, never raw hex numbers,
 * so the whole game stays inside this limited palette.
 */
export const PALETTE = {
  /** near-black green (screen background / cabinet black) */
  BG: 0x04140a,
  FELT_DARK: 0x0a3d1f,
  FELT: 0x136b35,
  FELT_LIGHT: 0x1f9b4d,
  /** bright phosphor green */
  TEXT: 0x4cff7a,
  /** warm white: card faces and white text */
  CARD_FACE: 0xf6f2dc,
  /** pure black: black suits and outlines */
  BLACK: 0x000000,
  CARD_RED: 0xd81e1e,
  /** WIN / progressive / highlight */
  GOLD: 0xffd21f,
  ORANGE: 0xff8a00,
  CYAN: 0x2ee6e6,
  BLUE: 0x2a5bd7,
  NAVY: 0x10205a,
  GREY_LIGHT: 0xb8c0b8,
  GREY: 0x6a746c,
  GREY_DARK: 0x2c332e,
} as const;

export type PaletteName = keyof typeof PALETTE;

export const WHITE = PALETTE.CARD_FACE;
export const CARD_BLACK = PALETTE.BLACK;
export const CARD_BACK = PALETTE.BLUE;
/** Skin tone used on face cards; derived from ORANGE/CARD_FACE, kept here so it is a named colour. */
export const SKIN = 0xf0c890;

/** Palette entries in index order (for swatches). */
export const PALETTE_LIST: readonly (readonly [PaletteName, number])[] = Object.entries(PALETTE) as [
  PaletteName,
  number,
][];

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
