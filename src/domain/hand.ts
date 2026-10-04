/**
 * Hand evaluation for the main game (54 cards, two wild jokers) and the
 * HIGH & LOW special bonus.
 *
 * The hot path is allocation-free (module-level scratch counters, bit masks)
 * so all 3,162,510 hands can be enumerated in a few seconds.
 */

import type { Card } from '@/domain/cards';
import type { HandRank, HighLowBonus } from '@/domain/enums';

const HAND_SIZE = 5;
const SUIT_INDEX = { S: 0, H: 1, D: 2, C: 3 } as const;

/** Scratch rank counters (index = rank 2..14); reset after every evaluation. */
const rankCount = new Int8Array(15);

/** Integer code of a card: suit*13 + (rank-2) for normal cards, 52/53 for jokers. */
function codeOf(c: Card): number {
  if (c.kind === 'joker') {
    if (c.id !== 1 && c.id !== 2) throw new Error('joker id must be 1 or 2');
    return 51 + c.id;
  }
  return SUIT_INDEX[c.suit] * 13 + (c.rank - 2);
}

function check(hand: readonly Card[]): void {
  if (hand.length !== HAND_SIZE) throw new Error(`a hand must have exactly ${HAND_SIZE} cards, got ${hand.length}`);
  let seenLo = 0;
  let seenHi = 0;
  for (let i = 0; i < HAND_SIZE; i++) {
    const code = codeOf(hand[i] as Card);
    if (!(code >= 0 && code <= 53)) throw new Error('invalid card');
    if (code < 32) {
      if (seenLo & (1 << code)) throw new Error('a hand must not contain duplicate cards');
      seenLo |= 1 << code;
    } else {
      if (seenHi & (1 << (code - 32))) throw new Error('a hand must not contain duplicate cards');
      seenHi |= 1 << (code - 32);
    }
  }
}

/**
 * Rank a five-card hand from the 54-card deck; jokers are wild and the strongest
 * matching hand wins. Throws on a wrong card count or duplicate cards.
 */
export function evaluateHand(hand: readonly Card[]): HandRank {
  check(hand);
  let rankMask = 0;
  let firstSuit = '';
  let sameSuit = true;
  let normals = 0;
  for (let i = 0; i < HAND_SIZE; i++) {
    const c = hand[i] as Card;
    if (c.kind === 'joker') continue;
    normals++;
    rankCount[c.rank] = (rankCount[c.rank] as number) + 1;
    rankMask |= 1 << c.rank;
    if (firstSuit === '') firstSuit = c.suit;
    else if (c.suit !== firstSuit) sameSuit = false;
  }
  const jokers = HAND_SIZE - normals;

  let top = 0;
  let pairsOrBetter = 0;
  let exactPairs = 0;
  let distinct = 0;
  for (let r = 2; r <= 14; r++) {
    const n = rankCount[r] as number;
    if (n === 0) continue;
    rankCount[r] = 0;
    distinct++;
    if (n > top) top = n;
    if (n >= 2) pairsOrBetter++;
    if (n === 2) exactPairs++;
  }

  if (top + jokers >= 5) return 'FIVE OF A KIND';

  let straight = false;
  let lo = 0;
  if (distinct === normals) {
    lo = 31 - Math.clz32(rankMask & -rankMask);
    const hi = 31 - Math.clz32(rankMask);
    if (hi - lo <= 4) straight = true;
    else if (hi === 14) straight = 31 - Math.clz32(rankMask & ~(1 << 14)) <= 5; // A-2-3-4-5
  }
  if (sameSuit && straight) {
    // Ace-low straights contain a 2..5, so `lo` < 10 there: never royal.
    return lo >= 10 ? 'ROYAL FLUSH' : 'STRAIGHT FLUSH';
  }
  if (top + jokers >= 4) return 'FOUR OF A KIND';
  if (
    (jokers === 0 && top === 3 && pairsOrBetter === 2) ||
    (jokers === 1 && top === 2 && pairsOrBetter === 2)
  ) {
    return 'FULL HOUSE';
  }
  if (sameSuit) return 'FLUSH';
  if (straight) return 'STRAIGHT';
  if (top + jokers >= 3) return 'THREE OF A KIND';
  if (jokers === 0 && exactPairs === 2) return 'TWO PAIR';
  return jokers > 0 ? 'JOKER ANYTHING' : 'NOTHING';
}

/**
 * Special bonus of the five HIGH & LOW cards (no jokers allowed). Four of a kind
 * is not in the bonus table; it is defensively paid as FULL HOUSE (kept from the original rules).
 */
export function evaluateHighLowBonus(hand: readonly Card[]): HighLowBonus {
  for (const c of hand) {
    if (c.kind === 'joker') throw new Error('HIGH & LOW bonus hands must not contain jokers');
  }
  switch (evaluateHand(hand)) {
    case 'ROYAL FLUSH':
      return 'ROYAL FLUSH';
    case 'STRAIGHT FLUSH':
      return 'STRAIGHT FLUSH';
    case 'FOUR OF A KIND':
    case 'FULL HOUSE':
      return 'FULL HOUSE';
    case 'FLUSH':
      return 'FLUSH';
    case 'STRAIGHT':
      return 'STRAIGHT';
    case 'THREE OF A KIND':
      return 'THREE OF A KIND';
    case 'TWO PAIR':
      return 'TWO PAIR';
    default:
      break;
  }
  // Only NOTHING is left: a single pair of J/Q/K/A is JACKS OR BETTER.
  let seen = 0;
  for (const c of hand) {
    if (c.kind !== 'normal' || c.rank < 11) continue;
    if (seen & (1 << c.rank)) return 'JACKS OR BETTER';
    seen |= 1 << c.rank;
  }
  return 'NONE';
}
