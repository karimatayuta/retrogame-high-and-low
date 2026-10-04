/**
 * Every tunable rule value lives here (spec: 「仮の値はすべて設定に置く」).
 *
 * Values marked 仮 / 推定 in the spec are commented. To change a rule, change
 * the value here or pass overrides to {@link defineConfig} — no game logic may
 * hard-code these numbers.
 */
import {
  DOUBLE_DOWN_MENU_ITEMS,
  FREE_GAME_TRIGGERS,
  HIGH_LOW_BONUSES,
  PAY_LINES,
  PROGRESSIVE_LINES,
  type DoubleDownMenuItem,
  type FreeGameTrigger,
  type HighLowBonus,
  type HighLowDrawMode,
  type PayLine,
  type ProgressiveLine,
} from './enums';

export interface BetConfig {
  readonly minBet: number;
  /** MAX BET (confirmed). Progressive only at this bet. */
  readonly maxBet: number;
}

export interface PaytableConfig {
  /** 1..4 BET: payout = BET × multiplier (confirmed). */
  readonly multipliers: Readonly<Record<PayLine, number>>;
  /** MAX BET: fixed payout (progressive lines pay the counter instead). */
  readonly maxBetPayouts: Readonly<Record<PayLine, number>>;
}

export interface ProgressiveCounterConfig {
  readonly initial: number;
  /** Added per MAX BET game. Must have at most 3 decimals (stored in thousandths). */
  readonly increment: number;
}

export interface ProgressiveConfig {
  readonly counters: Readonly<Record<ProgressiveLine, ProgressiveCounterConfig>>;
  /** 仮: counters do not grow during free games. */
  readonly incrementInFreeGame: boolean;
}

export interface FreeGameConfig {
  /** Free games awarded (standard setting; spec gives the allowed range). */
  readonly awards: Readonly<Record<FreeGameTrigger, number>>;
  /** All payouts (incl. progressive) are multiplied in free games. */
  readonly payoutMultiplier: number;
  /** Even without a hand, BET medals are paid each free game (D1: needed for RTP 92.24%). */
  readonly minPayoutIsBet: boolean;
}

export interface DoubleDownConfig {
  /** 5,001+ cannot be doubled and is settled automatically. */
  readonly maxAmountToDouble: number;
  /** 振り切り. */
  readonly payoutCap: number;
  /** HOLD 1..5 (仮 except the centre). */
  readonly menu: readonly DoubleDownMenuItem[];
  readonly standardJokers: number; // 仮
  readonly redBlackJokers: number; // 仮 (colour game: no jokers)
  /** + stake × 8 on a flush (×10 total). */
  readonly redBlackFlushBonusMultiplier: number;
  readonly halfDoubleAllowedInHighLow: boolean; // 仮
  readonly highLowRounds: number;
  readonly highLowJokers: number; // 仮
  readonly highLowDrawMode: HighLowDrawMode; // 仮 default ARCADE
  readonly highLowWinProbability: number; // 仮 62/128 (unconfirmed)
  /** HOLD n (1-based) that means LOW / HIGH (仮). */
  readonly highLowLowHold: number;
  readonly highLowHighHold: number;
  /** Bonus = main game BET × multiplier. */
  readonly highLowBonus: Readonly<Record<HighLowBonus, number>>;
}

export interface EconomyConfig {
  readonly initialCredits: number; // 仮
  readonly addMedalsAmount: number; // 「メダルを追加」(仮)
}

export interface GameConfig {
  readonly bet: BetConfig;
  readonly paytable: PaytableConfig;
  readonly progressive: ProgressiveConfig;
  readonly freeGame: FreeGameConfig;
  readonly doubleDown: DoubleDownConfig;
  readonly economy: EconomyConfig;
  readonly mainDeckJokers: number;
}

export const DEFAULT_CONFIG: GameConfig = deepFreeze({
  bet: { minBet: 1, maxBet: 5 },
  paytable: {
    multipliers: {
      'FIVE OF A KIND': 500,
      'ROYAL FLUSH': 250,
      'STRAIGHT FLUSH': 50,
      '4 OF A KIND / FULL HOUSE': 10,
      'FLUSH / STRAIGHT': 8,
      'THREE OF A KIND': 3,
      'TWO PAIR': 2,
      'JOKER ANYTHING': 1,
    },
    maxBetPayouts: {
      'FIVE OF A KIND': 2500,
      'ROYAL FLUSH': 1250,
      'STRAIGHT FLUSH': 250,
      '4 OF A KIND / FULL HOUSE': 40,
      'FLUSH / STRAIGHT': 32,
      'THREE OF A KIND': 12,
      'TWO PAIR': 8,
      'JOKER ANYTHING': 4,
    },
  },
  progressive: {
    counters: {
      'FIVE OF A KIND': { initial: 2500, increment: 0.05 },
      'ROYAL FLUSH': { initial: 1250, increment: 0.03 },
      'STRAIGHT FLUSH': { initial: 250, increment: 0.035 },
      '4 OF A KIND / FULL HOUSE': { initial: 40, increment: 0.24 },
      'FLUSH / STRAIGHT': { initial: 32, increment: 0.335 },
    },
    incrementInFreeGame: false,
  },
  freeGame: {
    awards: {
      '5 R/B FACES': 100,
      'ANY 5 FACES': 40, // setting range 35..50
      '4 R/B FACES': 25,
      'ANY 4 FACES': 10, // setting range 8..12
      '3 R/B FACES': 5, // setting range 4..5
    },
    payoutMultiplier: 2,
    minPayoutIsBet: true,
  },
  doubleDown: {
    maxAmountToDouble: 5000,
    payoutCap: 10000,
    menu: ['HALF DOUBLE', 'STANDARD', 'HIGH & LOW', 'RED & BLACK', 'TAKE SCORE'],
    standardJokers: 2,
    redBlackJokers: 0,
    redBlackFlushBonusMultiplier: 8,
    halfDoubleAllowedInHighLow: false,
    highLowRounds: 4,
    highLowJokers: 1,
    highLowDrawMode: 'ARCADE',
    highLowWinProbability: 62 / 128,
    highLowLowHold: 2,
    highLowHighHold: 4,
    highLowBonus: {
      'ROYAL FLUSH': 1000, // 仮
      'STRAIGHT FLUSH': 500, // 仮
      'FULL HOUSE': 100,
      FLUSH: 70, // 仮
      STRAIGHT: 50, // 推定
      'THREE OF A KIND': 30,
      'TWO PAIR': 20,
      'JACKS OR BETTER': 10,
      NONE: 0,
    },
  },
  economy: { initialCredits: 1000, addMedalsAmount: 100 },
  mainDeckJokers: 2,
} satisfies GameConfig);

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

