// Exhaustive verification of the spec's 検算結果 (proves our rule interpretation).
// Port of tests/domain/test_rtp.py from the Pyxel edition.
import { describe, expect, it } from 'vitest';
import { standardDeck } from '@/domain/cards';
import { DEFAULT_CONFIG as C } from '@/domain/config';
import { FREE_GAME_TRIGGERS, payLineOf, type FreeGameTrigger, type HandRank } from '@/domain/enums';
import { detectFreeGame } from '@/domain/freeGame';
import { evaluateHand } from '@/domain/hand';
import { forEachCombination } from '../support/combinations';

const TOTAL = 3_162_510;
const TOL = 0.0005;

function perBetPayout(rank: HandRank, bet: number): number {
  const line = payLineOf(rank);
  return line === null ? 0 : bet * C.paytable.multipliers[line];
}

describe('RTP (all 3,162,510 hands)', () => {
  it('matches the spec: hit 24.09% / 25.37%, RTP 61.0% + 31.3% = 92.24%', () => {
    const ranks = new Map<HandRank, number>();
    const triggers = new Map<FreeGameTrigger, number>();
    let nothingWithFree = 0;
    forEachCombination(standardDeck(2), 5, (hand) => {
      const r = evaluateHand(hand);
      const t = detectFreeGame(hand, C.freeGame);
      ranks.set(r, (ranks.get(r) ?? 0) + 1);
      if (t !== null) {
        triggers.set(t, (triggers.get(t) ?? 0) + 1);
        if (r === 'NOTHING') nothingWithFree++;
      }
    });
    const total = [...ranks.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(TOTAL);

    const awarded = FREE_GAME_TRIGGERS.reduce((s, t) => s + (triggers.get(t) ?? 0) * C.freeGame.awards[t], 0) / TOTAL;
    const extraPerHand = awarded / (1 - awarded); // geometric: retriggers add games

    const hits = TOTAL - (ranks.get('NOTHING') ?? 0);
    expect(hits / TOTAL).toBeCloseTo(0.2409, 4);
    expect((hits + nothingWithFree) / TOTAL).toBeCloseTo(0.2537, 4);

    for (const bet of [1, 2, 3, 4]) {
      let base = 0;
      let freeMin = 0;
      for (const [r, n] of ranks) {
        const p = perBetPayout(r, bet);
        base += n * p;
        freeMin += n * Math.max(C.freeGame.payoutMultiplier * p, bet);
      }
      base /= TOTAL * bet;
      const free = (extraPerHand * freeMin) / (TOTAL * bet);
      expect(Math.abs(base - 0.61)).toBeLessThan(TOL);
      expect(Math.abs(free - 0.313)).toBeLessThan(TOL);
      expect(Math.abs(base + free - 0.9224)).toBeLessThan(TOL);
    }
  });
});
