/**
 * View models: everything the screen needs, so presentation never calls domain logic.
 * Port of `application/view.py` (camelCase, readonly). Built by `toView` (toView.ts).
 */
import type { Card } from '@/domain/cards';
import type {
  DoubleDownKind,
  DoubleDownMenuItem,
  HandRank,
  PayLine,
  ProgressiveLine,
} from '@/domain/enums';

export const CARD_SLOTS = 5;

export const SESSION_PHASES = [
  'BETTING',
  'FREE_GAME',
  'DOUBLE_SELECT',
  'STANDARD_PICK',
  'RED_BLACK_PICK',
  'HIGH_LOW_GUESS',
] as const;
export type SessionPhase = (typeof SESSION_PHASES)[number];

/** One pay table row, already priced for the current bet. */
export interface PaytableRowView {
  readonly line: PayLine;
  readonly label: string;
  readonly payout: number;
  /** payout is the live progressive counter (MAX BET only). */
  readonly progressive: boolean;
  /** this row paid in the last evaluated game. */
  readonly hit: boolean;
}

export interface FreeGameAwardView {
  /** e.g. "3 R/B FACES" */
  readonly label: string;
  readonly games: number;
}

/** One double down menu item (HOLD 1..5 after a win). */
export interface MenuItemView {
  readonly item: DoubleDownMenuItem;
  readonly label: string;
  readonly enabled: boolean;
  /** HALF DOUBLE toggled on. */
  readonly selected: boolean;
}

export interface BonusRowView {
  readonly label: string;
  readonly multiplier: number;
  /** main game BET x multiplier */
  readonly amount: number;
}

export interface HighLowView {
  /** waiting for HIGH / LOW */
  readonly active: boolean;
  readonly roundsWon: number;
  readonly roundsTotal: number;
  readonly currentAmount: number;
  /** amount if the next guess wins (capped) */
  readonly nextAmount: number;
  readonly bonusRows: readonly BonusRowView[];
  /** set when all rounds were won */
  readonly bonusHand: string | null;
  readonly bonusAmount: number;
  /** HighLowOutcome value once finished */
  readonly outcome: string | null;
}

export interface SessionView {
  readonly phase: SessionPhase;
  /** short English message line */
  readonly message: string;
  readonly credits: number;
  /** pending bet in BETTING, the game's bet otherwise */
  readonly bet: number;
  readonly lastBet: number;
  readonly maxBet: number;
  /** pending win (amount at risk during a double game) */
  readonly win: number;
  /** medals moved to CREDITS by the last settlement */
  readonly lastPayout: number;
  /** five card slots (null = empty) */
  readonly cards: readonly (Card | null)[];
  readonly faceUp: readonly boolean[];
  /** slot to emphasise (picked card / last revealed) */
  readonly highlight: number | null;
  // last evaluated game
  readonly handRank: HandRank | null;
  readonly paidLine: PayLine | null;
  readonly gamePayout: number;
  // free game
  readonly inFreeGame: boolean;
  readonly freeGameTrigger: string | null;
  readonly freeGamesLeft: number;
  readonly freeGamesPlayed: number;
  /** awarded so far, retriggers included */
  readonly freeGameTotal: number;
  /** accumulated win of the free game session (0 outside FREE_GAME) */
  readonly freeGameWin: number;
  // tables
  readonly paytable: readonly PaytableRowView[];
  /** display (ceil) values of the live progressive counters */
  readonly progressive: Readonly<Record<ProgressiveLine, number>>;
  readonly freeGameAwards: readonly FreeGameAwardView[];
  // double down
  readonly doubleKind: DoubleDownKind | null;
  readonly halfDouble: boolean;
  /** 5 items in DOUBLE_SELECT, otherwise empty */
  readonly menu: readonly MenuItemView[];
  readonly highLow: HighLowView | null;
  /** labels under HOLD 1..5 */
  readonly holdLabels: readonly [string, string, string, string, string];
  readonly canCollect: boolean;
}
