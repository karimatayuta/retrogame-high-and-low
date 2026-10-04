/** Context -> SessionView: everything the screen needs, built here so presentation never calls domain logic. */
import { applyCap } from '@/domain/doubleDown/common';
import { PAY_LINES, PROGRESSIVE_LINES, isProgressiveLine, type DoubleDownKind, type ProgressiveLine } from '@/domain/enums';
import type { SessionContext } from './sessionContext';
import { isItemEnabled } from './steps';
import {
  type BonusRowView,
  type FreeGameAwardView,
  type HighLowView,
  type MenuItemView,
  type PaytableRowView,
  type SessionPhase,
  type SessionView,
} from './view';

const DOUBLE_KIND: Partial<Record<SessionPhase, DoubleDownKind>> = {
  STANDARD_PICK: 'STANDARD',
  RED_BLACK_PICK: 'RED & BLACK',
  HIGH_LOW_GUESS: 'HIGH & LOW',
};

export function toView(ctx: SessionContext, phase: SessionPhase): SessionView {
  const inFreeGame = phase === 'FREE_GAME';
  return {
    phase,
    message: message(ctx, phase),
    credits: ctx.credits,
    bet: ctx.bet,
    lastBet: ctx.lastBet,
    maxBet: ctx.config.bet.maxBet,
    win: ctx.win,
    lastPayout: ctx.lastPayout,
    cards: ctx.slots,
    faceUp: ctx.faceUp,
    highlight: ctx.highlight,
    handRank: ctx.handRank,
    paidLine: ctx.paidLine,
    gamePayout: ctx.gamePayout,
    inFreeGame,
    freeGameTrigger: ctx.fgTrigger,
    freeGamesLeft: ctx.fgLeft,
    freeGamesPlayed: ctx.fgPlayed,
    freeGameTotal: ctx.fgTotal,
    freeGameWin: inFreeGame ? ctx.win : 0,
    paytable: paytableRows(ctx, inFreeGame),
    progressive: progressiveDisplay(ctx),
    freeGameAwards: Object.entries(ctx.config.freeGame.awards).map(
      ([label, games]): FreeGameAwardView => ({ label, games }),
    ),
    doubleKind: DOUBLE_KIND[phase] ?? null,
    halfDouble: ctx.halfDouble,
    menu: menuView(ctx, phase),
    highLow: highLowView(ctx, phase),
    holdLabels: holdLabels(ctx, phase),
    canCollect: canCollect(ctx, phase),
  };
}

function message(ctx: SessionContext, phase: SessionPhase): string {
  switch (phase) {
    case 'FREE_GAME':
      return `FREE GAME ${ctx.fgPlayed}/${ctx.fgTotal}`;
    case 'DOUBLE_SELECT':
      return 'DOUBLE UP?';
    case 'STANDARD_PICK':
    case 'RED_BLACK_PICK':
      return ctx.notice || 'PICK A CARD';
    case 'HIGH_LOW_GUESS':
      return ctx.notice || 'HIGH OR LOW?';
    case 'BETTING':
      if (ctx.notice) return ctx.notice;
      if (ctx.bet > 0) return 'PRESS DEAL';
      return ctx.credits < 1 ? 'NO CREDITS - ADD MEDALS' : 'PLACE YOUR BET';
  }
}

function canCollect(ctx: SessionContext, phase: SessionPhase): boolean {
  if (phase === 'DOUBLE_SELECT' || phase === 'HIGH_LOW_GUESS') return true;
  if (phase === 'STANDARD_PICK' || phase === 'RED_BLACK_PICK') return !ctx.drawPending;
  return false;
}

function progressiveDisplay(ctx: SessionContext): Record<ProgressiveLine, number> {
  const out = {} as Record<ProgressiveLine, number>;
  for (const line of PROGRESSIVE_LINES) out[line] = ctx.pool.displayValue(line);
  return out;
}

/** Pay table priced for the bet on screen (x2 during free games). */
function paytableRows(ctx: SessionContext, inFreeGame: boolean): PaytableRowView[] {
  const cfg = ctx.config;
  const bet = ctx.bet || ctx.lastBet || cfg.bet.minBet;
  const atMax = bet === cfg.bet.maxBet;
  const factor = inFreeGame ? cfg.freeGame.payoutMultiplier : 1;
  return PAY_LINES.map((line) => {
    const progressive = atMax && isProgressiveLine(line);
    let payout: number;
    if (progressive) payout = ctx.pool.displayValue(line);
    else if (atMax) payout = cfg.paytable.maxBetPayouts[line];
    else payout = bet * cfg.paytable.multipliers[line];
    return { line, label: line, payout: payout * factor, progressive, hit: line === ctx.paidLine };
  });
}

function menuView(ctx: SessionContext, phase: SessionPhase): MenuItemView[] {
  if (phase !== 'DOUBLE_SELECT') return [];
  return ctx.config.doubleDown.menu.map((item) => ({
    item,
    label: item,
    enabled: isItemEnabled(ctx, item),
    selected: item === 'HALF DOUBLE' && ctx.halfDouble,
  }));
}

function holdLabels(ctx: SessionContext, phase: SessionPhase): SessionView['holdLabels'] {
  const dd = ctx.config.doubleDown;
  if (phase === 'DOUBLE_SELECT') return dd.menu as unknown as SessionView['holdLabels'];
  if (phase === 'STANDARD_PICK' || phase === 'RED_BLACK_PICK') return ['', 'PICK', 'PICK', 'PICK', 'PICK'];
  if (phase === 'HIGH_LOW_GUESS') {
    const labels: [string, string, string, string, string] = ['', '', '', '', ''];
    labels[dd.highLowLowHold - 1] = 'LOW';
    labels[dd.highLowHighHold - 1] = 'HIGH';
    return labels;
  }
  return ['', '', '', '', ''];
}

function highLowView(ctx: SessionContext, phase: SessionPhase): HighLowView | null {
  const game = ctx.highLow;
  if (game === null) return null;
  const dd = ctx.config.doubleDown;
  const bonusRows: BonusRowView[] = Object.entries(dd.highLowBonus)
    .filter(([hand]) => hand !== 'NONE')
    .map(([label, multiplier]) => ({ label, multiplier, amount: game.mainBet * multiplier }));
  return {
    active: phase === 'HIGH_LOW_GUESS',
    roundsWon: game.roundsWon,
    roundsTotal: dd.highLowRounds,
    currentAmount: game.amount,
    nextAmount: applyCap(game.amount * 2, dd),
    bonusRows,
    bonusHand: game.bonusHand,
    bonusAmount: game.bonus,
    outcome: game.outcome,
  };
}
