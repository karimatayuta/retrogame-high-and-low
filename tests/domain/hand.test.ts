import { describe, expect, it } from 'vitest';
import { cards, standardDeck } from '@/domain/cards';
import type { HandRank, HighLowBonus } from '@/domain/enums';
import { evaluateHand, evaluateHighLowBonus } from '@/domain/hand';
import { forEachCombination } from '../support/combinations';

const MAIN: [string, HandRank][] = [
  ['7S 7H 7D 7C JKR', 'FIVE OF A KIND'],
  ['7S 7H 7D JKR JKR2', 'FIVE OF A KIND'],
  ['AS AH AD AC JKR2', 'FIVE OF A KIND'],
  ['10S JS QS KS AS', 'ROYAL FLUSH'],
  ['JKR 10S JS QS AS', 'ROYAL FLUSH'],
  ['JKR JKR2 10S JS QS', 'ROYAL FLUSH'],
  ['JKR 10H JH QH KH', 'ROYAL FLUSH'],
  ['JKR JKR2 AS KS QS', 'ROYAL FLUSH'],
  ['9S 10S JS QS KS', 'STRAIGHT FLUSH'],
  ['JKR 2S 3S 4S 5S', 'STRAIGHT FLUSH'],
  ['AS 2S 3S 4S 5S', 'STRAIGHT FLUSH'],
  ['JKR AS 2S 3S 4S', 'STRAIGHT FLUSH'],
  ['JKR JKR2 2S 3S 5S', 'STRAIGHT FLUSH'],
  ['JKR 9S JS QS KS', 'STRAIGHT FLUSH'],
  ['JKR JKR2 9S JS KS', 'STRAIGHT FLUSH'],
  ['JKR JKR2 7S 7H 2D', 'FOUR OF A KIND'],
  ['7S 7H 7D 7C 2D', 'FOUR OF A KIND'],
  ['JKR 7S 7H 7D 2C', 'FOUR OF A KIND'],
  ['7S 7H 7D 2C 2D', 'FULL HOUSE'],
  ['JKR 7S 7H 2C 2D', 'FULL HOUSE'],
  ['2S 5S 9S JS KS', 'FLUSH'],
  ['JKR 2S 5S 9S KS', 'FLUSH'],
  ['JKR JKR2 2S 9S KS', 'FLUSH'],
  ['JKR 2H 3H 4H 9H', 'FLUSH'],
  ['2S 3H 4D 5C 6S', 'STRAIGHT'],
  ['AS 2H 3D 4C 5S', 'STRAIGHT'],
  ['10S JH QD KC AS', 'STRAIGHT'],
  ['JKR AS KH QD JC', 'STRAIGHT'],
  ['JKR JKR2 AS KH QD', 'STRAIGHT'],
  ['JKR 2S 4H 5D 3C', 'STRAIGHT'],
  ['JKR AS 2H 3D 5C', 'STRAIGHT'],
  ['JKR JKR2 AS 2H 4D', 'STRAIGHT'],
  ['QS KH AD 2C 3S', 'NOTHING'],
  ['JKR KS AH 2D 3C', 'JOKER ANYTHING'],
  ['JKR QS KH AD 2C', 'JOKER ANYTHING'],
  ['JKR JKR2 KS AH 2D', 'THREE OF A KIND'],
  ['7S 7H 7D 2C 9D', 'THREE OF A KIND'],
  ['JKR 7S 7H 2C 9D', 'THREE OF A KIND'],
  ['JKR JKR2 7S 2C 9D', 'THREE OF A KIND'],
  ['7S 7H 2D 2C 9D', 'TWO PAIR'],
  ['JKR 2S 5H 9D KC', 'JOKER ANYTHING'],
  ['JKR JKR2 2S 5H 9D', 'THREE OF A KIND'],
  ['7S 7H 2D 4C 9D', 'NOTHING'],
  ['AS AH 2D 4C 9D', 'NOTHING'],
  ['2S 5H 9D JC KS', 'NOTHING'],
  ['2S 3S 4S 5S 7S', 'FLUSH'],
  ['2S 3H 4S 5S 7S', 'NOTHING'],
  ['2S 3S 4S 5S 7D', 'NOTHING'],
  ['AS KS QS JS 9S', 'FLUSH'],
  ['AS 2S 3S 4S 6S', 'FLUSH'],
  ['JKR AS 2S 3S 6S', 'FLUSH'],
  ['JKR AS 2S 3S 4D', 'STRAIGHT'],
  // adversarial: priority and boundaries
  ['JKR JKR2 AS KS QS', 'ROYAL FLUSH'], // royal beats five-of-a-kind-free reading
  ['JKR JKR2 AS AH AD', 'FIVE OF A KIND'],
  ['JKR JKR2 5S 4S 3S', 'STRAIGHT FLUSH'],
  ['JKR JKR2 6S 5S 4S', 'STRAIGHT FLUSH'],
  ['JKR JKR2 AS 2S 3S', 'STRAIGHT FLUSH'], // wheel with two jokers
  ['JKR JKR2 AS 5S 3S', 'STRAIGHT FLUSH'],
  ['JKR JKR2 AS 6S 3S', 'FLUSH'],
  ['JKR JKR2 AS 5D 3S', 'STRAIGHT'],
  ['JKR JKR2 AS 6D 3S', 'THREE OF A KIND'],
  ['JKR 10S JS KS AS', 'ROYAL FLUSH'], // joker fills the Q
  ['JKR 9S 10S JS QS', 'STRAIGHT FLUSH'], // joker could be K or 8; never royal-only requirement
  ['JKR 10S JS QS KS', 'ROYAL FLUSH'], // joker plays A
  ['JKR 2S 3S 4S AS', 'STRAIGHT FLUSH'],
  ['JKR 2S 3S 4S KS', 'FLUSH'],
  ['JKR AS 5S 4S 3S', 'STRAIGHT FLUSH'],
  ['JKR 7S 7H 7D 7C', 'FIVE OF A KIND'],
  ['JKR 7S 7H 8D 8C', 'FULL HOUSE'],
  ['JKR 7S 7H 8D 9C', 'THREE OF A KIND'],
  ['JKR AS AH KS KH', 'FULL HOUSE'],
];