/** Default config with overrides applied (deep merge; arrays are replaced). Throws on an invalid result. */
export function defineConfig(overrides: DeepPartial<GameConfig> = {}): GameConfig {
  const merged = deepMerge(DEFAULT_CONFIG, overrides) as GameConfig;
  const errors = validateConfig(merged);
  if (errors.length > 0) throw new Error(`invalid GameConfig:\n- ${errors.join('\n- ')}`);
  return deepFreeze(merged);
}

/** Returns human readable problems; empty when the config is usable. */
export function validateConfig(c: GameConfig): string[] {
  const errors: string[] = [];
  const keysMatch = (obj: object, keys: readonly string[], name: string): void => {
    const got = Object.keys(obj).sort();
    const want = [...keys].sort();
    if (got.length !== want.length || got.some((k, i) => k !== want[i])) errors.push(`${name} must define exactly: ${want.join(', ')}`);
  };
  const posInt = (v: number, name: string, min = 1): void => {
    if (!Number.isInteger(v) || v < min) errors.push(`${name} must be an integer >= ${min}`);
  };
  posInt(c.bet.minBet, 'bet.minBet');
  posInt(c.bet.maxBet, 'bet.maxBet');
  if (c.bet.minBet > c.bet.maxBet) errors.push('bet.minBet must be <= bet.maxBet');
  keysMatch(c.paytable.multipliers, PAY_LINES, 'paytable.multipliers');
  keysMatch(c.paytable.maxBetPayouts, PAY_LINES, 'paytable.maxBetPayouts');
  keysMatch(c.progressive.counters, PROGRESSIVE_LINES, 'progressive.counters');
  for (const [line, ctr] of Object.entries(c.progressive.counters)) {
    if (!(ctr.initial >= 0) || !Number.isFinite(ctr.initial)) errors.push(`progressive ${line}: bad initial`);
    if (!(ctr.increment >= 0) || Math.abs(ctr.increment * 1000 - Math.round(ctr.increment * 1000)) > 1e-9) {
      errors.push(`progressive ${line}: increment must be >= 0 with at most 3 decimals`);
    }
  }
  keysMatch(c.freeGame.awards, FREE_GAME_TRIGGERS, 'freeGame.awards');
  posInt(c.freeGame.payoutMultiplier, 'freeGame.payoutMultiplier');
  const dd = c.doubleDown;
  posInt(dd.maxAmountToDouble, 'doubleDown.maxAmountToDouble');
  if (dd.payoutCap < dd.maxAmountToDouble) errors.push('doubleDown.payoutCap must be >= maxAmountToDouble');
  if (dd.menu.length !== 5 || [...dd.menu].sort().join() !== [...DOUBLE_DOWN_MENU_ITEMS].sort().join()) {
    errors.push('doubleDown.menu must list each menu item exactly once');
  }
  for (const [name, v, max] of [
    ['standardJokers', dd.standardJokers, 2],
    ['redBlackJokers', dd.redBlackJokers, 0],
    ['highLowJokers', dd.highLowJokers, 2],
    ['mainDeckJokers', c.mainDeckJokers, 2],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > max) errors.push(`${name} must be 0..${max}`);
  }
  if (!(dd.highLowWinProbability > 0 && dd.highLowWinProbability < 1)) errors.push('highLowWinProbability must be in (0, 1)');
  posInt(dd.highLowRounds, 'doubleDown.highLowRounds');
  for (const [name, v] of [['highLowLowHold', dd.highLowLowHold], ['highLowHighHold', dd.highLowHighHold]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 5) errors.push(`${name} must be 1..5`);
  }
  if (dd.highLowLowHold === dd.highLowHighHold) errors.push('HIGH and LOW holds must differ');
  keysMatch(dd.highLowBonus, HIGH_LOW_BONUSES, 'doubleDown.highLowBonus');
  posInt(c.economy.initialCredits, 'economy.initialCredits', 0);
  posInt(c.economy.addMedalsAmount, 'economy.addMedalsAmount');
  return errors;
}

function deepMerge(base: unknown, over: unknown): unknown {
  if (over === undefined) return base;
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  return out;
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const v of Object.values(obj)) deepFreeze(v);
    Object.freeze(obj);
  }
  return obj;
}
