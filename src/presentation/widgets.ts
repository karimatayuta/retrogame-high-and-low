/** Small reusable Pixi widgets. They redraw only when their state actually changes. */
import { Container, Graphics } from 'pixi.js';
import { PALETTE } from '@/presentation/palette';
import { createText, type PixelText } from '@/presentation/pixelFont';

/** A 1px-bordered filled rectangle with an optional lighter top line ("keycap"). */
export class Box extends Container {
  private readonly g = new Graphics();
  private key = '';
  constructor(
    readonly boxW: number,
    readonly boxH: number,
  ) {
    super();
    this.addChild(this.g);
    this.eventMode = 'none';
  }

  setColors(bg: number, edge: number, top: number | null = null): void {
    const key = `${bg}|${edge}|${top}`;
    if (key === this.key) return;
    this.key = key;
    const { boxW: w, boxH: h, g } = this;
    g.clear().rect(0, 0, w, h).fill(edge).rect(1, 1, w - 2, h - 2).fill(bg);
    if (top !== null) g.rect(1, 1, w - 2, 1).fill(top);
  }
}

export interface ButtonStyle {
  readonly bg: number;
  readonly fg: number;
  readonly edge: number;
  readonly top: number | null;
}

export const STYLE_ON: ButtonStyle = { bg: PALETTE.FELT, fg: PALETTE.CARD_FACE, edge: PALETTE.TEXT, top: PALETTE.FELT_LIGHT };
export const STYLE_OFF: ButtonStyle = { bg: PALETTE.GREY_DARK, fg: PALETTE.GREY, edge: PALETTE.GREY_DARK, top: null };
export const STYLE_PRESSED: ButtonStyle = { bg: PALETTE.GOLD, fg: PALETTE.BLACK, edge: PALETTE.CARD_FACE, top: null };
export const STYLE_SELECTED: ButtonStyle = { bg: PALETTE.GOLD, fg: PALETTE.BLACK, edge: PALETTE.CARD_FACE, top: null };

/** A labelled button face. */
export class ButtonFace extends Container {
  readonly box: Box;
  readonly caption: PixelText;
  constructor(w: number, h: number, text: string, scale = 1) {
    super();
    this.box = new Box(w, h);
    this.caption = createText(text, { align: 'center', scale });
    this.caption.position.set(Math.floor(w / 2), Math.floor((h - 5 * scale) / 2));
    this.addChild(this.box, this.caption);
    this.eventMode = 'none';
  }

  setStyle(s: ButtonStyle): void {
    this.box.setColors(s.bg, s.edge, s.top);
    this.caption.setColor(s.fg);
  }

  setText(text: string): void {
    this.caption.setText(text);
  }
}
