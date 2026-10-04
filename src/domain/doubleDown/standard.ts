/**
 * Standard double: beat the dealer's card (2 < ... < K < A < JOKER).
 *
 * API
 *   const g = new StandardDouble(stake, cfg.doubleDown, rng);  // deals immediately; throws DoubleDownError on a bad stake
 *   g.dealerCard           index 0 card (the only face-up card before a pick)
 *   g.phase                'AWAITING_PICK' -> 'FINISHED' | 'NEEDS_REDEAL'
 *   g.stake                amount at risk (kept across redeals)
 *   g.result               StandardResult | null
 *   g.canCollect           true only when finished with a WIN (caller keeps result.payout)
 *   g.pick(index)          index 1..4 (0 is the dealer) -> StandardResult; throws DoubleDownError otherwise
 *   g.redeal()             only after a DRAW: reshuffle and deal again with the same stake
 *
 * StandardResult (all 5 cards are revealed, cards[0] = dealer)
 *   { outcome: 'WIN'|'LOSE'|'DRAW', pickedIndex, cards, payout, canCollect }
 *   payout: WIN = min(stake x 2, cap); LOSE = 0; DRAW = 0 (not collectable, redeal required).
 *
 * `finished` = phase === 'FINISHED'. A WIN or LOSE ends the game (the caller continues from `payout`).
 */
import { isJoker, standardDeck, type Card } from '../cards';
import type { DoubleDownConfig } from '../config';
import type { Randomizer } from '../random';
import { HAND_SIZE, DoubleDownError, applyCap, checkPickIndex, checkStake, type Phase } from './common';

export const JOKER_STRENGTH = 15;

export type StandardOutcome = 'WIN' | 'LOSE' | 'DRAW';

/** 2..14 for normal cards (A = 14), 15 for a joker. */
export function standardStrength(card: Card): number {
  return isJoker(card) ? JOKER_STRENGTH : card.rank;
}

export interface StandardResult {
  readonly outcome: StandardOutcome;
  readonly pickedIndex: number;
  /** All 5 cards, index 0 = dealer; everything is revealed. */
  readonly cards: readonly Card[];
  readonly payout: number;
  /** A draw must be replayed; the player cannot collect at that moment. */
  readonly canCollect: boolean;
}

export class StandardDouble {
  private cardsDealt: readonly Card[] = [];
  private currentPhase: Phase = 'AWAITING_PICK';
  private currentResult: StandardResult | null = null;

  constructor(
    private readonly stakeAmount: number,
    private readonly cfg: DoubleDownConfig,
    private readonly rng: Randomizer,
  ) {
    checkStake(stakeAmount, cfg);
    this.deal();
  }

  private deal(): void {
    const deck = standardDeck(this.cfg.standardJokers);
    this.rng.shuffle(deck);
    this.cardsDealt = Object.freeze(deck.slice(0, HAND_SIZE));
  }

  get stake(): number {
    return this.stakeAmount;
  }

  get phase(): Phase {
    return this.currentPhase;
  }

  get finished(): boolean {
    return this.currentPhase === 'FINISHED';
  }

  get dealerCard(): Card {
    return this.cardsDealt[0] as Card;
  }

  get result(): StandardResult | null {
    return this.currentResult;
  }

  get canCollect(): boolean {
    return this.currentResult !== null && this.currentResult.outcome === 'WIN';
  }

  pick(index: number): StandardResult {
    if (this.currentPhase !== 'AWAITING_PICK') throw new DoubleDownError(`cannot pick in phase ${this.currentPhase}`);
    checkPickIndex(index);
    const dealer = standardStrength(this.cardsDealt[0] as Card);
    const picked = standardStrength(this.cardsDealt[index] as Card);
    let outcome: StandardOutcome;
    let payout = 0;
    if (picked > dealer) {
      outcome = 'WIN';
      payout = applyCap(this.stakeAmount * 2, this.cfg);
    } else if (picked < dealer) {
      outcome = 'LOSE';
    } else {
      outcome = 'DRAW';
    }
    this.currentResult = Object.freeze({
      outcome,
      pickedIndex: index,
      cards: this.cardsDealt,
      payout,
      canCollect: outcome !== 'DRAW',
    });
    this.currentPhase = outcome === 'DRAW' ? 'NEEDS_REDEAL' : 'FINISHED';
    return this.currentResult;
  }

  /** After a DRAW: shuffle and deal again (same stake). The player must pick again. */
  redeal(): void {
    if (this.currentPhase !== 'NEEDS_REDEAL') throw new DoubleDownError('redeal is only allowed after a draw');
    this.deal();
    this.currentResult = null;
    this.currentPhase = 'AWAITING_PICK';
  }
}
