/** Settlement of one main/free game. */
import type { GameConfig } from './config';
import { HAND_TO_PAYLINE, isProgressiveLine, type HandRank, type PayLine, type ProgressiveLine } from './enums';
import type { ProgressivePool } from './progressive';

/** Result of one game. `progressiveLine` is set when a counter was paid. */
export interface Payout {
  readonly hand: HandRank;
  readonly line: PayLine | null;
  readonly amount: number;
  readonly progressiveLine: ProgressiveLine | null;
}

/**
 * Compute the payout of one game.
 *
 * - bet < maxBet: `bet x multiplier`; bet == maxBet: fixed max-bet payout, or
 *   the progressive counter (`pool.award`, which resets that counter) for the
 *   five progressive lines.
 * - NOTHING pays 0.
 * - free game: amount x `payoutMultiplier` (progressive included); if the
 *   result is below `bet` it is raised to `bet` (`minPayoutIsBet`).
 *
 * Ordering contract: the counter increment is NOT done here. The session
 * calls `pool.addMaxBetGame()` once at deal time for a paid MAX BET game (and
 * in free games only if `cfg.progressive.incrementInFreeGame`), BEFORE
 * settling, so a win pays the counter including this game's increment.
 */
export function settleMainGame(
  hand: HandRank,
  bet: number,
  pool: ProgressivePool,
  cfg: GameConfig,
  opts: { freeGame: boolean },
): Payout {
  if (!Number.isInteger(bet) || bet < cfg.bet.minBet || bet > cfg.bet.maxBet) throw new RangeError(`bet out of range: ${bet}`);
  const line: PayLine | null = hand === 'NOTHING' ? null : HAND_TO_PAYLINE[hand];
  let progressiveLine: ProgressiveLine | null = null;
  let amount: number;
  if (line === null) {
    amount = 0;
  } else if (bet === cfg.bet.maxBet) {
    if (isProgressiveLine(line)) {
      amount = pool.award(line);
      progressiveLine = line;
    } else {
      amount = cfg.paytable.maxBetPayouts[line];
    }
  } else {
    amount = bet * cfg.paytable.multipliers[line];
  }
  if (opts.freeGame) {
    amount *= cfg.freeGame.payoutMultiplier;
    if (cfg.freeGame.minPayoutIsBet) amount = Math.max(amount, bet);
  }
  return { hand, line, amount, progressiveLine };
}
