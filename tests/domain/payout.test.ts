import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG as C, defineConfig } from '@/domain/config';
import { HAND_RANKS, HAND_TO_PAYLINE, isProgressiveLine } from '@/domain/enums';
import { settleMainGame } from '@/domain/payout';
import { ProgressivePool } from '@/domain/progressive';

const pool = (): ProgressivePool => new ProgressivePool(C.progressive);
const PAID = HAND_RANKS.filter((h) => h !== 'NOTHING');

describe('settleMainGame', () => {
  it.each([1, 2, 3, 4])('normal bet %i pays bet x multiplier', (bet) => {
    for (const hand of PAID) {
      const p = settleMainGame(hand, bet, pool(), C, { freeGame: false });
      expect(p.amount).toBe(bet * C.paytable.multipliers[HAND_TO_PAYLINE[hand]]);
      expect(p.progressiveLine).toBeNull();
    }
  });

  it('max bet pays fixed or progressive (fresh pool = initial)', () => {
    for (const hand of PAID) {
      const line = HAND_TO_PAYLINE[hand];
      const p = settleMainGame(hand, 5, pool(), C, { freeGame: false });
      expect(p.amount).toBe(C.paytable.maxBetPayouts[line]);
      expect(p.progressiveLine).toBe(isProgressiveLine(line) ? line : null);
    }
  });

  it('progressive pays the counter and resets it', () => {
    const pl = pool();
    for (let i = 0; i < 10; i++) pl.addMaxBetGame();
    const p = settleMainGame('FLUSH', 5, pl, C, { freeGame: false });
    expect(p.amount).toBe(36);
    expect(p.progressiveLine).toBe('FLUSH / STRAIGHT');
    expect(pl.value('FLUSH / STRAIGHT')).toBe(32);
    expect(pl.displayValue('4 OF A KIND / FULL HOUSE')).toBe(43);
  });

  it('no progressive below max bet (bet 4) and counters untouched', () => {
    const pl = pool();
    for (let i = 0; i < 10; i++) pl.addMaxBetGame();
    const snap = pl.snapshot();
    const p = settleMainGame('ROYAL FLUSH', 4, pl, C, { freeGame: false });
    expect(p.amount).toBe(1000);
    expect(pl.snapshot()).toEqual(snap);
  });

  it('NOTHING pays 0', () => {
    expect(settleMainGame('NOTHING', 5, pool(), C, { freeGame: false }).amount).toBe(0);
    const p = settleMainGame('NOTHING', 3, pool(), C, { freeGame: false });
    expect([p.amount, p.line, p.progressiveLine]).toEqual([0, null, null]);
  });

  it('does not increment', () => {
    const pl = pool();
    settleMainGame('TWO PAIR', 5, pl, C, { freeGame: false });
    expect(pl.snapshot()).toEqual(pool().snapshot());
  });

  it.each([1, 2, 3, 4, 5])('free game minimum is the bet (bet %i)', (bet) => {
    expect(settleMainGame('NOTHING', bet, pool(), C, { freeGame: true }).amount).toBe(bet);
    const p = settleMainGame('JOKER ANYTHING', bet, pool(), C, { freeGame: true });
    expect(p.amount).toBe(bet === 5 ? 8 : 2 * bet);
  });

  it('free game doubles the progressive', () => {
    const pl = pool();
    for (let i = 0; i < 10; i++) pl.addMaxBetGame();
    const p = settleMainGame('STRAIGHT', 5, pl, C, { freeGame: true });
    expect(p.amount).toBe(72);
    expect(p.progressiveLine).toBe('FLUSH / STRAIGHT');
    expect(pl.value('FLUSH / STRAIGHT')).toBe(32);
  });

  it('min payout rule can be disabled', () => {
    const cfg = defineConfig({ freeGame: { minPayoutIsBet: false } });
    expect(settleMainGame('NOTHING', 3, pool(), cfg, { freeGame: true }).amount).toBe(0);
  });

  it.each([0, 6, -1, 2.5, NaN, Infinity])('bad bet %s throws', (bet) => {
    expect(() => settleMainGame('NOTHING', bet, pool(), C, { freeGame: false })).toThrow(RangeError);
  });

  it('result is consistent when the progressive counter has grown past the free-game minimum', () => {
    const pl = pool();
    for (let i = 0; i < 100; i++) pl.addMaxBetGame();
    expect(settleMainGame('FLUSH', 5, pl, C, { freeGame: true }).amount).toBe(132); // ceil(65.5)=66 x2
  });
});
