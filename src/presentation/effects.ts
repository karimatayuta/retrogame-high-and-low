/**
 * Small retro effects: count-up counters, screen flash, confetti/sparkles, marquee lights,
 * the centre banner. Objects are pooled / reused; nothing is created per frame.
 */
import gsap from 'gsap';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { GAME_H, W } from '@/presentation/layout';
import { PALETTE } from '@/presentation/palette';
import { createText, type PixelText } from '@/presentation/pixelFont';
import type { Banner } from '@/presentation/stages';

// ---------------------------------------------------------------- pure helpers

/** Seconds a count-up of `from -> to` takes (about 3 medals per 1/60 s, clamped). */
export function countDuration(from: number, to: number): number {
  const frames = Math.abs(to - from) / 3;
  return Math.min(1.5, Math.max(0.2, frames / 60));
}

/** True during the "on" part of a blink cycle. */
export function blink(t: number, period: number, duty = 0.5): boolean {
  return (((t % period) + period) % period) / period < duty;
}

// ---------------------------------------------------------------- counter

/** A number that counts towards a target with a GSAP tween; `onTick` fires while the value changes. */
export class Counter {
  value = 0;
  private tween: gsap.core.Tween | null = null;
  private lastTick = -1;
  private readonly state = { v: 0 };
  onChange: (v: number) => void = () => undefined;
  onTick: () => void = () => undefined;

  get busy(): boolean {
    return this.tween !== null;
  }

  set(v: number): void {
    this.stop();
    this.value = v;
    this.state.v = v;
    this.onChange(v);
  }

  to(target: number, duration: number): void {
    this.stop();
    if (target === this.value) return;
    this.state.v = this.value;
    this.tween = gsap.to(this.state, {
      v: target,
      duration,
      ease: 'none',
      onUpdate: () => {
        const n = Math.round(this.state.v);
        if (n === this.value) return;
        this.value = n;
        this.onChange(n);
        const now = performance.now();
        if (now - this.lastTick >= 55) {
          this.lastTick = now;
          this.onTick();
        }
      },
      onComplete: () => {
        this.tween = null;
        this.value = target;
        this.onChange(target);
      },
    });
  }

  /** Jump to the target now. */
  finish(): void {
    const t = this.tween;
    if (!t) return;
    t.progress(1);
    this.tween = null;
  }

  private stop(): void {
    this.tween?.kill();
    this.tween = null;
  }
}

// ---------------------------------------------------------------- flash

export class ScreenFlash extends Container {
  private readonly g = new Graphics().rect(0, 0, W, GAME_H).fill(0xffffff);
  constructor() {
    super();
    this.g.alpha = 0;
    this.addChild(this.g);
    this.eventMode = 'none';
  }

  trigger(color: number, duration = 0.2): void {
    gsap.killTweensOf(this.g);
    this.g.tint = color;
    this.g.alpha = 0.35;
    gsap.to(this.g, { alpha: 0, duration, ease: 'power1.out' });
  }

  clear(): void {
    gsap.killTweensOf(this.g);
    this.g.alpha = 0;
  }
}

// ---------------------------------------------------------------- confetti & sparkles

function sparkleTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 5;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(2, 0, 1, 5);
    ctx.fillRect(0, 2, 5, 1);
  }
  const t = Texture.from(c);
  t.source.scaleMode = 'nearest';
  return t;
}

const CONFETTI_COLORS = [PALETTE.GOLD, PALETTE.ORANGE, PALETTE.CYAN, PALETTE.CARD_RED, PALETTE.TEXT, PALETTE.CARD_FACE] as const;

export class Confetti extends Container {
  private readonly free: Sprite[] = [];
  private readonly all: Sprite[] = [];
  private readonly spark: Texture;

  constructor(poolSize = 90) {
    super();
    this.eventMode = 'none';
    this.spark = sparkleTexture();
    for (let i = 0; i < poolSize; i++) {
      const s = new Sprite(Texture.WHITE);
      s.visible = false;
      this.addChild(s);
      this.free.push(s);
      this.all.push(s);
    }
  }

  private take(): Sprite | null {
    return this.free.pop() ?? null;
  }

  private release(s: Sprite): void {
    s.visible = false;
    this.free.push(s);
  }

  /** Paper bits raining down from the top of the screen. */
  rain(count: number, area: { x: number; y: number; w: number } = { x: 0, y: -4, w: W }): void {
    for (let i = 0; i < count; i++) {
      const s = this.take();
      if (!s) return;
      const size = 2 + Math.floor(Math.random() * 2);
      s.texture = Texture.WHITE;
      s.tint = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] as number;
      s.width = size;
      s.height = size + 1;
      s.alpha = 1;
      s.visible = true;
      const x0 = area.x + Math.random() * area.w;
      s.position.set(x0, area.y - Math.random() * 20);
      const dur = 1.1 + Math.random() * 0.9;
      gsap.to(s, { y: GAME_H + 6, duration: dur, ease: 'power1.in', delay: Math.random() * 0.4 });
      gsap.to(s, {
        x: x0 + (Math.random() - 0.5) * 50,
        duration: dur,
        ease: 'sine.inOut',
        delay: 0,
        onComplete: () => this.release(s),
      });
    }
  }

  /** Twinkling crosses at random spots of `area`. */
  sparkle(count: number, area: { x: number; y: number; w: number; h: number }): void {
    for (let i = 0; i < count; i++) {
      const s = this.take();
      if (!s) return;
      s.texture = this.spark;
      s.tint = Math.random() < 0.5 ? PALETTE.CARD_FACE : PALETTE.GOLD;
      s.scale.set(1);
      s.width = 5;
      s.height = 5;
      s.alpha = 0;
      s.visible = true;
      s.position.set(Math.round(area.x + Math.random() * area.w), Math.round(area.y + Math.random() * area.h));
      gsap.to(s, {
        alpha: 1,
        duration: 0.15,
        delay: Math.random() * 0.5,
        yoyo: true,
        repeat: 1,
        onComplete: () => this.release(s),
      });
    }
  }

  /** Stop everything at once (skip / resync). */
  clear(): void {
    for (const s of this.all) {
      gsap.killTweensOf(s);
      s.visible = false;
    }
    this.free.length = 0;
    this.free.push(...this.all);
  }
}

