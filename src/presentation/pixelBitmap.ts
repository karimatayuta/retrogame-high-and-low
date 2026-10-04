import { GLYPHS, normalizeChar, glyphWidth } from '@/presentation/pixelFontData';

/** A tiny pure RGB bitmap (no Pixi/DOM) used to draw card art in code. -1 = transparent. */
export class Bitmap {
  readonly px: Int32Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Int32Array(w * h).fill(-1);
  }

  set(x: number, y: number, color: number): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = color;
  }

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return this.px[y * this.w + x] as number;
  }

  rect(x: number, y: number, w: number, h: number, color: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  rectb(x: number, y: number, w: number, h: number, color: number): void {
    this.rect(x, y, w, 1, color);
    this.rect(x, y + h - 1, w, 1, color);
    this.rect(x, y, 1, h, color);
    this.rect(x + w - 1, y, 1, h, color);
  }

  /** Blit a '#'-pattern; `scale` enlarges, `flipV`/`flipH` mirror. */
  pattern(x: number, y: number, rows: readonly string[], color: number, scale = 1, flipV = false, flipH = false): void {
    const h = rows.length;
    rows.forEach((row, ry) => {
      const w = row.length;
      for (let rx = 0; rx < w; rx++) {
        if (row[rx] !== '#') continue;
        const sx = flipH ? w - 1 - rx : rx;
        const sy = flipV ? h - 1 - ry : ry;
        this.rect(x + sx * scale, y + sy * scale, scale, scale, color);
      }
    });
  }

  /** Draw text with the pixel font. `flip` rotates every glyph 180 degrees (reversed order too). */
  text(x: number, y: number, text: string, color: number, flip = false): void {
    const chars = [...text];
    if (flip) {
      let cx = x;
      for (const ch of chars.reverse()) {
        const rows = GLYPHS[normalizeChar(ch)];
        if (rows) this.pattern(cx, y, rows, color, 1, true, true);
        cx += glyphWidth(ch) + 1;
      }
      return;
    }
    let cx = x;
    for (const ch of chars) {
      const rows = GLYPHS[normalizeChar(ch)];
      if (rows) this.pattern(cx, y, rows, color);
      cx += glyphWidth(ch) + 1;
    }
  }

  /** Copy this bitmap rotated by 180 degrees into `dst` at (x, y) (only opaque pixels). */
  stampRotated(dst: Bitmap, x: number, y: number): void {
    for (let j = 0; j < this.h; j++)
      for (let i = 0; i < this.w; i++) {
        const c = this.get(this.w - 1 - i, this.h - 1 - j);
        if (c >= 0) dst.set(x + i, y + j, c);
      }
  }

  /** RGBA bytes (premultiplication irrelevant: alpha is 0 or 255). */
  toRgba(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(this.w * this.h * 4);
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i] as number;
      if (c < 0) continue;
      out[i * 4] = (c >> 16) & 255;
      out[i * 4 + 1] = (c >> 8) & 255;
      out[i * 4 + 2] = c & 255;
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  /** Distinct opaque colours used. */
  colors(): Set<number> {
    const s = new Set<number>();
    for (const c of this.px) if (c >= 0) s.add(c);
    return s;
  }
}
