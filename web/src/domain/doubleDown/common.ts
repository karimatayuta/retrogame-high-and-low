/**
 * Helpers shared by the three double down games (port of Python `double_down/common.py`).
 *
 * API
 * - `DoubleDownError`          thrown on illegal use (wrong phase, bad index, bad stake).
 * - `Phase`                    'AWAITING_PICK' (standard / red&black: choose one of 4 face-down cards)
 *                              | 'AWAITING_GUESS' (high&low: HIGH / LOW / collect)
 *                              | 'NEEDS_REDEAL' (standard only: drew, must redeal, cannot collect)
 *                              | 'FINISHED'.
 * - `canDouble(amount, cfg)`   1 <= amount <= maxAmountToDouble (5000).
 * - `mustAutoSettle(amount, cfg)`  amount > maxAmountToDouble.
 * - `applyCap(amount, cfg)`    min(amount, payoutCap) (振り切り 10000).
 * - `splitHalf(amount)`        `{ kept, stake }`; the odd medal goes to `kept` (仮). Throws RangeError if negative.
 * - `canHalfDouble(amount, cfg?)`  amount >= 2 (and, when cfg given, also <= maxAmountToDouble).
 * - `checkStake(stake, cfg)`   throws DoubleDownError unless the stake is doublable (integer 1..5000).
 */
import type { DoubleDownConfig } from '../config';

export class DoubleDownError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoubleDownError';
  }
}

export type Phase = 'AWAITING_PICK' | 'AWAITING_GUESS' | 'NEEDS_REDEAL' | 'FINISHED';

/** Number of cards dealt in standard / red & black (index 0 = dealer). */
export const HAND_SIZE = 5;

export function canDouble(amount: number, cfg: DoubleDownConfig): boolean {
  return Number.isInteger(amount) && amount >= 1 && amount <= cfg.maxAmountToDouble;
}

export function mustAutoSettle(amount: number, cfg: DoubleDownConfig): boolean {
  return amount > cfg.maxAmountToDouble;
}

export function applyCap(amount: number, cfg: DoubleDownConfig): number {
  return Math.min(amount, cfg.payoutCap);
}

export interface HalfSplit {
  /** Medals kept safely (gets the odd one). */
  readonly kept: number;
  /** Medals put at risk. */
  readonly stake: number;
}

export function splitHalf(amount: number): HalfSplit {
  if (!Number.isInteger(amount) || amount < 0) throw new RangeError('amount must be a non-negative integer');
  const stake = Math.floor(amount / 2);
  return Object.freeze({ kept: amount - stake, stake });
}

export function canHalfDouble(amount: number, cfg?: DoubleDownConfig): boolean {
  if (!Number.isInteger(amount) || amount < 2) return false;
  return cfg === undefined || canDouble(amount, cfg);
}

export function checkStake(stake: number, cfg: DoubleDownConfig): void {
  if (!canDouble(stake, cfg)) throw new DoubleDownError(`stake ${stake} cannot be doubled`);
}

/** Validate a 1..4 face-down card index (index 0 is the dealer). */
export function checkPickIndex(index: number): void {
  if (!Number.isInteger(index) || index < 1 || index >= HAND_SIZE) {
    throw new DoubleDownError('pick index must be 1..4');
  }
}