// ---------------------------------------------------------------- marquee

/** Border lights chasing around the screen (three phase groups; switching phases costs nothing). */
export class Marquee extends Container {
  private readonly groups: Graphics[] = [];
  private phase = -1;
  constructor() {
    super();
    this.eventMode = 'none';
    const spacing = 6;
    const dots: [number, number][] = [];
    for (let x = 2; x <= W - 4; x += spacing) dots.push([x, 1]);
    for (let y = 2 + spacing; y <= GAME_H - 4; y += spacing) dots.push([W - 3, y]);
    for (let x = W - 3 - spacing; x >= 2; x -= spacing) dots.push([x, GAME_H - 3]);
    for (let y = GAME_H - 3 - spacing; y > 2; y -= spacing) dots.push([1, y]);
    const dim = new Graphics();
    for (const [x, y] of dots) dim.rect(x, y, 2, 2).fill(PALETTE.FELT);
    this.addChild(dim);
    for (let g = 0; g < 3; g++) {
      const gr = new Graphics();
      dots.forEach(([x, y], i) => {
        if (i % 3 === g) gr.rect(x, y, 2, 2).fill(PALETTE.GOLD);
      });
      gr.visible = false;
      this.addChild(gr);
      this.groups.push(gr);
    }
  }

  update(t: number, fast: boolean): void {
    const phase = Math.floor(t * (fast ? 14 : 4)) % 3;
    if (phase === this.phase) return;
    this.phase = phase;
    this.groups.forEach((g, i) => (g.visible = i === phase));
  }
}

// ---------------------------------------------------------------- banner

/** Centre band over the card row ("FREE GAME", "JACKPOT!" ...). */
export class BannerLayer extends Container {
  private readonly band = new Container();
  private readonly bg = new Graphics();
  private readonly title: PixelText[] = [];
  private readonly sub = createText('', { align: 'center' });
  private readonly subBox = new Graphics();
  private current: Banner | null = null;
  private scaleKey = 0;
  private tween: gsap.core.Tween | null = null;

  constructor(private readonly centerY: number) {
    super();
    this.eventMode = 'none';
    this.visible = false;
    this.band.addChild(this.bg, this.subBox, this.sub);
    this.addChild(this.band);
  }

  /** Text of the banner on screen (null: none). */
  get text(): string | null {
    return this.visible ? (this.current?.text ?? null) : null;
  }

  show(b: Banner): void {
    this.current = b;
    const sc = Math.max(1, Math.round(b.scale));
    const subH = b.sub ? 14 : 0;
    const h = 12 + 5 * sc + subH;
    this.bg.clear().rect(0, 0, W, h).fill({ color: PALETTE.BG, alpha: 0.9 }).rect(0, 0, W, 1).fill(PALETTE.GOLD).rect(0, h - 1, W, 1).fill(PALETTE.GOLD);
    let t = this.title[sc];
    if (!t) {
      t = createText('', { scale: sc, align: 'center', shadow: PALETTE.BLACK });
      this.title[sc] = t;
      this.band.addChild(t);
    }
    for (const other of this.title) if (other) other.visible = other === t;
    t.setText(b.text);
    t.setColor(b.color);
    t.position.set(W / 2, 6);
    this.scaleKey = sc;
    this.subBox.visible = this.sub.visible = !!b.sub;
    if (b.sub) {
      this.sub.setText(b.sub);
      const sw = this.sub.textWidth + 10;
      this.subBox.clear().rect(0, 0, sw, 10).fill(PALETTE.FELT_LIGHT).rect(1, 1, sw - 2, 8).fill(PALETTE.BG);
      this.subBox.position.set(Math.floor((W - sw) / 2), 6 + 5 * sc + 4);
      this.sub.position.set(W / 2, 6 + 5 * sc + 4 + 3);
      this.sub.setColor(PALETTE.CARD_FACE);
    }
    // pop-in: grow from the centre line
    this.band.pivot.set(0, h / 2);
    this.band.position.set(0, this.centerY);
    this.band.scale.y = 0.1;
    this.visible = true;
    this.tween?.kill();
    this.tween = gsap.to(this.band.scale, { y: 1, duration: 0.1, ease: 'power2.out' });
  }

  hide(): void {
    this.tween?.kill();
    this.tween = null;
    this.visible = false;
    this.current = null;
  }

  update(t: number): void {
    const b = this.current;
    if (!b) return;
    const t0 = this.title[this.scaleKey];
    t0?.setColor(blink(t, 0.23) ? b.color : b.alt);
  }
}
