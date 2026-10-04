import { describe, expect, it } from 'vitest';
import { standardDeck } from '@/domain/cards';
import { HAND_RANKS, type HandRank } from '@/domain/enums';
import { evaluateHand } from '@/domain/hand';
import { forEachCombination } from '../support/combinations';

const EXPECTED: Record<HandRank, number> = {
  'FIVE OF A KIND': 78,
  'ROYAL FLUSH': 84,
  'STRAIGHT FLUSH': 540,
  'FOUR OF A KIND': 9360,
  'FULL HOUSE': 9360,
  FLUSH: 11388,
  STRAIGHT: 34704,
  'THREE OF A KIND': 232968,
  'TWO PAIR': 123552,
  'JOKER ANYTHING': 339696,
  NOTHING: 2400780,
};

describe('exhaustive hand enumeration (54 cards)', () => {
  it('matches the spec verification table for all 3,162,510 hands', () => {
    const counts = new Map<HandRank, number>(HAND_RANKS.map((r) => [r, 0]));
    let total = 0;
    forEachCombination(standardDeck(2), 5, (hand) => {
      const r = evaluateHand(hand);
      counts.set(r, (counts.get(r) as number) + 1);
      total++;
    });
    expect(total).toBe(3_162_510);
    expect(Object.fromEntries(counts)).toEqual(EXPECTED);
  });
});
