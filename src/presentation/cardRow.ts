/**
 * The five-card row and its animations (slide-in deal, scaleX flips, reveals).
 * The session changes state instantly; this class owns what is *shown*. Sprites are
 * created once and reused; `start()` builds one GSAP timeline per change.
 */
import gsap from 'gsap';
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { CardTextures } from '@/presentation/cardArt';
import { CARD_H, CARD_W, HIGHLIGHT_PAD } from '@/presentation/cardPixels';
import type { SfxName } from '@/presentation/chiptune';
import { CARDS_Y, slotX } from '@/presentation/layout';
import { PALETTE } from '@/presentation/palette';
import { FAST, NORMAL, planRow, SLOTS, type SlotAnim } from '@/presentation/cardRowPlan';
import { EMPTY_SLOT, type SlotVis } from '@/presentation/stages';

interface Slot {
  readonly sprite: Sprite;
  readonly empty: Graphics;
}

export class CardRow extends Container {
  private vis: SlotVis[] = Array.from({ length: SLOTS }, () => EMPTY_SLOT);
  private targets: readonly SlotVis[] = this.vis;
  private highlightIndex: number | null = null;
  private pendingHighlight: number | null = null;
  private tl: gsap.core.Timeline | null = null;
  private readonly slots: Slot[] = [];
  private readonly frame: Sprite;
  /** Set by the owner: false mutes the deal/flip ticks (used while skipping). */
  play: (name: SfxName) => void = () => undefined;

  constructor(private readonly tex: CardTextures) {
    super();
    for (let i = 0; i < SLOTS; i++) {
      const empty = new Graphics();
      drawDashedRect(empty, CARD_W, CARD_H);
      empty.position.set(slotX(i), CARDS_Y);
      const sprite = new Sprite(tex.back);
      sprite.anchor.set(0.5, 0);
      sprite.position.set(slotX(i) + CARD_W / 2, CARDS_Y);
      sprite.visible = false;
      this.addChild(empty, sprite);
      this.slots.push({ sprite, empty });
    }
    this.frame = new Sprite(tex.highlight);
    this.frame.visible = false;
    this.addChild(this.frame);
    this.syncAll();
  }

  get busy(): boolean {
    return this.tl !== null;
  }

  get hasCards(): boolean {
    return this.vis.some((v) => v.present);
  }

  /** Jump to the settled state without animation (start-up, resync). */
  set(targets: readonly SlotVis[], highlight: number | null): void {
    this.killTimeline();
    this.vis = [...targets];
    this.targets = targets;
    this.highlightIndex = highlight;
    this.pendingHighlight = highlight;
    this.syncAll();
  }

  /** Begin animating towards `targets` (finishes any running animation first). Returns the timeline. */
  start(targets: readonly SlotVis[], highlight: number | null, fast: boolean): gsap.core.Timeline {
    this.finish();
    const timing = fast ? FAST : NORMAL;
    const plan = planRow(this.vis, targets, 0, timing);
    this.targets = targets;
    this.pendingHighlight = highlight;
    if (plan.anims.every((a) => a === null)) {
      this.set(targets, highlight);
      return gsap.timeline();
    }
    this.highlightIndex = null;
    const tl = gsap.timeline({ onComplete: () => this.settle(tl) });
    this.tl = tl;
    plan.anims.forEach((a, i) => {
      if (a) this.scheduleSlot(tl, i, a, timing.slide, timing.flip);
    });
    for (const s of plan.sounds) tl.call(() => this.play(s.sfx), undefined, s.at);
    tl.set({}, {}, plan.end); // pad to the end
    this.syncHighlight();
    // slots that change at once (removed cards) are applied immediately at t=0 via their anim
    return tl;
  }

  /** Jump to the settled state of the running animation. */
  finish(): void {
    const tl = this.tl;
    if (!tl) return;
    tl.progress(1); // fires onComplete -> settle()
    if (this.tl === tl) this.settle(tl);
  }

  private settle(tl: gsap.core.Timeline): void {
    if (this.tl !== tl) return;
    this.tl = null;
    tl.kill();
    this.vis = [...this.targets];
    this.highlightIndex = this.pendingHighlight;
    this.syncAll();
  }

  private killTimeline(): void {
    if (this.tl) {
      this.tl.kill();
      this.tl = null;
    }
  }

  private scheduleSlot(tl: gsap.core.Timeline, i: number, a: SlotAnim, slide: number, flip: number): void {
    const { sprite, empty } = this.slots[i] as Slot;
    const cx = slotX(i) + CARD_W / 2;
    const t = a.target;
    const show = (tx: Texture | null): void => {
      empty.visible = tx === null;
      sprite.visible = tx !== null;
      if (tx) sprite.texture = tx;
      sprite.scale.x = 1;
      sprite.x = cx;
      sprite.alpha = 1;
    };
    // before it appears: whatever was there
    this.applyVis(i, a.prev);
    if (!a.reveal) {
      if (!t.present) {
        tl.call(() => show(null), undefined, a.appearAt);
        return;
      }
      tl.call(
        () => {
          show(this.tex.back);
          sprite.x = cx + 60;
          sprite.alpha = 0.2;
        },
        undefined,
        a.appearAt,
      );
      tl.to(sprite, { x: cx, alpha: 1, duration: slide, ease: 'power2.out' }, a.appearAt);
    }
    if (a.flipAt !== null && t.card) {
      const face = this.tex.face(t.card);
      const half = flip / 2;
      tl.to(sprite.scale, { x: 0, duration: half, ease: 'power1.in' }, a.flipAt);
      tl.call(() => (sprite.texture = face), undefined, a.flipAt + half);
      tl.to(sprite.scale, { x: 1, duration: half, ease: 'power1.out' }, a.flipAt + half);
    }
  }

  private applyVis(i: number, v: SlotVis): void {
    const { sprite, empty } = this.slots[i] as Slot;
    sprite.scale.x = 1;
    sprite.alpha = 1;
    sprite.x = slotX(i) + CARD_W / 2;
    if (!v.present) {
      empty.visible = true;
      sprite.visible = false;
    } else {
      empty.visible = false;
      sprite.visible = true;
      sprite.texture = v.up && v.card ? this.tex.face(v.card) : this.tex.back;
    }
  }

  private syncAll(): void {
    for (let i = 0; i < SLOTS; i++) this.applyVis(i, this.vis[i] as SlotVis);
    this.syncHighlight();
  }

  private syncHighlight(): void {
    const i = this.highlightIndex;
    const ok = i !== null && i >= 0 && i < SLOTS && (this.vis[i] as SlotVis).present;
    this.frame.visible = ok;
    if (ok) this.frame.position.set(slotX(i) - HIGHLIGHT_PAD, CARDS_Y - HIGHLIGHT_PAD);
  }
}

function drawDashedRect(g: Graphics, w: number, h: number): void {
  const color = PALETTE.FELT_LIGHT;
  const dash = 3;
  for (let x = 0; x < w; x += dash * 2) {
    const len = Math.min(dash, w - x);
    g.rect(x, 0, len, 1).fill(color).rect(x, h - 1, len, 1).fill(color);
  }
  for (let y = 0; y < h; y += dash * 2) {
    const len = Math.min(dash, h - y);
    g.rect(0, y, 1, len).fill(color).rect(w - 1, y, 1, len).fill(color);
  }
}
