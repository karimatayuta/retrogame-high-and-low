/**
 * GameApp: the Pixi application (input -> session commands -> animated drawing).
 *
 * The session is instantaneous; this class keeps *display state* (card row, coin counters,
 * banners) separate, replays `drainEvents()` over time via the EventPlayer and locks game
 * commands while an animation plays (any press then skips/fast-forwards instead).
 */
import gsap from 'gsap';
import { Application, Container, Graphics } from 'pixi.js';
import type { GameSession } from '@/application/gameSession';
import type { SessionView } from '@/application/view';
import { chooseAction, mulberry32, type Rand } from '@/presentation/autoplay';
import { createCardTextures, type CardTextures } from '@/presentation/cardArt';
import { CardRow } from '@/presentation/cardRow';
import { createCrtFilters, setCrtEnabled, type CrtFilters } from '@/presentation/crt';
import { BannerLayer, Confetti, countDuration, Counter, Marquee, ScreenFlash } from '@/presentation/effects';
import { EventPlayer } from '@/presentation/eventPlayer';
import {
  actionForKey,
  isUiAction,
  toCommand,
  type Action,
} from '@/presentation/input';
import {
  CARDS_X0,
  CARDS_Y,
  computeFit,
  GAME_H,
  hitTest,
  toLogical,
  W,
  type Fit,
} from '@/presentation/layout';
import { PALETTE } from '@/presentation/palette';
import {
  Attract,
  BonusTable,
  FreeGameTable,
  HoldLabels,
  InfoRows,
  PayTable,
  StatusBox,
  TouchControls,
} from '@/presentation/panels';
import { applyPixelArtDefaults } from '@/presentation/pixelFont';
import { savePrefs, type Prefs } from '@/presentation/prefs';
import type { SoundBoard } from '@/presentation/sound';
import {
  immediateSfx,
  isSequence,
  maskView,
  money,
  planStages,
  targetsFromView,
} from '@/presentation/stages';
import { CARD_H } from '@/presentation/cardPixels';

export interface AppOptions {
  readonly session: GameSession;
  readonly sound: SoundBoard;
  readonly prefs: Prefs;
  /** `?autoplay=1`: the bot presses buttons itself. */
  readonly autoplay?: { readonly seed: number } | null;
  /** Buttons to press (through the normal path) once the screen is idle, e.g. a debug scene. */
  readonly script?: readonly Action[];
}

const FREE_GAME_PAUSE = 0.6;
const PRESS_FLASH = 0.14;

export class GameApp {
  private readonly pixi = new Application();
  private readonly root = new Container();
  private readonly world = new Container();
  private readonly canvasBg = new Graphics();
  private textures!: CardTextures;
  private crt!: CrtFilters;
  private row!: CardRow;
  private player!: EventPlayer;
  private payTable = new PayTable();
  private bonusTable = new BonusTable();
  private freeTable = new FreeGameTable();
  private status = new StatusBox();
  private holdLabels = new HoldLabels();
  private info = new InfoRows();
  private attract = new Attract();
  private controls = new TouchControls();
  private marquee = new Marquee();
  private banner = new BannerLayer(CARDS_Y + CARD_H / 2);
  private flash = new ScreenFlash();
  private confetti = new Confetti();
  private readonly credits = new Counter();
  private readonly win = new Counter();
  private creditsText = '0';
  private winText = '0';

  private view: SessionView;
  private fit!: Fit;
  private clock = 0;
  private fgReadyAt = -1;
  private creditsTarget = 0;
  private winTarget = 0;
  private pressed: { id: string; until: number } | null = null;
  private muted: boolean;
  private crtOn: boolean;
  private mask: { view: SessionView; win: number; out: SessionView } | null = null;
  private readonly rand: Rand | null;
  private nextAutoAt = 1;
  private script: Action[];
  private nextScriptAt = 0.8;
  private destroyed = false;

  constructor(private readonly opts: AppOptions) {
    this.view = opts.session.view();
    this.muted = opts.prefs.muted;
    this.crtOn = opts.prefs.crt;
    this.rand = opts.autoplay ? mulberry32(opts.autoplay.seed) : null;
    this.script = [...(opts.script ?? [])];
  }

  // ------------------------------------------------------------------ boot

