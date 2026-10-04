/**
 * The fixed screen furniture: pay table, bonus table, free game table, status box, HOLD labels,
 * info rows, attract text and the touch buttons. Everything here only reads a SessionView
 * (no rules) and updates its sprites only when the text/colour actually changes.
 */
import { Container, Graphics } from 'pixi.js';
import type { SessionView } from '@/application/view';
import { blink } from '@/presentation/effects';
import {
  buttonsFor,
  CARDS_Y,
  holdRect,
  HOLD_H,
  HOLD_Y,
  W,
  type ButtonSpec,
  type Fit,
  type LayoutMode,
} from '@/presentation/layout';
import { dealLabel, isEnabled } from '@/presentation/input';
import { PALETTE } from '@/presentation/palette';
import { createText, measureText, type PixelText } from '@/presentation/pixelFont';
import { money } from '@/presentation/stages';
import {
  ButtonFace,
  STYLE_OFF,
  STYLE_ON,
  STYLE_PRESSED,
  STYLE_SELECTED,
  type ButtonStyle,
} from '@/presentation/widgets';

const LEFT = { x: 5, y: 5, w: 152, h: 82 } as const;
const RIGHT = { x: 163, y: 5, w: 152 } as const;
const ROW = 8;

/** Frame + title strip of a table panel. */
class PanelFrame extends Container {
  readonly title: PixelText;
  constructor(w: number, h: number, title: string, titleColor: number = PALETTE.CARD_FACE) {
    super();
    const g = new Graphics()
      .rect(0, 0, w, h)
      .fill(PALETTE.FELT_LIGHT)
      .rect(1, 1, w - 2, h - 2)
      .fill(PALETTE.BG)
      .rect(1, 1, w - 2, 9)
      .fill(PALETTE.FELT);
    this.title = createText(title, { color: titleColor, align: 'center' });
    this.title.position.set(Math.floor(w / 2), 3);
    this.addChild(g, this.title);
    this.eventMode = 'none';
  }
}

interface Row {
  readonly hit: Graphics;
  readonly label: PixelText;
  readonly mid: PixelText;
  readonly value: PixelText;
  readonly marker: Graphics;
}

function makeRow(parent: Container, w: number, i: number, midRight: number | null): Row {
  const y = 13 + i * ROW;
  const hit = new Graphics().rect(2, y - 1, w - 4, ROW).fill(PALETTE.ORANGE);
  hit.visible = false;
  const label = createText('', { color: PALETTE.TEXT });
  label.position.set(5, y);
  const mid = createText('', { color: PALETTE.GREY_LIGHT, align: 'right' });
  mid.position.set(midRight ?? 0, y);
  const value = createText('', { color: PALETTE.CARD_FACE, align: 'right' });
  value.position.set(w - 5, y);
  const marker = new Graphics().rect(0, 0, 3, 7).fill(0xffffff);
  marker.position.set(w - 41, y - 1);
  marker.visible = false;
  parent.addChild(hit, marker, label, mid, value);
  return { hit, label, mid, value, marker };
}

/** Top-left: pay table priced for the current bet, live progressive values on the top rows. */
export class PayTable extends PanelFrame {
  private readonly rows: Row[] = [];
  constructor() {
    super(LEFT.w, LEFT.h, 'PAY TABLE', PALETTE.CARD_FACE);
    this.position.set(LEFT.x, LEFT.y);
  }

  update(view: SessionView, t: number): void {
    this.title.setText(`PAY TABLE   BET ${view.bet || view.lastBet || 1}`);
    const flash = blink(t, 0.33);
    view.paytable.forEach((row, i) => {
      const r = (this.rows[i] ??= makeRow(this, LEFT.w, i, null));
      const hit = row.hit && (view.phase === 'FREE_GAME' || view.phase === 'DOUBLE_SELECT');
      const lit = hit && flash;
      r.hit.visible = lit;
      r.label.setText(row.label);
      r.label.setColor(lit ? PALETTE.BLACK : PALETTE.TEXT);
      r.value.setText(money(row.payout));
      r.value.setColor(lit ? PALETTE.BLACK : row.progressive ? PALETTE.GOLD : PALETTE.CARD_FACE);
      r.marker.visible = row.progressive && !lit;
      if (r.marker.visible) r.marker.tint = blink(t, 0.66) ? PALETTE.CARD_RED : PALETTE.ORANGE;
    });
  }
}

/** Replaces the pay table during HIGH & LOW (and while its bonus result is shown). */
export class BonusTable extends PanelFrame {
  private readonly rows: Row[] = [];
  constructor() {
    super(LEFT.w, LEFT.h, 'HIGH & LOW SPECIAL BONUS', PALETTE.GOLD);
    this.position.set(LEFT.x, LEFT.y);
  }

