import { describe, expect, it } from 'vitest';
import { standardDeck, type Card } from '@/domain/cards';
import { DEFAULT_CONFIG } from '@/domain/config';
import { detectFreeGame } from '@/domain/freeGame';

describe('free game trigger counts over all C(54,5) hands', () => {
  it('matches the verified exclusive counts', () => {
    const deck = standardDeck(2);
    const n = deck.length;
    const counts = new Map<string, number>();
    let total = 0;
    const hand: Card[] = new Array<Card>(5);
    for (let a = 0; a < n; a++) {
      hand[0] = deck[a] as Card;
      for (let b = a + 1; b < n; b++) {
        hand[1] = deck[b] as Card;
        for (let c = b + 1; c < n; c++) {
          hand[2] = deck[c] as Card;
          for (let d = c + 1; d < n; d++) {
            hand[3] = deck[d] as Card;
            for (let e = d + 1; e < n; e++) {
              hand[4] = deck[e] as Card;
              total++;
              const t = detectFreeGame(hand, DEFAULT_CONFIG.freeGame);
              if (t !== null) counts.set(t, (counts.get(t) ?? 0) + 1);
            }
          }
        }
      }
    }
    expect(total).toBe(3_162_510);
    expect(counts.get('5 R/B FACES')).toBe(12);
    expect(counts.get('ANY 5 FACES')).toBe(780);
    expect(counts.get('4 R/B FACES')).toBe(1260);
    expect(counts.get('ANY 4 FACES')).toBe(19530);
    expect(counts.get('3 R/B FACES')).toBe(34440);
  });
});
