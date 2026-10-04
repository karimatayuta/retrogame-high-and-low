/**
 * The game as an XState v5 state machine. States are the phases the screen can show;
 * the `dealing`, `freeGameStep`, `winCheck`, `standardResult`, `redBlackResult` and
 * `highLowResult` states are transient routers (they resolve in the same step and are
 * never visible to the presentation).
 *
 *   BETTING --BET_ONE--> BETTING            (bet deducted at once)
 *   BETTING --DEAL / MAX_BET--> dealing ─┬─ free game triggered ─▶ FREE_GAME
 *                                        ├─ paid ─▶ winCheck
 *                                        └─ no win ─▶ BETTING
 *   FREE_GAME --ADVANCE--> freeGameStep ─┬─ games left ─▶ FREE_GAME
 *                                        └─ done ─▶ winCheck
 *   winCheck ─┬─ win > 5000 ─▶ BETTING   (AUTO_SETTLED)
 *             ├─ win > 0 ─▶ DOUBLE_SELECT
 *             └─ nothing ─▶ BETTING
 *   DOUBLE_SELECT --HOLD 1..5 / DOUBLE--> STANDARD_PICK | HIGH_LOW_GUESS | RED_BLACK_PICK
 *                 --HOLD(TAKE SCORE) / COLLECT--> BETTING
 *   STANDARD_PICK --HOLD 2..5--> standardResult ─┬─ draw ─▶ STANDARD_PICK (redeal, no collect)
 *                                                ├─ win ─▶ winCheck
 *                                                └─ lose ─▶ BETTING
 *   RED_BLACK_PICK --HOLD 2..5--> redBlackResult ─┬─ win ─▶ winCheck └─ lose ─▶ BETTING
 *   HIGH_LOW_GUESS --HOLD LOW/HIGH, GUESS--> highLowResult ─┬─ win, go on ─▶ HIGH_LOW_GUESS
 *                                                           ├─ lose ─▶ BETTING
 *                                                           └─ finished ─▶ BETTING (AUTO_SETTLED)
 *   any pick state / HIGH_LOW_GUESS --COLLECT--> BETTING
 *   anything else, in any state ─▶ REJECTED event (state untouched, never throws)
 */
import { enqueueActions, setup } from 'xstate';
import type { SessionEvent } from './commands';
import { gameEvent } from './events';
import { act, phaseOf, type GameEmitted } from './gameActions';
import { createInitialContext, type SessionContext, type SessionInput } from './sessionContext';
import * as step from './steps';
import { holdNumber, highLowGuessOf, isItemEnabled } from './steps';
import type { DoubleDownMenuItem } from '@/domain/enums';
import { mustAutoSettle } from '@/domain/doubleDown/common';

/** The menu item the HOLD button stands for in DOUBLE_SELECT. */
function menuItemOf(ctx: SessionContext, event: SessionEvent): DoubleDownMenuItem | null {
  const n = holdNumber(event);
  return n === null ? null : (ctx.config.doubleDown.menu[n - 1] ?? null);
}

