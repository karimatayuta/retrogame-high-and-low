/**
 * Turn the session's instant results (events + view) into a timed presentation script.
 * Pure data: the event player runs the resulting Stage list one after another and ignores
 * game commands meanwhile. No rules here, only "what to show, for how long, with what sound".
 */
import type { Card } from '@/domain/cards';
import type { GameEvent } from '@/application/events';
import type { SessionView } from '@/application/view';
import type { HandRank } from '@/domain/enums';
import { PALETTE } from '@/presentation/palette';
import type { SfxName } from '@/presentation/chiptune';

export interface SlotVis {
  readonly card: Card | null;
  readonly up: boolean;
  /** false: empty dashed slot */
  readonly present: boolean;
}

export const EMPTY_SLOT: SlotVis = Object.freeze({ card: null, up: false, present: false });

export interface Banner {
  readonly text: string;
  readonly sub?: string;
  readonly color: number;
  readonly alt: number;
  readonly scale: number;
}

export interface Stage {
  /** null: no card change (banner only) */
  readonly targets: readonly SlotVis[] | null;
  readonly highlight: number | null;
  readonly fast: boolean;
  /** after this stage's cards settle, show the result (hand name, WIN, menu ...) */
  readonly reveal: boolean;
  /** seconds to stay after the cards settled */
  readonly hold: number;
  readonly banner: Banner | null;
  /** played when the stage begins */
  readonly startSfx: SfxName | null;
  /** played when the cards settled */
  readonly sfx: SfxName | null;
  readonly flash: number | null;
  /** faster marquee + confetti */
  readonly celebrate: boolean;
  /** extra big burst (jackpot) */
  readonly big: boolean;
  readonly shake: boolean;
}

const stage = (p: Partial<Stage>): Stage => ({
  targets: null,
  highlight: null,
  fast: false,
  reveal: false,
  hold: 0,
  banner: null,
  startSfx: null,
  sfx: null,
  flash: null,
  celebrate: false,
  big: false,
  shake: false,
  ...p,
});

export const FREE_GAME_PAUSE = 0.6;

const PICK_PHASES = new Set(['STANDARD_PICK', 'RED_BLACK_PICK']);

/** Events that start a presentation sequence (the others play a sound at once). */
const SEQUENCE_KINDS = new Set<GameEvent['kind']>([
  'DEAL',
  'FREE_GAME_STEP',
  'DOUBLE_START',
  'DOUBLE_WIN',
  'DOUBLE_LOSE',
  'DOUBLE_DRAW',
  'HIGH_LOW_STEP',
  'COLLECT',
  'AUTO_SETTLED',
]);

const TOP_HANDS = new Set<HandRank>(['FIVE OF A KIND', 'ROYAL FLUSH', 'STRAIGHT FLUSH', 'FOUR OF A KIND', 'FULL HOUSE']);

export function targetsFromView(view: SessionView): SlotVis[] {
  const picking = PICK_PHASES.has(view.phase);
  return view.cards.map((card, i): SlotVis => {
    if (card !== null) return { card, up: view.faceUp[i] ?? false, present: true };
    return picking ? { card: null, up: false, present: true } : EMPTY_SLOT;
  });
}

export function targetsFromCards(cards: readonly Card[]): SlotVis[] {
  return Array.from({ length: 5 }, (_, i): SlotVis => {
    const card = cards[i];
    return card ? { card, up: true, present: true } : EMPTY_SLOT;
  });
}

export const isSequence = (events: readonly GameEvent[]): boolean => events.some((e) => SEQUENCE_KINDS.has(e.kind));

/** The immediate sound of an event that is not part of a sequence (null: silent / handled by a stage). */
export function immediateSfx(e: GameEvent): SfxName | null {
  switch (e.kind) {
    case 'BET':
      return 'bet';
    case 'CREDITS_ADDED':
      return 'addMedals';
    case 'REJECTED':
      return 'reject';
    case 'HALF_DOUBLE_TOGGLED':
      return 'button';
    default:
      return null;
  }
}

