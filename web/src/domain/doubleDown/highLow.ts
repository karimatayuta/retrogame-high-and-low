/**
 * HIGH & LOW: guess whether the next card is higher or lower, up to `highLowRounds` (4) times.
 * Port of `double_down/high_low.py`.
 *
 * Interpretations (the spec is silent or 仮; same as the Python version):
 * - The first card is never a joker (a joker on top of the shuffled deck is skipped and stays in the deck).
 * - A *revealed* joker is an unconditional win but ends the game on the spot (forced settle, no bonus).
 *   It counts towards `roundsWon`.
 * - Same rank loses for both HIGH and LOW.
 * - Final payout = min(amount + bonus, payoutCap): the cap applies to the total.
 * - Reaching `highLowRounds` wins ends the game as COMPLETED (bonus judged on first card + the 4 revealed
 *   cards); this takes precedence over auto-settle. An earlier win leaving amount > maxAmountToDouble
 *   ends the game as AUTO_SETTLED without a bonus.
 * - `collect()` is allowed before the first guess and after any win-and-continue.
 * - Bonus = mainBet x highLowBonus[hand]. If highLowRounds != 4 the history is not 5 cards and no
 *   bonus hand can be judged: bonusHand is 'NONE' (仮, only reachable with a non-default config).
 *
 * API
 *   const g = new HighLowGame(stake, mainBet, cfg.doubleDown, rng);
 *     throws DoubleDownError on a stake outside 1..maxAmountToDouble or mainBet < 1.
 *   g.phase            'AWAITING_GUESS' -> 'FINISHED'
 *   g.finished / g.canCollect (= phase AWAITING_GUESS)
 *   g.baseCard         card the next guess compares with
 *   g.history          revealed cards so far (index 0 = first card; up to 5)
 *   g.roundsWon, g.amount (0 after a loss), g.outcome, g.bonusHand, g.bonus,
 *   g.payout           final payout once finished, else null
 *   g.guess('HIGH'|'LOW') -> HighLowStep ; g.collect() -> number (amount taken)
 *     both throw DoubleDownError when finished.
 *
 * HighLowStep (result of one guess, self-describing)
 *   { guess, card (just revealed), won, outcome, amount, finished, bonusHand (only on COMPLETED), bonus,
 *     payout (final if finished, else null) }
 *   outcome: 'WIN_CONTINUE' | 'LOSE' | 'JOKER_END' | 'COMPLETED' | 'AUTO_SETTLED' | 'COLLECTED'
 *   (COLLECTED is only ever seen on `g.outcome` after collect(), never in a step.)
 *
 * Draw modes: ARCADE = roll `highLowWinProbability`, then draw a random remaining card that matches the roll
 * (if no winner exists only losers remain to be drawn and vice versa, so a win roll with no winner becomes a
 * loss; a joker is a winner for both guesses). FAIR = plain deck order.
 */
import { isJoker, sameCard, standardDeck, type Card } from '../cards';
import type { DoubleDownConfig } from '../config';
import type { HighLowBonus, HighLowGuess } from '../enums';
import type { Randomizer } from '../random';
import { evaluateHighLowBonus } from '../hand';
import { DoubleDownError, applyCap, checkStake, mustAutoSettle, type Phase } from './common';

export type HighLowOutcome = 'WIN_CONTINUE' | 'LOSE' | 'JOKER_END' | 'COMPLETED' | 'AUTO_SETTLED' | 'COLLECTED';

export interface HighLowStep {
  readonly guess: HighLowGuess;
  /** The card just revealed. */
  readonly card: Card;
  readonly won: boolean;
  readonly outcome: HighLowOutcome;
  /** Amount after this step (0 on a loss). */
  readonly amount: number;
  readonly finished: boolean;
  /** Only set on COMPLETED. */
  readonly bonusHand: HighLowBonus | null;
  readonly bonus: number;
  /** Final payout if finished, else null. */
  readonly payout: number | null;
}

function wins(guess: HighLowGuess, base: Card, candidate: Card): boolean {
  if (isJoker(candidate)) return true;
  if (isJoker(base)) throw new DoubleDownError('base card must not be a joker');
  return guess === 'HIGH' ? candidate.rank > base.rank : candidate.rank < base.rank;
}

export class HighLowGame {
  private deck: Card[];
  private readonly cards: Card[];
  private currentAmount: number;
  private won = 0;
  private currentPhase: Phase = 'AWAITING_GUESS';
  private currentOutcome: HighLowOutcome | null = null;
  private currentBonusHand: HighLowBonus | null = null;
  private currentBonus = 0;
  private currentPayout: number | null = null;