  async start(host: HTMLElement): Promise<void> {
    applyPixelArtDefaults();
    const dpr = window.devicePixelRatio || 1;
    const size = viewportSize();
    this.fit = computeFit(size.w, size.h, dpr);
    await this.pixi.init({
      width: this.fit.cssW,
      height: this.fit.cssH,
      background: PALETTE.BG,
      antialias: false,
      resolution: dpr,
      autoDensity: true,
      roundPixels: true,
    });
    host.appendChild(this.pixi.canvas);
    this.pixi.canvas.style.touchAction = 'none';
    this.pixi.stage.addChild(this.root);

    this.textures = createCardTextures(this.pixi.renderer);
    this.textures.preload();
    this.buildScene();
    this.crt = createCrtFilters({ lineContrast: 0.06, noise: 0.01 });
    setCrtEnabled(this.root, this.crtOn, this.crt);
    this.opts.sound.setMuted(this.muted);
    this.applyFit();
    this.syncDisplay();
    this.bindInput();
    this.pixi.ticker.add((t) => this.tick(t.deltaMS / 1000));
  }

  private buildScene(): void {
    const bg = new Graphics().rect(0, 0, W, GAME_H).fill(PALETTE.FELT_DARK);
    const feltX = CARDS_X0 - 12;
    bg.rect(feltX, CARDS_Y - 4, 5 * 52 + 16, 70)
      .fill(PALETTE.FELT_LIGHT)
      .rect(feltX + 1, CARDS_Y - 3, 5 * 52 + 14, 68)
      .fill(PALETTE.FELT);
    this.row = new CardRow(this.textures);
    this.row.play = (n) => this.playSfx(n);
    this.player = new EventPlayer({
      row: this.row,
      banner: this.banner,
      flash: this.flash,
      confetti: this.confetti,
      now: () => this.clock,
      play: (n) => this.playSfx(n),
      shake: () => this.shake(),
      onRevealed: () => this.retargetCounters(),
      onIdle: () => this.onIdle(),
    });
    this.credits.onChange = (v) => (this.creditsText = money(v));
    this.win.onChange = (v) => (this.winText = money(v));
    this.credits.onTick = this.win.onTick = () => this.playSfx('countTick');
    this.world.addChild(
      bg,
      this.marquee,
      this.payTable,
      this.bonusTable,
      this.freeTable,
      this.status,
      this.row,
      this.attract,
      this.holdLabels,
      this.info,
      this.banner,
      this.confetti,
      this.flash,
    );
    this.root.addChild(this.canvasBg, this.world, this.controls);
  }

  // ------------------------------------------------------------------ layout / scaling

  private applyFit(): void {
    const f = this.fit;
    this.pixi.renderer.resize(f.cssW, f.cssH);
    this.root.scale.set(f.cssScale);
    this.controls.setFit(f);
    this.world.position.set(f.offsetX, f.offsetY);
    this.crt.crt.vignetting = f.mode === 'tall' ? 0.1 : 0.3;
    this.canvasBg.clear().rect(0, 0, f.logicalW, f.logicalH).fill(PALETTE.BG);
    this.pixi.canvas.parentElement?.setAttribute('data-mode', f.mode);
    // glass curvature warps small pixel text: only on big integer scales
    this.crt.crt.curvature = f.mode === 'wide' && f.deviceScale >= 3 ? 1.2 : 0;
  }

  resize(): void {
    if (this.destroyed) return;
    const size = viewportSize();
    const next = computeFit(size.w, size.h, window.devicePixelRatio || 1);
    const f = this.fit;
    if (next.cssW === f.cssW && next.cssH === f.cssH && next.mode === f.mode && next.cssScale === f.cssScale) return;
    this.fit = next;
    this.applyFit();
  }

  // ------------------------------------------------------------------ state

  get busy(): boolean {
    return this.player.busy || this.row.busy || this.credits.busy || this.win.busy;
  }

  /** Banner text currently on screen (tests / screenshots). */
  get bannerText(): string | null {
    return this.banner.text;
  }

  /** Nothing animating and no scripted presses left (tests / screenshots wait for this). */
  get settled(): boolean {
    return !this.busy && this.script.length === 0;
  }

  /** Jump the whole display to the session's current state (start-up, after pagehide shutdown). */
  syncDisplay(): void {
    this.player.reset();
    this.view = this.opts.session.view();
    this.opts.session.drainEvents();
    this.row.set(targetsFromView(this.view), this.view.highlight);
    this.credits.set(this.view.credits);
    this.win.set(this.view.win);
    this.creditsTarget = this.view.credits;
    this.winTarget = this.view.win;
    this.fgReadyAt = -1;
    this.mask = null;
  }

