/**
 * Game steps: small named functions that do the domain-heavy work of one machine action.
 *
 * Each step takes the current context and the event and returns a `StepResult`:
 * a context patch, the game events to emit (in order) and whether to save.
 * The machine wraps them with `act()` (gameActions.ts). Port of the private
 * methods of Python `GameSession`; the money flow is kept line by line.
 */
import { standardDeck, type Card } from '@/domain/cards';
import { applyCap, canDouble, canHalfDouble, splitHalf } from '@/domain/doubleDown/common';
import { HighLowGame } from '@/domain/doubleDown/highLow';
import { RedBlackDouble } from '@/domain/doubleDown/redBlack';
import { StandardDouble } from '@/domain/doubleDown/standard';
import type { DoubleDownKind, DoubleDownMenuItem, HighLowGuess } from '@/domain/enums';
import { detectFreeGame } from '@/domain/freeGame';
import { evaluateHand } from '@/domain/hand';
import { settleMainGame } from '@/domain/payout';
import type { SessionEvent } from './commands';
import { gameEvent, type EventKind, type GameEvent } from './events';
import type { SessionContext } from './sessionContext';
import { CARD_SLOTS, type SessionPhase } from './view';

export interface StepResult {
  readonly patch?: Partial<SessionContext>;
  readonly events?: readonly GameEvent[];
  /** `true`: save the state; `'refundBet'`: save with the undealt bet given back. */
  readonly save?: boolean | 'refundBet';
}

export type Step = (ctx: SessionContext, event: SessionEvent) => StepResult;

// ---------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------