  constructor(
    private readonly stakeAmount: number,
    private readonly bet: number,
    private readonly cfg: DoubleDownConfig,
    private readonly rng: Randomizer,
  ) {
    checkStake(stakeAmount, cfg);
    if (!Number.isInteger(bet) || bet < 1) throw new DoubleDownError('mainBet must be at least 1');
    const deck = standardDeck(cfg.highLowJokers);
    rng.shuffle(deck);
    const firstIndex = deck.findIndex((c) => !isJoker(c));
    const [first] = deck.splice(firstIndex, 1) as [Card];
    this.deck = deck; // index 0 = top of the deck
    this.cards = [first];
    this.currentAmount = stakeAmount;
  }

  // -- read-only state ---------------------------------------------------

  get phase(): Phase {
    return this.currentPhase;
  }

  get finished(): boolean {
    return this.currentPhase === 'FINISHED';
  }

  get stake(): number {
    return this.stakeAmount;
  }

  get mainBet(): number {
    return this.bet;
  }

  /** The card the next guess is compared with (the last revealed non-joker; a joker ends the game). */
  get baseCard(): Card {
    return this.cards[this.cards.length - 1] as Card;
  }

  /** Revealed cards so far; index 0 is the first card (up to 5 slots for the UI). */
  get history(): readonly Card[] {
    return [...this.cards];
  }

  get roundsWon(): number {
    return this.won;
  }

  /** Current amount (0 after a loss). */
  get amount(): number {
    return this.currentAmount;
  }

  get outcome(): HighLowOutcome | null {
    return this.currentOutcome;
  }

  get bonusHand(): HighLowBonus | null {
    return this.currentBonusHand;
  }

  get bonus(): number {
    return this.currentBonus;
  }

  /** Final payout once finished (`min(amount + bonus, cap)`), else null. */
  get payout(): number | null {
    return this.currentPayout;
  }

  get canCollect(): boolean {
    return this.currentPhase === 'AWAITING_GUESS';
  }

  // -- actions -------------------------------------------------------------

  /** Take the current amount (the stake itself before the first guess). */
  collect(): number {
    if (this.currentPhase !== 'AWAITING_GUESS') throw new DoubleDownError(`cannot collect in phase ${this.currentPhase}`);
    this.currentOutcome = 'COLLECTED';
    this.finish(this.currentAmount);
    return this.currentAmount;
  }

  guess(guess: HighLowGuess): HighLowStep {
    if (this.currentPhase !== 'AWAITING_GUESS') throw new DoubleDownError(`cannot guess in phase ${this.currentPhase}`);
    if (guess !== 'HIGH' && guess !== 'LOW') throw new DoubleDownError(`bad guess ${String(guess)}`);
    const base = this.baseCard;
    const card = this.draw(guess, base);
    this.cards.push(card);
    if (!wins(guess, base, card)) {
      this.currentAmount = 0;
      this.currentOutcome = 'LOSE';
      this.finish(0);
      return this.step(guess, card, false);
    }
    this.currentAmount = applyCap(this.currentAmount * 2, this.cfg);
    this.won += 1;
    if (isJoker(card)) {
      this.currentOutcome = 'JOKER_END';
      this.finish(this.currentAmount);
    } else if (this.won >= this.cfg.highLowRounds) {
      this.currentBonusHand = this.cards.length === 5 ? evaluateHighLowBonus(this.cards) : 'NONE';
      this.currentBonus = this.bet * this.cfg.highLowBonus[this.currentBonusHand];
      this.currentOutcome = 'COMPLETED';
      this.finish(applyCap(this.currentAmount + this.currentBonus, this.cfg));
    } else if (mustAutoSettle(this.currentAmount, this.cfg)) {
      this.currentOutcome = 'AUTO_SETTLED';
      this.finish(this.currentAmount);
    } else {
      this.currentOutcome = 'WIN_CONTINUE';
    }
    return this.step(guess, card, true);
  }

  // -- internals -----------------------------------------------------------

  private finish(payout: number): void {
    this.currentPhase = 'FINISHED';
    this.currentPayout = payout;
  }

  private step(guess: HighLowGuess, card: Card, won: boolean): HighLowStep {
    return Object.freeze({
      guess,
      card,
      won,
      outcome: this.currentOutcome as HighLowOutcome,
      amount: this.currentAmount,
      finished: this.finished,
      bonusHand: this.currentBonusHand,
      bonus: this.currentBonus,
      payout: this.currentPayout,
    });
  }

  private draw(guess: HighLowGuess, base: Card): Card {
    if (this.deck.length === 0) throw new DoubleDownError('deck is empty');
    if (this.cfg.highLowDrawMode === 'FAIR') return this.deck.shift() as Card;
    const winners = this.deck.filter((c) => wins(guess, base, c));
    const losers = this.deck.filter((c) => !wins(guess, base, c));
    let wantWin = this.rng.next() < this.cfg.highLowWinProbability;
    if (wantWin && winners.length === 0) wantWin = false;
    else if (!wantWin && losers.length === 0) wantWin = true;
    const picked = this.rng.pick(wantWin ? winners : losers);
    this.deck.splice(this.deck.findIndex((c) => sameCard(c, picked)), 1);
    return picked;
  }
}