  /** Called when the page is being hidden for good: settle pending wins and save. */
  handlePageHide(): void {
    this.opts.session.shutdown();
    this.syncDisplay();
  }

  // ------------------------------------------------------------------ input

  private bindInput(): void {
    const canvas = this.pixi.canvas;
    window.addEventListener('keydown', this.onKey);
    canvas.addEventListener('pointerdown', this.onPointer);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('dblclick', (e) => e.preventDefault());
    window.addEventListener('resize', this.onResize);
    window.visualViewport?.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private onResize = (): void => this.resize();

  private onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = actionForKey(e.key);
    if (!action) return;
    e.preventDefault();
    this.opts.sound.unlock();
    if (e.repeat) return;
    this.press(action, idForAction(action));
  };

  private onPointer = (e: PointerEvent): void => {
    e.preventDefault();
    this.opts.sound.unlock();
    const box = this.pixi.canvas.getBoundingClientRect();
    const p = toLogical(e.clientX, e.clientY, box, this.fit);
    const target = hitTest(this.fit, p.x, p.y);
    if (target) this.press(target.action, target.id);
    else if (this.busy) this.skip(); // tap anywhere skips the animation
  };

  /** One button press from the keyboard, a tap or the bot. */
  press(action: Action, id: string | null = idForAction(action)): void {
    this.pressed = id ? { id, until: this.clock + PRESS_FLASH } : null;
    if (isUiAction(action)) {
      if (action.kind === 'crt') this.toggleCrt();
      else this.toggleMute();
      return;
    }
    if (this.busy) {
      this.skip();
      return;
    }
    const view = this.opts.session.view();
    if (view.phase === 'FREE_GAME' && action.kind !== 'deal') return; // runs by itself
    const cmd = toCommand(action, view);
    if (!cmd) return;
    this.opts.session.send(cmd);
    this.ingest();
  }

  private toggleCrt(): void {
    this.crtOn = !this.crtOn;
    setCrtEnabled(this.root, this.crtOn);
    this.savePrefs();
  }

  private toggleMute(): void {
    this.muted = !this.muted;
    this.opts.sound.setMuted(this.muted);
    if (!this.muted) this.opts.sound.play('button');
    this.savePrefs();
  }

  private savePrefs(): void {
    savePrefs({ muted: this.muted, crt: this.crtOn });
  }

  private playSfx(name: Parameters<SoundBoard['play']>[0]): void {
    this.opts.sound.play(name);
  }

  // ------------------------------------------------------------------ events -> stages

  private ingest(): void {
    const session = this.opts.session;
    const events = session.drainEvents();
    this.view = session.view();
    for (const e of events) {
      const sfx = immediateSfx(e);
      if (sfx) this.playSfx(sfx);
    }
    // betting takes medals at once (a quick count down)
    const v = this.view;
    if (v.credits < this.creditsTarget) {
      this.credits.to(v.credits, 0.1);
      this.creditsTarget = v.credits;
    }
    if (!isSequence(events)) {
      if (!this.player.busy) this.retargetCounters();
      return;
    }
    if (v.phase === 'FREE_GAME') this.fgReadyAt = -1;
    this.player.enqueue(planStages(events, v));
  }

  private retargetCounters(): void {
    const v = this.view;
    if (v.credits !== this.creditsTarget) {
      this.credits.to(v.credits, countDuration(this.credits.value, v.credits));
      this.creditsTarget = v.credits;
    }
    if (v.win !== this.winTarget) {
      this.win.to(v.win, countDuration(this.win.value, v.win));
      this.winTarget = v.win;
    }
  }

  private onIdle(): void {
    this.retargetCounters();
    if (this.view.phase === 'FREE_GAME' && this.fgReadyAt < 0) this.fgReadyAt = this.clock + FREE_GAME_PAUSE;
  }

  /** Fast-forward the running animation, banners and counters. */
  skip(): void {
    this.player.skip();
    this.row.finish();
    this.retargetCounters();
    this.credits.finish();
    this.win.finish();
    if (this.view.phase === 'FREE_GAME') this.fgReadyAt = this.clock;
  }