/** Presentation script for one command's events. `view` is the state afterwards. */
export function planStages(events: readonly GameEvent[], view: SessionView): Stage[] {
  const by = new Map<GameEvent['kind'], GameEvent>();
  for (const e of events) by.set(e.kind, e); // last one wins; fine for single-use lookups
  const has = (k: GameEvent['kind']): boolean => by.has(k);
  const fast = has('FREE_GAME_STEP');
  const stages: Stage[] = [];

  const draw = by.get('DOUBLE_DRAW');
  if (draw) {
    stages.push(
      stage({
        targets: targetsFromCards(draw.cards),
        highlight: draw.index,
        hold: 0.7,
        sfx: 'draw',
        banner: { text: 'DRAW', sub: 'PICK AGAIN', color: PALETTE.CYAN, alt: PALETTE.BLUE, scale: 3 },
      }),
    );
  }

  let hold = 0.13;
  let sfx: SfxName | null = null;
  let celebrate = false;
  let shake = false;
  const hand = by.get('HAND');
  if (has('NO_WIN')) hold = 0.23;
  if (hand && hand.amount > 0 && !fast) {
    hold = 0.57;
    sfx = view.handRank && TOP_HANDS.has(view.handRank) ? 'bigWin' : 'win';
    celebrate = true;
  }
  if (fast) {
    hold = 0.1;
    if (hand && hand.amount > 0 && view.handRank !== null && view.handRank !== 'NOTHING') {
      sfx = 'win';
      hold = 0.17;
    }
  }
  if (has('DOUBLE_WIN')) {
    hold = 0.57;
    sfx = 'doubleWin';
    celebrate = true;
  }
  if (has('DOUBLE_LOSE')) {
    hold = 0.77;
    sfx = 'doubleLose';
    shake = true;
  }
  if (has('DOUBLE_START')) hold = 0.37;
  stages.push(
    stage({
      targets: targetsFromView(view),
      highlight: view.highlight,
      fast,
      reveal: true,
      hold,
      startSfx: has('HIGH_LOW_STEP') ? 'highLowStep' : null,
      sfx,
      celebrate,
      shake,
    }),
  );

  const start = by.get('DOUBLE_START');
  if (start) {
    stages.push(
      stage({
        hold: 0.43,
        banner: { text: 'DOUBLE UP', sub: `${start.detail}  STAKE ${money(start.amount)}`, color: PALETTE.CARD_FACE, alt: PALETTE.CYAN, scale: 3 },
        sfx: 'button',
      }),
    );
  }
  const won = by.get('PROGRESSIVE_WON');
  if (won) {
    stages.push(
      stage({
        hold: 1.83,
        banner: { text: 'JACKPOT!', sub: `${won.detail}  ${money(won.amount)}`, color: PALETTE.GOLD, alt: PALETTE.CARD_RED, scale: 4 },
        sfx: 'bigWin',
        flash: PALETTE.GOLD,
        celebrate: true,
        big: true,
      }),
    );
  }
  const awarded = events.filter((e) => e.kind === 'FREE_GAME_AWARDED');
  const last = awarded[awarded.length - 1];
  if (last) {
    stages.push(
      fast
        ? stage({
            hold: 0.83,
            banner: { text: 'EXTRA GAMES', sub: `+${last.amount} GAMES  ${last.detail}`, color: PALETTE.CYAN, alt: PALETTE.CARD_FACE, scale: 3 },
            sfx: 'freeGameStart',
            flash: PALETTE.CYAN,
          })
        : stage({
            hold: 1.5,
            banner: { text: 'FREE GAME', sub: `${last.amount} GAMES  ${last.detail}`, color: PALETTE.CYAN, alt: PALETTE.CARD_FACE, scale: 4 },
            sfx: 'freeGameStart',
            flash: PALETTE.CYAN,
            celebrate: true,
          }),
    );
  }
  const end = by.get('FREE_GAME_END');
  if (end) {
    stages.push(
      stage({
        hold: 1.17,
        banner: { text: 'FREE GAME END', sub: `TOTAL WIN ${money(end.amount)}`, color: PALETTE.GOLD, alt: PALETTE.ORANGE, scale: 3 },
        sfx: 'win',
        celebrate: true,
      }),
    );
  }
  const bonus = by.get('HIGH_LOW_BONUS');
  if (bonus) {
    stages.push(
      stage({
        hold: 1.5,
        banner: { text: 'SPECIAL BONUS', sub: `${bonus.detail}  +${money(bonus.amount)}`, color: PALETTE.GOLD, alt: PALETTE.CARD_RED, scale: 3 },
        sfx: 'bigWin',
        flash: PALETTE.GOLD,
        celebrate: true,
        big: true,
      }),
    );
  }
  if (has('JOKER')) {
    stages.push(
      stage({
        hold: 1.33,
        banner: { text: 'JOKER!', sub: 'AUTO COLLECT', color: PALETTE.GOLD, alt: PALETTE.CARD_FACE, scale: 4 },
        sfx: 'joker',
        flash: PALETTE.CARD_FACE,
        celebrate: true,
      }),
    );
  }
  return stages;
}

export function money(n: number): string {
  return String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * The view as it should look right now: results (hand name, WIN, menu, hold labels ...)
 * stay hidden until the cards are revealed.
 */
export function maskView(view: SessionView, winShown: number): SessionView {
  return {
    ...view,
    handRank: null,
    paidLine: null,
    win: winShown,
    message: '',
    menu: [],
    holdLabels: ['', '', '', '', ''],
    canCollect: false,
    paytable: view.paytable.map((r) => (r.hit ? { ...r, hit: false } : r)),
    highLow: view.highLow && { ...view.highLow, bonusHand: null, active: false },
  };
}