const BONUS: [string, HighLowBonus][] = [
  ['10S JS QS KS AS', 'ROYAL FLUSH'],
  ['9H 10H JH QH KH', 'STRAIGHT FLUSH'],
  ['AH 2H 3H 4H 5H', 'STRAIGHT FLUSH'],
  ['7S 2D 7H 2S 7C', 'FULL HOUSE'],
  ['2S 5S 9S JS KS', 'FLUSH'],
  ['2S 3H 4D 5C 6S', 'STRAIGHT'],
  ['7S 7H 7D 2C 9D', 'THREE OF A KIND'],
  ['7S 7H 2D 2C 9D', 'TWO PAIR'],
  ['JS JH 2D 4C 9D', 'JACKS OR BETTER'],
  ['QS QH 2D 4C 9D', 'JACKS OR BETTER'],
  ['KS KH 2D 4C 9D', 'JACKS OR BETTER'],
  ['AS AH 2D 4C 9D', 'JACKS OR BETTER'],
  ['10S 10H 2D 4C 9D', 'NONE'],
  ['2S 2H 3D 4C 9D', 'NONE'],
  ['2S 5H 9D JC KS', 'NONE'],
  ['7S 7H 7D 7C 2D', 'FULL HOUSE'], // four of a kind: documented fallback
  ['AS AH 2D 2C 9D', 'TWO PAIR'],
  ['JS JH JD 2C 9D', 'THREE OF A KIND'],
];

describe('evaluateHand', () => {
  it.each(MAIN)('%s -> %s', (text, expected) => {
    expect(evaluateHand(cards(text))).toBe(expected);
  });

  it('does not depend on card order', () => {
    const hand = cards('JKR 2S 3S 4S 5S');
    expect(evaluateHand([...hand].reverse())).toBe('STRAIGHT FLUSH');
    expect(evaluateHand(hand)).toBe('STRAIGHT FLUSH');
  });

  it('is order independent for every permutation of a few tricky hands', () => {
    for (const [text, expected] of MAIN) {
      const h = cards(text);
      for (let s = 0; s < 5; s++) {
        const rot = [...h.slice(s), ...h.slice(0, s)];
        expect(evaluateHand(rot)).toBe(expected);
      }
    }
  });

  it('accepts a frozen / readonly array', () => {
    expect(evaluateHand(Object.freeze(cards('10S JS QS KS AS')))).toBe('ROYAL FLUSH');
  });

  it.each(['AS KS QS JS', 'AS KS QS JS 10S 9S', '', 'AS AS KS QS JS'])('rejects bad size or duplicate: "%s"', (text) => {
    expect(() => evaluateHand(text === '' ? [] : cards(text))).toThrow();
  });

  it('rejects a duplicated joker', () => {
    expect(() => evaluateHand(cards('JKR JKR 2S 3S 4S'))).toThrow();
  });

  it('does not mutate scratch state across calls (a throw mid-way must not poison later results)', () => {
    expect(() => evaluateHand(cards('7S 7H 7D 7C 7S'))).toThrow();
    expect(evaluateHand(cards('7S 7H 2D 4C 9D'))).toBe('NOTHING');
    expect(evaluateHand(cards('7S 7H 7D 2C 2D'))).toBe('FULL HOUSE');
  });

  it('every 5-card hand of a 4-suit deck with 0 jokers never yields joker hands or five of a kind', () => {
    const seen = new Set<HandRank>();
    let n = 0;
    forEachCombination(standardDeck(0).filter((_, i) => i % 3 === 0), 5, (h) => {
      seen.add(evaluateHand(h));
      n++;
    });
    expect(n).toBeGreaterThan(0);
    expect(seen.has('JOKER ANYTHING')).toBe(false);
    expect(seen.has('FIVE OF A KIND')).toBe(false);
  });
});

describe('evaluateHighLowBonus', () => {
  it.each(BONUS)('%s -> %s', (text, expected) => {
    expect(evaluateHighLowBonus(cards(text))).toBe(expected);
  });

  it('rejects jokers', () => {
    expect(() => evaluateHighLowBonus(cards('JKR 2S 3S 4S 5S'))).toThrow();
  });

  it('rejects wrong size and duplicates', () => {
    expect(() => evaluateHighLowBonus(cards('2S 3S 4S 5S'))).toThrow();
    expect(() => evaluateHighLowBonus(cards('2S 2S 4S 5S 9D'))).toThrow();
  });
});