  update(view: SessionView, t: number): void {
    const hl = view.highLow;
    if (!hl) return;
    const flash = blink(t, 0.33);
    hl.bonusRows.forEach((row, i) => {
      const r = (this.rows[i] ??= makeRow(this, LEFT.w, i, LEFT.w - 50));
      const lit = hl.bonusHand === row.label && flash;
      r.hit.visible = lit;
      r.label.setText(row.label);
      r.label.setColor(lit ? PALETTE.BLACK : PALETTE.TEXT);
      r.mid.setText(`x${row.multiplier}`);
      r.mid.setColor(lit ? PALETTE.BLACK : PALETTE.GREY_LIGHT);
      r.value.setText(money(row.amount));
      r.value.setColor(lit ? PALETTE.BLACK : PALETTE.GOLD);
    });
  }
}

/** Top-right: FREE GAME BONUS table. */
export class FreeGameTable extends PanelFrame {
  private rows: { label: PixelText; games: PixelText }[] = [];
  constructor() {
    super(RIGHT.w, 55, 'FREE GAME BONUS');
    this.position.set(RIGHT.x, RIGHT.y);
  }

  update(view: SessionView): void {
    view.freeGameAwards.forEach((a, i) => {
      let r = this.rows[i];
      if (!r) {
        const label = createText('', { color: PALETTE.TEXT });
        label.position.set(6, 13 + i * ROW);
        const games = createText('', { color: PALETTE.CARD_FACE, align: 'right' });
        games.position.set(RIGHT.w - 6, 13 + i * ROW);
        this.addChild(label, games);
        r = { label, games };
        this.rows[i] = r;
      }
      r.label.setText(a.label);
      r.label.setColor(view.inFreeGame && view.freeGameTrigger === a.label ? PALETTE.GOLD : PALETTE.TEXT);
      r.games.setText(String(a.games));
    });
  }
}

/** Under the free game table: the joker note, the free game counter, or HIGH & LOW progress. */
export class StatusBox extends Container {
  private readonly lines: PixelText[];
  private readonly y0 = RIGHT.y + 12 + ROW * 5 + 5;
  constructor() {
    super();
    const h = LEFT.y + LEFT.h - this.y0;
    const g = new Graphics()
      .rect(0, 0, RIGHT.w, h)
      .fill(PALETTE.FELT_LIGHT)
      .rect(1, 1, RIGHT.w - 2, h - 2)
      .fill(PALETTE.BG);
    this.addChild(g);
    this.position.set(RIGHT.x, this.y0);
    this.lines = [3, 10, 17].map((y) => {
      const t = createText('', { align: 'center' });
      t.position.set(RIGHT.w / 2, y);
      this.addChild(t);
      return t;
    });
    this.eventMode = 'none';
  }

  update(view: SessionView): void {
    const [a, b, c] = this.lines as [PixelText, PixelText, PixelText];
    const set = (t: PixelText, text: string, color: number): void => {
      t.setText(text);
      t.setColor(color);
    };
    const hl = view.highLow;
    if (view.inFreeGame) {
      set(a, `FREE GAME ${view.freeGamesPlayed}/${view.freeGameTotal}`, PALETTE.CYAN);
      set(b, `LEFT ${view.freeGamesLeft}   WIN ${money(view.freeGameWin)}`, PALETTE.CARD_FACE);
      set(c, 'SPACE / TAP: SKIP WAIT', PALETTE.GREY);
    } else if (hl && view.phase === 'HIGH_LOW_GUESS') {
      set(a, `ROUND ${Math.min(hl.roundsWon + 1, hl.roundsTotal)}/${hl.roundsTotal}`, PALETTE.CYAN);
      set(b, `NOW ${money(hl.currentAmount)}  WIN> ${money(hl.nextAmount)}`, PALETTE.GOLD);
      set(c, 'LOW: 2 / DOWN   HIGH: 4 / UP', PALETTE.GREY);
    } else {
      set(a, 'JOKER IS NOT A FACE CARD', PALETTE.CYAN);
      set(b, 'R/B = FACES OF ONE COLOR', PALETTE.GREY_LIGHT);
      set(c, 'FREE GAMES PAY x2', PALETTE.GREY_LIGHT);
    }
  }
}