/** The HOLD button number (1..5) of a HOLD command, or null when it is not a valid one. */
export function holdNumber(event: { readonly type: string }): number | null {
  if (event.type !== 'HOLD') return null;
  const n: unknown = (event as { n?: unknown }).n;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/** HIGH / LOW from a GUESS command or from the mapped HOLD button (config: LOW = 2, HIGH = 4). */
export function highLowGuessOf(ctx: SessionContext, event: SessionEvent): HighLowGuess | null {
  if (event.type === 'GUESS') {
    const g: unknown = event.guess;
    return g === 'HIGH' || g === 'LOW' ? g : null;
  }
  const n = holdNumber(event);
  if (n === null) return null;
  const dd = ctx.config.doubleDown;
  if (n === dd.highLowLowHold) return 'LOW';
  if (n === dd.highLowHighHold) return 'HIGH';
  return null;
}

/** Whether a double down menu item can be chosen now. */
export function isItemEnabled(ctx: SessionContext, item: DoubleDownMenuItem): boolean {
  const dd = ctx.config.doubleDown;
  if (item === 'TAKE SCORE') return true;
  if (item === 'HALF DOUBLE') return canHalfDouble(ctx.win, dd);
  if (!canDouble(ctx.win, dd)) return false;
  if (item === 'HIGH & LOW') return !ctx.halfDouble || dd.halfDoubleAllowedInHighLow;
  return true;
}

/** The game's bet is spent, the pending win is gone; back to BETTING. */
function finishPatch(ctx: SessionContext): Partial<SessionContext> {
  return {
    lastBet: ctx.bet || ctx.lastBet,
    bet: 0,
    win: 0,
    halfDouble: false,
    drawPending: false,
    standard: null,
    redBlack: null,
    duel: null,
    // the HIGH & LOW object stays so the screen can show its bonus result
  };
}

function creditPatch(ctx: SessionContext, amount: number): Partial<SessionContext> {
  return {
    credits: ctx.credits + amount,
    stats: {
      ...ctx.stats,
      totalWon: ctx.stats.totalWon + amount,
      biggestWin: Math.max(ctx.stats.biggestWin, amount),
    },
  };
}

/** Move `amount` to CREDITS, record it, go back to BETTING. */
function settle(ctx: SessionContext, amount: number, kind: EventKind, before: readonly GameEvent[] = []): StepResult {
  return {
    patch: { ...creditPatch(ctx, amount), ...finishPatch(ctx), lastPayout: amount, notice: 'YOU WIN' },
    events: [...before, gameEvent(kind, amount)],
    save: true,
  };
}

// ---------------------------------------------------------------------------
// BETTING
// ---------------------------------------------------------------------------

function takeBet(ctx: SessionContext, amount: number): Partial<SessionContext> {
  return { credits: ctx.credits - amount, bet: ctx.bet + amount, notice: '' };
}

/** 1 BET: one more medal leaves CREDITS at once. */
export const betOne: Step = (ctx) => ({
  patch: takeBet(ctx, 1),
  events: [gameEvent('BET', 1)],
});

/** MAX BET: pay only what is missing up to the max (the DEAL follows). */
export const betMissing: Step = (ctx) => {
  const missing = ctx.config.bet.maxBet - ctx.bet;
  return missing > 0
    ? { patch: takeBet(ctx, missing), events: [gameEvent('BET', missing)] }
    : { patch: { notice: '' } };
};

/** DEAL with no bet: bet the previous amount again (D10). */
export const betForDeal: Step = (ctx) =>
  ctx.bet === 0
    ? { patch: takeBet(ctx, ctx.lastBet), events: [gameEvent('BET', ctx.lastBet)] }
    : { patch: { notice: '' } };

export const addMedals: Step = (ctx) => {
  const amount = ctx.config.economy.addMedalsAmount;
  return { patch: { credits: ctx.credits + amount }, events: [gameEvent('CREDITS_ADDED', amount)], save: 'refundBet' };
};

// ---------------------------------------------------------------------------
// the paid main game and free games
// ---------------------------------------------------------------------------

/** Shuffle, deal five cards and settle them with the bet of the running game. */
function dealAndEvaluate(
  ctx: SessionContext,
  freeGame: boolean,
): { patch: Partial<SessionContext>; events: GameEvent[]; amount: number; hand: readonly Card[] } {
  const deck = standardDeck(ctx.config.mainDeckJokers);
  ctx.rng.shuffle(deck);
  const hand = deck.slice(0, CARD_SLOTS);
  const rank = evaluateHand(hand);
  const payout = settleMainGame(rank, ctx.bet, ctx.pool, ctx.config, { freeGame });
  const events = [gameEvent('HAND', payout.amount, rank)];
  if (payout.progressiveLine !== null) events.push(gameEvent('PROGRESSIVE_WON', payout.amount, payout.progressiveLine));
  return {
    patch: {
      currentHand: hand,
      slots: hand,
      faceUp: hand.map(() => true),
      highlight: null,
      handRank: rank,
      paidLine: payout.line,
      gamePayout: payout.amount,
    },
    events,
    amount: payout.amount,
    hand,
  };
}

/** Deal five cards for a paid game and evaluate them (spec: メインゲーム). */
export const dealMainGame: Step = (ctx) => {
  const bet = ctx.bet;
  const events: GameEvent[] = [gameEvent('DEAL', bet)];
  // Counters grow before evaluation, so a win pays the value including this game (D3).
  if (bet === ctx.config.bet.maxBet) ctx.pool.addMaxBetGame();
  const dealt = dealAndEvaluate(ctx, false);
  events.push(...dealt.events);
  const patch: Partial<SessionContext> = {
    ...dealt.patch,
    stats: { ...ctx.stats, gamesPlayed: ctx.stats.gamesPlayed + 1, totalBet: ctx.stats.totalBet + bet },
    highLow: null, // forget the previous HIGH & LOW result on screen
    highLowStep: null,
    win: dealt.amount,
    fgTrigger: null,
    fgLeft: 0,
    fgTotal: 0,
    fgPlayed: 0,
  };
  const trigger = detectFreeGame(dealt.hand, ctx.config.freeGame);
  if (trigger !== null) {
    const games = ctx.config.freeGame.awards[trigger];
    Object.assign(patch, { fgTrigger: trigger, fgLeft: games, fgTotal: games });
    events.push(gameEvent('FREE_GAME_AWARDED', games, trigger));
  }
  return { patch, events };
};

/** One free game: no bet, payout x2 (min BET), added to the pending win (capped). */
export const playFreeGame: Step = (ctx) => {
  const cfg = ctx.config;
  if (cfg.progressive.incrementInFreeGame && ctx.bet === cfg.bet.maxBet) ctx.pool.addMaxBetGame();
  const dealt = dealAndEvaluate(ctx, true);
  const events = [...dealt.events, gameEvent('FREE_GAME_STEP', dealt.amount)];
  let left = ctx.fgLeft - 1;
  let total = ctx.fgTotal;
  const trigger = detectFreeGame(dealt.hand, cfg.freeGame);
  if (trigger !== null) {
    // retrigger: games are added (D2)
    const games = cfg.freeGame.awards[trigger];
    left += games;
    total += games;
    events.push(gameEvent('FREE_GAME_AWARDED', games, trigger));
  }
  return {
    patch: {
      ...dealt.patch,
      fgLeft: left,
      fgTotal: total,
      fgPlayed: ctx.fgPlayed + 1,
      stats: { ...ctx.stats, freeGamesPlayed: ctx.stats.freeGamesPlayed + 1 },
      win: applyCap(ctx.win + dealt.amount, cfg.doubleDown),
    },
    events,
  };
};

export const endFreeGame: Step = (ctx) => ({ events: [gameEvent('FREE_GAME_END', ctx.win)] });

/** Paid game without any payout. */
export const finishNoWin: Step = (ctx) => ({
  patch: { ...finishPatch(ctx), notice: 'NO WIN' },
  events: [gameEvent('NO_WIN')],
  save: true,
});

/** Back to BETTING with nothing to pay (only reachable if the free game min payout is switched off). */
export const finishGame: Step = (ctx) => ({ patch: finishPatch(ctx), save: true });

// ---------------------------------------------------------------------------
// pending win -> double down menu / settlement
// ---------------------------------------------------------------------------

export const capWin: Step = (ctx) => ({ patch: { win: applyCap(ctx.win, ctx.config.doubleDown) } });

/** Entering DOUBLE_SELECT: a clean slate for the menu. */
export const prepareMenu: Step = () => ({
  patch: { halfDouble: false, standard: null, redBlack: null, drawPending: false, duel: null },
});

export const collectWin: Step = (ctx) => settle(ctx, ctx.win, 'COLLECT');
export const autoSettle: Step = (ctx) => settle(ctx, ctx.win, 'AUTO_SETTLED');

export const loseGame: Step = (ctx) => ({
  patch: { ...finishPatch(ctx), lastPayout: 0, notice: 'YOU LOSE' },
  save: true,
});

/** HIGH & LOW: COLLECT takes the current amount. */
export const collectHighLow: Step = (ctx) => settle(ctx, requireHighLow(ctx).collect(), 'COLLECT');

export const toggleHalfDouble: Step = (ctx) => {
  const halfDouble = !ctx.halfDouble;
  return { patch: { halfDouble }, events: [gameEvent('HALF_DOUBLE_TOGGLED', 0, halfDouble ? 'ON' : 'OFF')] };
};

// ---------------------------------------------------------------------------
// starting a double game
// ---------------------------------------------------------------------------

/** Half double: the kept half goes to CREDITS now; the rest is the stake (D9). */
function beginStake(ctx: SessionContext): { stake: number; patch: Partial<SessionContext>; save: boolean } {
  let stake = ctx.win;
  let credited: Partial<SessionContext> = {};
  if (ctx.halfDouble) {
    const split = splitHalf(ctx.win);
    stake = split.stake;
    credited = creditPatch(ctx, split.kept);
  }
  return {
    stake,
    save: ctx.halfDouble,
    patch: {
      ...credited,
      win: stake,
      halfDouble: false,
      standard: null,
      redBlack: null,
      highLow: null,
      highLowStep: null,
      drawPending: false,
      notice: '',
      highlight: null,
      duel: null,
    },
  };
}

function dealerOnly(dealer: Card): Pick<SessionContext, 'slots' | 'faceUp'> {
  return { slots: [dealer, null, null, null, null], faceUp: [true, false, false, false, false] };
}

function started(stake: number, kind: DoubleDownKind): GameEvent {
  return gameEvent('DOUBLE_START', stake, kind);
}

export const startStandard: Step = (ctx) => {
  const { stake, patch, save } = beginStake(ctx);
  const standard = new StandardDouble(stake, ctx.config.doubleDown, ctx.rng);
  return { patch: { ...patch, standard, ...dealerOnly(standard.dealerCard) }, events: [started(stake, 'STANDARD')], save };
};

export const startRedBlack: Step = (ctx) => {
  const { stake, patch, save } = beginStake(ctx);
  const redBlack = new RedBlackDouble(stake, ctx.config.doubleDown, ctx.rng);
  return { patch: { ...patch, redBlack, ...dealerOnly(redBlack.dealerCard) }, events: [started(stake, 'RED & BLACK')], save };
};

export const startHighLow: Step = (ctx) => {
  const { stake, patch, save } = beginStake(ctx);
  const highLow = new HighLowGame(stake, ctx.bet, ctx.config.doubleDown, ctx.rng);
  return { patch: { ...patch, highLow, ...highLowSlots(highLow) }, events: [started(stake, 'HIGH & LOW')], save };
};

// ---------------------------------------------------------------------------
// STANDARD / RED & BLACK
// ---------------------------------------------------------------------------

function revealed(cards: readonly Card[], index: number): Partial<SessionContext> {
  return { slots: cards, faceUp: cards.map(() => true), highlight: index, notice: '' };
}

function doubleWon(shown: Partial<SessionContext>, payout: number, cards: readonly Card[]): StepResult {
  return { patch: { ...shown, win: payout, duel: 'WIN' }, events: [gameEvent('DOUBLE_WIN', payout, '', -1, cards)] };
}

function doubleLost(shown: Partial<SessionContext>, cards: readonly Card[]): StepResult {
  return { patch: { ...shown, duel: 'LOSE' }, events: [gameEvent('DOUBLE_LOSE', 0, '', -1, cards)] };
}

/** Beat the dealer. DRAW: redeal and pick again, no collect (D8). */
export const pickStandard: Step = (ctx, event) => {
  const game = requireStandard(ctx);
  const index = (holdNumber(event) ?? 0) - 1; // card slot; HOLD 1 (the dealer) never gets here
  const result = game.pick(index);
  const shown = revealed(result.cards, index);
  if (result.outcome === 'DRAW') {
    game.redeal();
    // the revealed draw stays in the event; the view shows the fresh hand
    return {
      patch: { ...shown, ...dealerOnly(game.dealerCard), highlight: null, notice: 'DRAW - PICK AGAIN', drawPending: true, duel: 'DRAW' },
      events: [gameEvent('DOUBLE_DRAW', 0, '', index, result.cards)],
    };
  }
  return result.outcome === 'WIN' ? doubleWon(shown, result.payout, result.cards) : doubleLost(shown, result.cards);
};

export const pickRedBlack: Step = (ctx, event) => {
  const index = (holdNumber(event) ?? 0) - 1;
  const result = requireRedBlack(ctx).pick(index);
  const shown = revealed(result.cards, index);
  return result.won ? doubleWon(shown, result.payout, result.cards) : doubleLost(shown, result.cards);
};

// ---------------------------------------------------------------------------
// HIGH & LOW
// ---------------------------------------------------------------------------

function highLowSlots(game: HighLowGame): Pick<SessionContext, 'slots' | 'faceUp' | 'highlight'> {
  const history = game.history;
  return {
    slots: [...history, ...Array.from({ length: CARD_SLOTS - history.length }, () => null)],
    faceUp: Array.from({ length: CARD_SLOTS }, (_, i) => i < history.length),
    highlight: history.length - 1,
  };
}

export const guessHighLow: Step = (ctx, event) => {
  const game = requireHighLow(ctx);
  const guess = highLowGuessOf(ctx, event) as HighLowGuess; // the guard checked it
  const step = game.guess(guess);
  const last = game.history.length - 1;
  const events = [gameEvent('HIGH_LOW_STEP', step.amount, step.guess, last, [step.card])];
  const patch: Partial<SessionContext> = { ...highLowSlots(game), notice: '', highLowStep: step };
  if (step.outcome === 'LOSE') {
    events.push(gameEvent('DOUBLE_LOSE', 0, '', last, [step.card]));
    return { patch: { ...patch, win: 0, duel: 'LOSE' }, events };
  }
  if (!step.finished) {
    events.push(gameEvent('DOUBLE_WIN', step.amount));
    return { patch: { ...patch, win: step.amount, duel: 'CONTINUE' }, events };
  }
  return { patch: { ...patch, duel: 'FINISHED' }, events }; // finished by a win: settleHighLow pays
};

/** HIGH & LOW finished by a win (4 wins, joker, or above 5000): pay automatically. */
export const settleHighLow: Step = (ctx) => {
  const step = ctx.highLowStep;
  if (step === null || step.payout === null) throw new Error('settleHighLow without a finished step');
  const before: GameEvent[] = [];
  if (step.outcome === 'JOKER_END') before.push(gameEvent('JOKER'));
  else if (step.outcome === 'COMPLETED') before.push(gameEvent('HIGH_LOW_BONUS', step.bonus, step.bonusHand ?? 'NONE'));
  const result = settle(ctx, step.payout, 'AUTO_SETTLED', before);
  return step.outcome === 'JOKER_END' ? { ...result, patch: { ...result.patch, notice: 'JOKER!' } } : result;
};

// ---------------------------------------------------------------------------
// shutdown (D13) and rejection
// ---------------------------------------------------------------------------

/** Closing the page in BETTING: save with the undealt bet given back. */
export const saveWithRefund: Step = () => ({ save: 'refundBet' });

export function explainRejection(ctx: SessionContext, event: { readonly type: string }, phase: SessionPhase): string {
  const cmd = event.type;
  const why = ((): string => {
    switch (cmd) {
      case 'BET_ONE':
        if (phase !== 'BETTING') return 'not betting';
        return ctx.bet >= ctx.config.bet.maxBet ? 'already at max bet' : 'not enough credits';
      case 'MAX_BET':
        return phase !== 'BETTING' ? 'not betting' : 'not enough credits';
      case 'DEAL':
        return phase !== 'BETTING' ? 'not betting' : 'no bet and cannot repeat the last bet';
      case 'ADVANCE':
        return 'not in a free game';
      case 'ADD_MEDALS':
        return 'not betting';
      case 'DOUBLE':
        return phase === 'DOUBLE_SELECT' ? 'STANDARD is not available' : 'nothing to double';
      case 'GUESS':
        return phase === 'HIGH_LOW_GUESS' ? 'unknown guess' : 'not in HIGH & LOW';
      case 'COLLECT':
        return phase === 'STANDARD_PICK' && ctx.drawPending ? 'cannot collect after a draw' : `nothing to collect in ${phase}`;
      case 'HOLD': {
        const n = holdNumber(event);
        if (n === null) return `no such HOLD button: ${String((event as { n?: unknown }).n)}`;
        if (phase === 'DOUBLE_SELECT') return `${ctx.config.doubleDown.menu[n - 1] ?? '?'} is not available`;
        if (phase === 'STANDARD_PICK' || phase === 'RED_BLACK_PICK') return 'HOLD 1 is the dealer card';
        if (phase === 'HIGH_LOW_GUESS') return 'HOLD button unused in HIGH & LOW';
        return `HOLD does nothing in ${phase}`;
      }
      default:
        return 'unknown command';
    }
  })();
  return `${cmd}: ${why}`;
}

// ---------------------------------------------------------------------------

function requireStandard(ctx: SessionContext): StandardDouble {
  if (ctx.standard === null) throw new Error('no standard double game running');
  return ctx.standard;
}
function requireRedBlack(ctx: SessionContext): RedBlackDouble {
  if (ctx.redBlack === null) throw new Error('no red & black game running');
  return ctx.redBlack;
}
function requireHighLow(ctx: SessionContext): HighLowGame {
  if (ctx.highLow === null) throw new Error('no HIGH & LOW game running');
  return ctx.highLow;
}
