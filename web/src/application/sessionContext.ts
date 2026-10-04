/** The machine's extended state (context), its initial value and the save-data bridge. */
import type { Card } from '@/domain/cards';
import type { GameConfig } from '@/domain/config';
import type { HandRank, FreeGameTrigger, PayLine, ProgressiveLine } from '@/domain/enums';
import { PROGRESSIVE_LINES } from '@/domain/enums';
import type { HighLowGame, HighLowStep } from '@/domain/doubleDown/highLow';
import type { RedBlackDouble } from '@/domain/doubleDown/redBlack';
import type { StandardDouble } from '@/domain/doubleDown/standard';
import { ProgressivePool } from '@/domain/progressive';
import type { Randomizer } from '@/domain/random';
import type { SaveRepository } from './ports';
import { EMPTY_STATS, parseSaveData, type SaveData, type Stats } from './saveData';
import { CARD_SLOTS } from './view';

export interface SessionInput {
  readonly config: GameConfig;
  readonly rng: Randomizer;
  readonly saveRepository: SaveRepository;
  /** What `saveRepository.load()` returned (null = nothing / unreadable). Re-validated here (D12). */
  readonly saved: SaveData | null;
}

/** Result of the last double down pick/guess; read by the routing (transient) states. */
export type DuelResult = 'WIN' | 'LOSE' | 'DRAW' | 'CONTINUE' | 'FINISHED';

export interface SessionContext {
  // dependencies
  readonly config: GameConfig;
  readonly rng: Randomizer;
  readonly saveRepository: SaveRepository;
  /** Mutable domain entity (counters change in place). */
  readonly pool: ProgressivePool;

  // money
  readonly credits: number;
  /** pending bet (BETTING) or the bet of the running game */
  readonly bet: number;
  readonly lastBet: number;
  /** pending win; during a double game: the amount at risk */
  readonly win: number;
  readonly lastPayout: number;
  readonly stats: Stats;
  /** short message that overrides the default one */
  readonly notice: string;

  // what is drawn
  readonly slots: readonly (Card | null)[];
  readonly faceUp: readonly boolean[];
  readonly highlight: number | null;
  readonly handRank: HandRank | null;
  readonly paidLine: PayLine | null;
  readonly gamePayout: number;
  readonly currentHand: readonly Card[];

  // free game
  readonly fgTrigger: FreeGameTrigger | null;
  readonly fgLeft: number;
  readonly fgPlayed: number;
  readonly fgTotal: number;

  // double down (mutable domain games live here while their phase is active)
  readonly halfDouble: boolean;
  readonly standard: StandardDouble | null;
  readonly redBlack: RedBlackDouble | null;
  /** stays after the game so the screen can show its bonus result */
  readonly highLow: HighLowGame | null;
  readonly highLowStep: HighLowStep | null;
  /** standard draw: collecting is not allowed */
  readonly drawPending: boolean;
  readonly duel: DuelResult | null;
}

const empty = <T>(v: T): readonly T[] => Array.from({ length: CARD_SLOTS }, () => v);

/**
 * Corrupt saved values must never crash start-up (D12): keep only finite,
 * non-negative counters of real progressive lines; an unusable save means defaults.
 */
/** Sane restored counters: finite, >= 0, clamped to the payout cap (tampered saves must not show 1e306 / Infinity). */
export function usableProgressive(saved: SaveData, cap: number): Partial<Record<ProgressiveLine, number>> {
  const out: Partial<Record<ProgressiveLine, number>> = {};
  const raw = saved.progressive as Readonly<Record<string, unknown>>;
  for (const line of PROGRESSIVE_LINES) {
    const v = Object.hasOwn(raw, line) ? raw[line] : undefined;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[line] = Math.min(v, cap);
  }
  return out;
}

export function createInitialContext(input: SessionInput): SessionContext {
  const { config } = input;
  const saved = input.saved === null ? null : parseSaveData(input.saved);
  let pool: ProgressivePool;
  try {
    pool = new ProgressivePool(config.progressive, saved ? usableProgressive(saved, config.doubleDown.payoutCap) : {});
  } catch {
    pool = new ProgressivePool(config.progressive);
  }
  return {
    config,
    rng: input.rng,
    saveRepository: input.saveRepository,
    pool,
    credits: saved ? saved.credits : config.economy.initialCredits,
    bet: 0,
    lastBet: 0,
    win: 0,
    lastPayout: 0,
    stats: saved ? saved.stats : EMPTY_STATS,
    notice: '',
    slots: empty<Card | null>(null),
    faceUp: empty(false),
    highlight: null,
    handRank: null,
    paidLine: null,
    gamePayout: 0,
    currentHand: [],
    fgTrigger: null,
    fgLeft: 0,
    fgPlayed: 0,
    fgTotal: 0,
    halfDouble: false,
    standard: null,
    redBlack: null,
    highLow: null,
    highLowStep: null,
    drawPending: false,
    duel: null,
  };
}

/**
 * Data to persist. `refundBet`: the pending bet of an undealt BETTING phase is
 * given back (it was only deducted for show; closing the page must not eat it).
 */
export function buildSaveData(ctx: SessionContext, refundBet: boolean): SaveData {
  return {
    version: 1,
    credits: ctx.credits + (refundBet ? ctx.bet : 0),
    progressive: ctx.pool.snapshot(),
    stats: ctx.stats,
  };
}
