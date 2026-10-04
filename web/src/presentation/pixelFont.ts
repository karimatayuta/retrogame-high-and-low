import { Container, Sprite, Texture, TextureSource } from 'pixi.js';
import { PALETTE } from '@/presentation/palette';
import { GLYPHS, GLYPH_HEIGHT, glyphWidth, normalizeChar, textWidthPx, LINE_HEIGHT } from '@/presentation/pixelFontData';

export { LINE_HEIGHT };

/**
 * Make every texture created afterwards use nearest-neighbour sampling (call once
 * at start-up, before any texture exists). Textures made by this module also set
 * it explicitly.
 */
export function applyPixelArtDefaults(): void {
  TextureSource.defaultOptions.scaleMode = 'nearest';
}

export interface TextOptions {
  /** Text colour (default WHITE). */
  color?: number;
  /** Integer pixel scale (default 1). */
  scale?: number;
  /** Drop shadow colour, or true for black (default none). */
  shadow?: number | boolean;
  /** Which point of the text the container origin is: 'left' (default), 'center', 'right'. */
  align?: 'left' | 'center' | 'right';
}

/**
 * Glyph textures are drawn white once and tinted per sprite (a multiply of white
 * by an exact palette colour is exact), so the cache is shared by every colour
 * and never grows with the number of colours used.
 */
const glyphCache = new Map<string, Texture>();

function glyphTexture(ch: string): Texture | null {
  const key = normalizeChar(ch);
  const rows = GLYPHS[key];
  if (!rows) return null;
  const cached = glyphCache.get(key);
  if (cached) return cached;
  const w = rows[0]?.length ?? 1;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = GLYPH_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#ffffff';
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) if (row[x] === '#') ctx.fillRect(x, y, 1, 1);
  });
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  glyphCache.set(key, tex);
  return tex;
}

/** Free all cached glyph textures (e.g. on teardown / gallery reload). */
export function disposeGlyphCache(): void {
  for (const t of glyphCache.values()) t.destroy(true);
  glyphCache.clear();
}

/** Logical width in pixels of `text` at `scale`. */
export function measureText(text: string, scale = 1): number {
  return textWidthPx(text) * scale;
}

/**
 * A line of pixel text. Reuses its sprites, so calling `setText` every frame
 * (credits counter) is cheap and allocation-free for unchanged strings.
 */
export class PixelText extends Container {
  private current = '';
  private color: number;
  private readonly scaleN: number;
  private shadowColor: number | null;
  private readonly align: 'left' | 'center' | 'right';
  private readonly mains: Sprite[] = [];
  private readonly shadows: Sprite[] = [];
  private widthPx = 0;

  constructor(text: string, opts: TextOptions = {}) {
    super();
    this.color = opts.color ?? PALETTE.CARD_FACE;
    this.scaleN = Math.max(1, Math.round(opts.scale ?? 1));
    this.shadowColor = opts.shadow === undefined || opts.shadow === false ? null : opts.shadow === true ? PALETTE.BLACK : opts.shadow;
    this.align = opts.align ?? 'left';
    this.eventMode = 'none';
    this.setText(text);
  }

  /** Width in logical pixels of the current text (scale included). */
  get textWidth(): number {
    return this.widthPx;
  }

  get text(): string {
    return this.current;
  }

  setText(value: string | number): void {
    const text = String(value);
    if (text === this.current && this.mains.length > 0) return;
    this.current = text;
    const s = this.scaleN;
    this.widthPx = measureText(text, s);
    const ox = this.align === 'center' ? -Math.floor(this.widthPx / 2) : this.align === 'right' ? -this.widthPx : 0;
    let x = ox;
    let used = 0;
    for (const ch of text) {
      const adv = (glyphWidth(ch) + 1) * s;
      const tex = ch === ' ' ? null : glyphTexture(ch);
      if (tex) {
        const main = this.spriteAt(this.mains, used, this.color);
        main.texture = tex;
        main.position.set(x, 0);
        main.scale.set(s);
        main.visible = true;
        if (this.shadowColor !== null) {
          const sh = this.spriteAt(this.shadows, used, this.shadowColor);
          sh.texture = tex;
          sh.position.set(x + s, s);
          sh.scale.set(s);
          sh.visible = true;
        }
        used++;
      }
      x += adv;
    }
    for (let i = used; i < this.mains.length; i++) (this.mains[i] as Sprite).visible = false;
    for (let i = used; i < this.shadows.length; i++) (this.shadows[i] as Sprite).visible = false;
  }

  setColor(color: number): void {
    if (color === this.color) return;
    this.color = color;
    for (const sp of this.mains) sp.tint = color;
  }

  private spriteAt(list: Sprite[], i: number, tint: number): Sprite {
    let sp = list[i];
    if (!sp) {
      sp = new Sprite(Texture.EMPTY);
      sp.tint = tint;
      list[i] = sp;
      // shadows must be drawn behind all mains: keep them at the front of the child list
      if (list === this.shadows) this.addChildAt(sp, Math.min(this.shadows.length - 1, this.children.length));
      else this.addChild(sp);
    }
    return sp;
  }
}

/** Create a text line. Use `.setText()` on the result to change it cheaply. */
export function createText(text: string, opts: TextOptions = {}): PixelText {
  return new PixelText(text, opts);
}

/**
 * Numbers that change often (CREDITS, WIN counters). `format` pads/groups the
 * value; right-aligned by default so the digits grow leftwards.
 */
export function createNumberText(
  value: number,
  opts: TextOptions & { minDigits?: number } = {},
): PixelText & { setValue(v: number): void } {
  const { minDigits = 1, ...rest } = opts;
  const fmt = (v: number): string => String(Math.max(0, Math.trunc(v))).padStart(minDigits, '0');
  const t = new PixelText(fmt(value), { align: 'right', ...rest }) as PixelText & { setValue(v: number): void };
  t.setValue = (v: number) => t.setText(fmt(v));
  return t;
}
