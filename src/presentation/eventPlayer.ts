/**
 * Plays Stage lists one after another with GSAP. The session has already advanced; this
 * class decides how long the screen takes to catch up and keeps results masked until the
 * cards are revealed. `skip()` fast-forwards everything (Space / tap).
 */
import gsap from 'gsap';
import type { SfxName } from '@/presentation/chiptune';
import type { BannerLayer, Confetti, ScreenFlash } from '@/presentation/effects';
import type { CardRow } from '@/presentation/cardRow';
import type { Stage } from '@/presentation/stages';
import { CARDS_Y } from '@/presentation/layout';
import { CARD_H } from '@/presentation/cardPixels';

export interface PlayerHost {
  readonly row: CardRow;
  readonly banner: BannerLayer;
  readonly flash: ScreenFlash;
  readonly confetti: Confetti;
  /** Current clock in seconds. */
  now(): number;
  play(name: SfxName): void;
  shake(): void;
  /** The results of the last evaluated game are now visible (counters should run). */
  onRevealed(): void;
  /** Nothing left to play. */
  onIdle(): void;
}

export class EventPlayer {
  private queue: Stage[] = [];
  private current: Stage | null = null;
  private tl: gsap.core.Timeline | null = null;
  private settledStage: Stage | null = null;
  private pendingReveal = 0;
  private skipping = false;
  celebrateUntil = 0;

  constructor(private readonly host: PlayerHost) {}

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  /** Results (hand name, WIN, menu ...) stay hidden while cards are still being revealed. */
  get masked(): boolean {
    return this.pendingReveal > 0;
  }

  get isSkipping(): boolean {
    return this.skipping;
  }

  enqueue(stages: readonly Stage[]): void {
    for (const s of stages) {
      if (s.reveal) this.pendingReveal++;
      this.queue.push(s);
    }
    this.pump();
  }

  /** Fast-forward: finish the running stage and every queued one. */
  skip(): void {
    if (!this.busy) return;
    this.skipping = true;
    try {
      for (let guard = 0; this.current !== null && guard < 1000; guard++) {
        const tl = this.tl;
        if (tl) {
          tl.progress(1);
          if (this.tl === tl) this.end(tl);
        } else {
          this.current = null;
          this.pump();
        }
      }
      this.host.row.finish();
    } finally {
      this.skipping = false;
    }
  }

  /** Drop everything (resync after the session changed behind our back). */
  reset(): void {
    this.queue = [];
    this.tl?.kill();
    this.tl = null;
    this.current = null;
    this.settledStage = null;
    this.pendingReveal = 0;
    this.celebrateUntil = 0;
    this.host.banner.hide();
    this.host.confetti.clear();
    this.host.flash.clear();
  }

  private pump(): void {
    if (this.current) return;
    const st = this.queue.shift();
    if (!st) {
      this.pendingReveal = 0;
      this.host.onIdle();
      return;
    }
    this.begin(st);
  }

  private begin(st: Stage): void {
    this.current = st;
    this.settledStage = null;
    const { row } = this.host;
    if (st.startSfx) this.play(st.startSfx);
    const tl = gsap.timeline({ onComplete: () => this.end(tl) });
    this.tl = tl;
    let t = 0;
    if (st.targets) {
      const rowTl = row.start(st.targets, st.highlight, st.fast);
      tl.add(rowTl, 0);
      t = rowTl.duration();
    }
    tl.call(() => this.settle(st), undefined, t);
    if (st.big && !this.skipping) {
      tl.call(() => this.burst(true), undefined, t + 0.6);
      tl.call(() => this.burst(true), undefined, t + 1.2);
    }
    tl.set({}, {}, t + st.hold);
  }

  private settle(st: Stage): void {
    if (this.settledStage === st) return;
    this.settledStage = st;
    const h = this.host;
    if (st.reveal) {
      this.pendingReveal = Math.max(0, this.pendingReveal - 1);
      if (this.pendingReveal === 0) h.onRevealed();
    }
    if (st.sfx) this.play(st.sfx);
    if (st.banner) h.banner.show(st.banner);
    if (this.skipping) return; // no effects while fast-forwarding
    if (st.flash !== null) h.flash.trigger(st.flash, 0.25);
    if (st.shake) h.shake();
    if (st.celebrate) {
      this.celebrateUntil = h.now() + 2.5;
      this.burst(st.big);
    }
  }

  private burst(big: boolean): void {
    if (this.skipping) return;
    const c = this.host.confetti;
    c.rain(big ? 40 : 18);
    c.sparkle(big ? 14 : 6, { x: 24, y: CARDS_Y - 6, w: 272, h: CARD_H + 12 });
  }

  private end(tl: gsap.core.Timeline): void {
    if (this.tl !== tl) return;
    const st = this.current;
    if (st && this.settledStage !== st) this.settle(st); // skipped before the callback ran
    this.host.banner.hide();
    this.tl = null;
    tl.kill();
    this.current = null;
    this.pump();
  }

  private play(name: SfxName): void {
    if (!this.skipping) this.host.play(name);
  }
}