/** HOLD labels right under the cards (also tappable): double down menu, PICK, LOW/HIGH. */
export class HoldLabels extends Container {
  private readonly faces: ButtonFace[] = [];
  private readonly up: Graphics[] = [];
  private readonly down: Graphics[] = [];
  constructor() {
    super();
    this.eventMode = 'none';
    for (let i = 0; i < 5; i++) {
      const r = holdRect(i);
      const face = new ButtonFace(r.w, r.h, '');
      face.position.set(r.x, r.y);
      const up = new Graphics().poly([0, 4, 6, 4, 3, 0]).fill(0xffffff);
      const down = new Graphics().poly([0, 0, 6, 0, 3, 4]).fill(0xffffff);
      up.position.set(r.x + 6, r.y + 3);
      down.position.set(r.x + 6, r.y + 3);
      up.visible = down.visible = false;
      this.addChild(face, up, down);
      this.faces.push(face);
      this.up.push(up);
      this.down.push(down);
    }
  }

  update(view: SessionView, pressedN: number): void {
    for (let i = 0; i < 5; i++) {
      const face = this.faces[i] as ButtonFace;
      const label = view.holdLabels[i] ?? '';
      face.visible = label !== '';
      (this.up[i] as Graphics).visible = (this.down[i] as Graphics).visible = false;
      if (!label) continue;
      const item = view.menu[i];
      let style: ButtonStyle = STYLE_ON;
      if (item?.selected) style = STYLE_SELECTED;
      else if (item && !item.enabled) style = STYLE_OFF;
      if (pressedN === i + 1) style = STYLE_PRESSED;
      face.setStyle({ ...style, top: null, edge: style === STYLE_OFF ? PALETTE.GREY_DARK : style.edge });
      face.setText(label);
      if (label === 'HIGH' || label === 'LOW') {
        const arrow = (label === 'HIGH' ? this.up : this.down)[i] as Graphics;
        arrow.visible = true;
        arrow.tint = style.fg;
      }
    }
  }
}

const KIND_NAMES: Readonly<Record<string, string>> = {
  STANDARD_PICK: 'STANDARD DOUBLE',
  RED_BLACK_PICK: 'RED & BLACK',
  HIGH_LOW_GUESS: 'HIGH & LOW',
};

/** Hand name + WIN, BET + CREDITS, message line. Numbers are fed by the counters. */
export class InfoRows extends Container {
  private readonly handName = createText('', { scale: 2, shadow: true });
  private readonly winLabel = createText('WIN', { color: PALETTE.GREY, align: 'right' });
  readonly win = createText('0', { scale: 2, shadow: true, align: 'right' });
  private readonly betLabel = createText('BET', { color: PALETTE.GREY_LIGHT });
  private readonly bet = createText('0', { scale: 2, shadow: true, color: PALETTE.CYAN });
  private readonly creditsLabel = createText('CREDITS', { color: PALETTE.GREY_LIGHT, align: 'right' });
  readonly credits = createText('0', { scale: 2, shadow: true, align: 'right', color: PALETTE.TEXT });
  private readonly message = createText('', { align: 'center' });

  constructor() {
    super();
    this.eventMode = 'none';
    const y = HOLD_Y + HOLD_H + 4;
    const y2 = y + 17;
    this.addChild(new Graphics().rect(8, y - 2, W - 16, 1).fill(PALETTE.FELT));
    this.handName.position.set(8, y + 1);
    this.win.position.set(W - 8, y + 1);
    this.winLabel.position.set(0, y + 5);
    this.betLabel.position.set(8, y2 + 5);
    this.bet.position.set(26, y2);
    this.creditsLabel.position.set(0, y2 + 5);
    this.credits.position.set(W - 8, y2);
    this.message.position.set(W / 2, y2 + 17);
    this.addChild(this.handName, this.winLabel, this.win, this.betLabel, this.bet, this.creditsLabel, this.credits, this.message);
  }

  /** Cheap enough to call every frame: texts only change when their string changes. */
  update(view: SessionView, t: number, creditsText: string, winText: string, winValue: number): void {
    let name = '';
    if (view.phase === 'FREE_GAME' || view.phase === 'DOUBLE_SELECT') {
      if (view.handRank && view.handRank !== 'NOTHING') name = view.handRank;
    } else name = KIND_NAMES[view.phase] ?? '';
    this.handName.setText(name);
    this.handName.setColor(KIND_NAMES[view.phase] ? PALETTE.CYAN : winValue > 0 && blink(t, 0.4, 0.7) ? PALETTE.GOLD : PALETTE.CARD_FACE);
    this.win.setText(winText);
    this.win.setColor(winValue > 0 ? PALETTE.GOLD : PALETTE.GREY);
    this.winLabel.setColor(winValue > 0 ? PALETTE.GOLD : PALETTE.GREY);
    this.winLabel.x = W - 8 - this.win.textWidth - 6;
    this.bet.setText(String(view.bet));
    this.credits.setText(creditsText);
    this.creditsLabel.x = W - 8 - this.credits.textWidth - 6;
    const msg = view.message;
    this.message.setText(msg);
    const attention = msg === 'PRESS DEAL' || msg === 'DOUBLE UP?' || msg === 'HIGH OR LOW?' || msg === 'PICK A CARD' || msg === 'PLACE YOUR BET';
    this.message.setColor(attention ? (blink(t, 0.67, 0.65) ? PALETTE.GOLD : PALETTE.ORANGE) : PALETTE.CARD_FACE);
  }
}

