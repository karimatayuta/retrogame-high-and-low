/**
 * RED & BLACK: pick a card of the same colour as the dealer's card.
 *
 * API
 *   const g = new RedBlackDouble(stake, cfg.doubleDown, rng);  // deals immediately; throws DoubleDownError on a bad stake
 *   g.dealerCard      index 0 card
 *   g.phase           'AWAITING_PICK' -> 'FINISHED'
 *   g.finished        phase === 'FINISHED'
 *   g.stake           amount at risk
 *   g.result          RedBlackResult | null
 *   g.pick(index)     index 1..4 -> RedBlackResult; throws DoubleDownError on bad index / second pick
 *
 * RedBlackResult (all 5 cards revealed, cards[0] = dealer)
 *   { won, pickedIndex, cards, flush, payout }
 *   flush  = all 5 cards share one suit. payout = 0 on a loss, else
 *   min(stake x 2 + (flush ? stake x redBlackFlushBonusMultiplier : 0), cap)  (cap applies to the total).
 *   The flush bonus only matters on a win; a flush is always a win (same suit => same colour).
 *   The deck has `redBlackJokers` jokers (0 by default); a joker has no colour so it never matches
 *   and never forms a flush.
 */
import { colorOf, isJoker, standardDeck, type Card } from '../cards';
import type { DoubleDownConfig } from '../config';
import type { Randomizer } from '../random';
import { HAND_SIZE, DoubleDownError, applyCap, checkPickIndex, checkStake, type Phase } from './common';

export interface RedBlackResult {
  readonly won: boolean;
  readonly pickedIndex: number;
  readonly cards: readonly Card[];
  readonly flush: boolean;
  readonly payout: number;
}

export class RedBlackDouble {
  private readonly cardsDealt: readonly Card[];
  private currentPhase: Phase = 'AWAITING_PICK';
  private currentResult: RedBlackResult | null = null;

  constructor(
    private readonly stakeAmount: number,
    private readonly cfg: DoubleDownConfig,
    rng: Randomizer,
  ) {
    checkStake(stakeAmount, cfg);
    const deck = standardDeck(cfg.redBlackJokers);
    rng.shuffle(deck);
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

  get result(): RedBlackResult | null {
    return this.currentResult;
  }

  pick(index: number): RedBlackResult {
    if (this.currentPhase !== 'AWAITING_PICK') throw new DoubleDownError(`cannot pick in phase ${this.currentPhase}`);
    checkPickIndex(index);
    const first = this.cardsDealt[0] as Card;
    const flush =
      !this.cardsDealt.some(isJoker) &&
      this.cardsDealt.every((c) => c.kind === 'normal' && first.kind === 'normal' && c.suit === first.suit);
    const dealerColor = colorOf(first);
    const pickedColor = colorOf(this.cardsDealt[index] as Card);
    const won = dealerColor !== null && dealerColor === pickedColor;
    let payout = 0;
    if (won) {
      let total = this.stakeAmount * 2;
      if (flush) total += this.stakeAmount * this.cfg.redBlackFlushBonusMultiplier;
      payout = applyCap(total, this.cfg);
    }
    this.currentResult = Object.freeze({ won, pickedIndex: index, cards: this.cardsDealt, flush, payout });
    this.currentPhase = 'FINISHED';
    return this.currentResult;
  }
}