  private shake(): void {
    const w = this.world;
    gsap.killTweensOf(w);
    const bx = this.fit.offsetX;
    const by = this.fit.offsetY;
    w.position.set(bx, by);
    gsap.fromTo(
      w,
      { x: bx - 3, y: by + 1 },
      { x: bx, y: by, duration: 0.45, ease: 'elastic.out(1.2, 0.2)', onComplete: () => w.position.set(bx, by) },
    );
  }

  // ------------------------------------------------------------------ frame

  private tick(dt: number): void {
    this.clock += Math.min(dt, 0.1);
    const t = this.clock;
    if (this.crtOn) this.crt.update(dt * 1000);

    this.driveBots();
    if (this.view.phase === 'FREE_GAME' && !this.busy) {
      if (this.fgReadyAt < 0) this.fgReadyAt = t + FREE_GAME_PAUSE;
      if (t >= this.fgReadyAt) {
        this.fgReadyAt = -1;
        this.opts.session.send({ type: 'ADVANCE' });
        this.ingest();
      }
    }

    const shown = this.shownView();
    const hl = shown.highLow;
    const bonusShown = shown.phase === 'HIGH_LOW_GUESS' || (hl !== null && hl.bonusHand !== null);
    this.payTable.visible = !bonusShown;
    this.bonusTable.visible = bonusShown;
    if (bonusShown) this.bonusTable.update(shown, t);
    else this.payTable.update(shown, t);
    this.freeTable.update(shown);
    this.status.update(shown);
    const pressedId = this.pressed && t < this.pressed.until ? this.pressed.id : null;
    if (!pressedId) this.pressed = null;
    this.holdLabels.update(shown, pressedHold(pressedId));
    this.info.update(shown, t, this.creditsText, this.winText, this.win.value);
    const showAttract = !this.busy && shown.phase === 'BETTING' && shown.bet === 0 && !this.row.hasCards;
    this.attract.visible = showAttract;
    if (showAttract) this.attract.update(t, shown.credits);
    this.controls.update(shown, { pressedId, locked: this.busy, muted: this.muted, crt: this.crtOn });
    this.marquee.update(t, t < this.player.celebrateUntil);
    this.banner.update(t);
  }

  private shownView(): SessionView {
    if (!this.player.masked) return this.view;
    const m = this.mask;
    if (m && m.view === this.view && m.win === this.win.value) return m.out;
    const out = maskView(this.view, this.win.value);
    this.mask = { view: this.view, win: this.win.value, out };
    return out;
  }

  private driveBots(): void {
    const t = this.clock;
    if (this.script.length > 0 && t >= this.nextScriptAt && !this.busy) {
      const a = this.script.shift() as Action;
      this.nextScriptAt = t + 0.5;
      this.press(a);
      return;
    }
    const r = this.rand;
    if (!r || this.script.length > 0) return;
    if (this.busy) {
      if (r() < 0.012) this.skip(); // exercise the skip path now and then
      return;
    }
    if (t < this.nextAutoAt) return;
    this.nextAutoAt = t + 0.15 + r() * 0.45;
    const a = chooseAction(this.view, r);
    if (a) this.press(a);
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    window.visualViewport?.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.player.reset();
    this.pixi.destroy(true, { children: true });
    this.textures.destroy();
  }
}

/** Usable window size: the visual viewport minus the safe-area padding of #app. */
function viewportSize(): { w: number; h: number } {
  const vv = window.visualViewport;
  let w = Math.floor(vv?.width ?? window.innerWidth);
  let h = Math.floor(vv?.height ?? window.innerHeight);
  const host = document.getElementById('app');
  if (host) {
    const cs = getComputedStyle(host);
    w -= (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    h -= (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  }
  return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

/** Button id used for the "pressed" flash of an action. */
export function idForAction(a: Action): string | null {
  switch (a.kind) {
    case 'hold':
      return `hold${a.n}`;
    case 'bet':
      return 'bet';
    case 'maxBet':
      return 'max';
    case 'deal':
      return 'deal';
    case 'collect':
      return 'collect';
    case 'addMedals':
      return 'add';
    case 'mute':
      return 'sound';
    case 'crt':
      return 'crt';
    case 'high':
      return 'hold4';
    case 'low':
      return 'hold2';
  }
}

function pressedHold(id: string | null): number {
  const m = id ? /^(?:hold|label)([1-5])$/.exec(id) : null;
  return m ? Number(m[1]) : 0;
}