/** Idle text over the empty card slots (the title / attract screen). */
export class Attract extends Container {
  private readonly a = createText('INSERT MEDALS', { scale: 2, shadow: true, align: 'center', color: PALETTE.GOLD });
  private readonly b = createText('PLEASE BET', { scale: 2, shadow: true, align: 'center' });
  private readonly c = createText('FREE DEAL  TWIN JOKERS', { shadow: true, align: 'center', color: PALETTE.CYAN });
  constructor() {
    super();
    this.eventMode = 'none';
    const y = CARDS_Y + 14;
    this.a.position.set(W / 2, y);
    this.b.position.set(W / 2, y + 20);
    this.c.position.set(W / 2, y + 42);
    this.addChild(this.a, this.b, this.c);
  }

  update(t: number, credits: number): void {
    const on = blink(t, 1.33, 0.62);
    this.a.visible = on && credits < 1;
    this.b.visible = on && credits >= 1;
    this.c.visible = true;
  }
}

export interface ControlsState {
  readonly pressedId: string | null;
  readonly locked: boolean;
  readonly muted: boolean;
  readonly crt: boolean;
}

/** On-screen buttons: the strip (wide layout) is built once; the portrait pad is rebuilt when the canvas size changes. */
export class TouchControls extends Container {
  private wide: { spec: ButtonSpec; face: ButtonFace }[];
  private tall: { spec: ButtonSpec; face: ButtonFace }[] = [];
  private tallKey = '';
  private mode: LayoutMode = 'wide';
  constructor() {
    super();
    this.eventMode = 'none';
    this.wide = this.build(buttonsFor({ mode: 'wide', logicalW: W, logicalH: 240 }));
  }

  private build(specs: readonly ButtonSpec[]): { spec: ButtonSpec; face: ButtonFace }[] {
    return specs.map((spec) => {
      let scale = spec.h >= 70 ? 3 : spec.h >= 40 ? 2 : 1;
      while (scale > 1 && measureText(spec.label, scale) + 8 > spec.w) scale--;
      const face = new ButtonFace(spec.w, spec.h, spec.label, scale);
      face.position.set(spec.x, spec.y);
      this.addChild(face);
      return { spec, face };
    });
  }

  setFit(fit: Fit): void {
    this.mode = fit.mode;
    for (const b of this.wide) b.face.visible = fit.mode === 'wide';
    if (fit.mode === 'tall') {
      const key = `${fit.logicalW}x${fit.logicalH}`;
      if (key !== this.tallKey) {
        this.tallKey = key;
        for (const b of this.tall) b.face.destroy({ children: true });
        this.tall = this.build(buttonsFor(fit));
      }
    }
    for (const b of this.tall) b.face.visible = fit.mode === 'tall';
  }

  update(view: SessionView, st: ControlsState): void {
    for (const { spec, face } of this.mode === 'wide' ? this.wide : this.tall) {
      const a = spec.action;
      let style: ButtonStyle;
      let text = spec.label;
      if (spec.utility) {
        const on = a.kind === 'mute' ? !st.muted : st.crt;
        style = on ? STYLE_ON : STYLE_OFF;
        if (a.kind === 'mute') text = this.mode === 'tall' ? (st.muted ? 'SOUND OFF' : 'SOUND ON') : st.muted ? 'MUTE' : 'SND';
      } else if (a.kind === 'deal') {
        // while an animation plays, DEAL turns into SKIP (Space / tap skips it)
        text = st.locked ? 'SKIP' : dealLabel(view);
        style = st.locked || isEnabled(a, view) ? STYLE_ON : STYLE_OFF;
      } else {
        style = !st.locked && isEnabled(a, view) ? STYLE_ON : STYLE_OFF;
      }
      if (st.pressedId === spec.id) style = STYLE_PRESSED;
      face.setStyle(style);
      face.setText(text);
    }
  }
}