export const gameMachine = setup({
  types: {} as { context: SessionContext; events: SessionEvent; input: SessionInput; emitted: GameEmitted },
  guards: {
    // BETTING
    canBetOne: ({ context }) => context.bet < context.config.bet.maxBet && context.credits >= 1,
    canMaxBet: ({ context }) => context.config.bet.maxBet - context.bet <= context.credits,
    canDeal: ({ context }) => context.bet > 0 || (context.lastBet >= 1 && context.lastBet <= context.credits),
    // routing
    hasFreeGames: ({ context }) => context.fgLeft > 0,
    hasWin: ({ context }) => context.win > 0,
    mustAutoSettle: ({ context }) => mustAutoSettle(context.win, context.config.doubleDown),
    duelWon: ({ context }) => context.duel === 'WIN',
    duelDrew: ({ context }) => context.duel === 'DRAW',
    duelLost: ({ context }) => context.duel === 'LOSE',
    duelContinues: ({ context }) => context.duel === 'CONTINUE',
    // DOUBLE_SELECT
    menuItemChosen: ({ context, event }, params: { item: DoubleDownMenuItem }) =>
      menuItemOf(context, event) === params.item && isItemEnabled(context, params.item),
    canDoubleStandard: ({ context }) => isItemEnabled(context, 'STANDARD'),
    // pick states
    isPickHold: ({ event }) => (holdNumber(event) ?? 0) >= 2, // HOLD 1 is the dealer card
    canCollectNow: ({ context }) => !context.drawPending, // not right after a standard DRAW
    // HIGH_LOW_GUESS
    hasGuess: ({ context, event }) => highLowGuessOf(context, event) !== null,
  },
  actions: {
    betOne: act(step.betOne),
    betMissing: act(step.betMissing),
    betForDeal: act(step.betForDeal),
    addMedals: act(step.addMedals),
    saveWithRefund: act(step.saveWithRefund),
    dealMainGame: act(step.dealMainGame),
    finishNoWin: act(step.finishNoWin),
    finishGame: act(step.finishGame),
    playFreeGame: act(step.playFreeGame),
    endFreeGame: act(step.endFreeGame),
    capWin: act(step.capWin),
    prepareMenu: act(step.prepareMenu),
    collectWin: act(step.collectWin),
    autoSettle: act(step.autoSettle),
    loseGame: act(step.loseGame),
    toggleHalfDouble: act(step.toggleHalfDouble),
    startStandard: act(step.startStandard),
    startRedBlack: act(step.startRedBlack),
    startHighLow: act(step.startHighLow),
    pickStandard: act(step.pickStandard),
    pickRedBlack: act(step.pickRedBlack),
    guessHighLow: act(step.guessHighLow),
    settleHighLow: act(step.settleHighLow),
    collectHighLow: act(step.collectHighLow),
    reject: enqueueActions(({ context, event, self, enqueue }) => {
      if (event.type.startsWith('xstate.')) return; // internal events are not commands
      const detail = step.explainRejection(context, event, phaseOf(self.getSnapshot().value));
      enqueue.emit({ type: 'game', event: gameEvent('REJECTED', 0, detail) });
    }),
  },
}).createMachine({
  id: 'freeDealTwinJokers',
  context: ({ input }) => createInitialContext(input),
  initial: 'BETTING',
  on: { '*': { actions: 'reject' } }, // every command that no state accepts

  states: {
    BETTING: {
      on: {
        BET_ONE: { guard: 'canBetOne', actions: 'betOne' },
        MAX_BET: { guard: 'canMaxBet', target: 'dealing', actions: 'betMissing' },
        DEAL: { guard: 'canDeal', target: 'dealing', actions: 'betForDeal' },
        ADD_MEDALS: { actions: 'addMedals' },
        SHUTDOWN: { actions: 'saveWithRefund' },
      },
    },

    dealing: {
      entry: 'dealMainGame',
      always: [
        { guard: 'hasFreeGames', target: 'FREE_GAME' },
        { guard: 'hasWin', target: 'winCheck' },
        { target: 'BETTING', actions: 'finishNoWin' },
      ],
    },

    FREE_GAME: {
      on: { ADVANCE: { target: 'freeGameStep', actions: 'playFreeGame' } },
    },

    freeGameStep: {
      always: [
        { guard: 'hasFreeGames', target: 'FREE_GAME' },
        { target: 'winCheck', actions: 'endFreeGame' },
      ],
    },

    winCheck: {
      entry: 'capWin',
      always: [
        { guard: 'mustAutoSettle', target: 'BETTING', actions: 'autoSettle' },
        { guard: 'hasWin', target: 'DOUBLE_SELECT' },
        { target: 'BETTING', actions: 'finishGame' },
      ],
    },

    DOUBLE_SELECT: {
      entry: 'prepareMenu',
      on: {
        HOLD: [
          { guard: { type: 'menuItemChosen', params: { item: 'TAKE SCORE' } }, target: 'BETTING', actions: 'collectWin' },
          { guard: { type: 'menuItemChosen', params: { item: 'HALF DOUBLE' } }, actions: 'toggleHalfDouble' },
          { guard: { type: 'menuItemChosen', params: { item: 'STANDARD' } }, target: 'STANDARD_PICK', actions: 'startStandard' },
          { guard: { type: 'menuItemChosen', params: { item: 'HIGH & LOW' } }, target: 'HIGH_LOW_GUESS', actions: 'startHighLow' },
          { guard: { type: 'menuItemChosen', params: { item: 'RED & BLACK' } }, target: 'RED_BLACK_PICK', actions: 'startRedBlack' },
        ],
        DOUBLE: { guard: 'canDoubleStandard', target: 'STANDARD_PICK', actions: 'startStandard' },
        COLLECT: { target: 'BETTING', actions: 'collectWin' },
        SHUTDOWN: { target: 'BETTING', actions: 'collectWin' },
      },
    },

    STANDARD_PICK: {
      on: {
        HOLD: { guard: 'isPickHold', target: 'standardResult', actions: 'pickStandard' },
        COLLECT: { guard: 'canCollectNow', target: 'BETTING', actions: 'collectWin' },
        SHUTDOWN: { target: 'BETTING', actions: 'collectWin' },
      },
    },
    standardResult: {
      always: [
        { guard: 'duelDrew', target: 'STANDARD_PICK' },
        { guard: 'duelWon', target: 'winCheck' },
        { target: 'BETTING', actions: 'loseGame' },
      ],
    },

    RED_BLACK_PICK: {
      on: {
        HOLD: { guard: 'isPickHold', target: 'redBlackResult', actions: 'pickRedBlack' },
        COLLECT: { target: 'BETTING', actions: 'collectWin' },
        SHUTDOWN: { target: 'BETTING', actions: 'collectWin' },
      },
    },
    redBlackResult: {
      always: [
        { guard: 'duelWon', target: 'winCheck' },
        { target: 'BETTING', actions: 'loseGame' },
      ],
    },

    HIGH_LOW_GUESS: {
      on: {
        HOLD: { guard: 'hasGuess', target: 'highLowResult', actions: 'guessHighLow' },
        GUESS: { guard: 'hasGuess', target: 'highLowResult', actions: 'guessHighLow' },
        COLLECT: { target: 'BETTING', actions: 'collectHighLow' },
        SHUTDOWN: { target: 'BETTING', actions: 'collectHighLow' },
      },
    },
    highLowResult: {
      always: [
        { guard: 'duelContinues', target: 'HIGH_LOW_GUESS' },
        { guard: 'duelLost', target: 'BETTING', actions: 'loseGame' },
        { target: 'BETTING', actions: 'settleHighLow' },
      ],
    },
  },
});
