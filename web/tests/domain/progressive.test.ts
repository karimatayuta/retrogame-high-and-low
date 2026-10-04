import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, defineConfig } from '@/domain/config';
import { PROGRESSIVE_LINES, type ProgressiveLine } from '@/domain/enums';
import { ProgressivePool } from '@/domain/progressive';

const CFG = DEFAULT_CONFIG.progressive;
const FS: ProgressiveLine = 'FLUSH / STRAIGHT';
const ceilDiv = (a: number, b: number): number => -Math.floor(-a / b);

describe('ProgressivePool', () => {
  it('starts at the initial values', () => {
    const p = new ProgressivePool(CFG);
    expect(p.snapshot()).toEqual({
      'FIVE OF A KIND': 2500,
      'ROYAL FLUSH': 1250,
      'STRAIGHT FLUSH': 250,
      '4 OF A KIND / FULL HOUSE': 40,
      'FLUSH / STRAIGHT': 32,
    });
    expect(p.displayValue(FS)).toBe(32);
  });

  it('display is the exact ceil (no float drift) for 2000 increments', () => {
    const p = new ProgressivePool(CFG);
    for (let k = 1; k <= 2000; k++) {
      p.addMaxBetGame();
      expect(p.displayValue(FS)).toBe(ceilDiv(6400 + 67 * k, 200));
      expect(p.displayValue('STRAIGHT FLUSH')).toBe(ceilDiv(250_000 + 35 * k, 1000));
      expect(p.displayValue('ROYAL FLUSH')).toBe(ceilDiv(125_000 + 3 * k, 100));
    }
  });

  it('FLUSH/STRAIGHT 32 + 0.335 x 100 displays exactly 66 (ceil 65.5)', () => {
    const p = new ProgressivePool(CFG);
    for (let i = 0; i < 100; i++) p.addMaxBetGame();
    expect(p.value(FS)).toBe(65.5);
    expect(p.displayValue(FS)).toBe(66);
  });

  it('exact integers are not bumped: 0.05 x 1000 on FIVE OF A KIND is exactly 2550', () => {
    const p = new ProgressivePool(CFG);
    for (let i = 0; i < 1000; i++) p.addMaxBetGame();
    expect(p.displayValue('FIVE OF A KIND')).toBe(2550);
    expect(p.displayValue('STRAIGHT FLUSH')).toBe(285); // 250 + 35 exactly
    expect(p.displayValue('ROYAL FLUSH')).toBe(1280);
    expect(p.displayValue('4 OF A KIND / FULL HOUSE')).toBe(280);
  });

  it('award pays ceil and resets only that line', () => {
    const p = new ProgressivePool(CFG);
    for (let i = 0; i < 10; i++) p.addMaxBetGame();
    const before = p.snapshot();
    expect(p.award(FS)).toBe(36);
    const after = p.snapshot();
    expect(after[FS]).toBe(32);
    for (const ln of PROGRESSIVE_LINES) if (ln !== FS) expect(after[ln]).toBe(before[ln]);
  });

  it('restores values and round-trips through snapshot', () => {
    const p = new ProgressivePool(CFG);
    for (let i = 0; i < 777; i++) p.addMaxBetGame();
    const q = new ProgressivePool(CFG, p.snapshot());
    for (const ln of PROGRESSIVE_LINES) expect(q.displayValue(ln)).toBe(p.displayValue(ln));
    q.addMaxBetGame();
    p.addMaxBetGame();
    expect(q.snapshot()).toEqual(p.snapshot());
  });

  it('partial values and clamp to initial', () => {
    const p = new ProgressivePool(CFG, { [FS]: 100.5 });
    expect(p.displayValue(FS)).toBe(101);
    expect(p.displayValue('4 OF A KIND / FULL HOUSE')).toBe(40);
    expect(new ProgressivePool(CFG, { [FS]: 1 }).value(FS)).toBe(32);
    expect(new ProgressivePool(CFG, { [FS]: -5 }).value(FS)).toBe(32);
  });

  it('rejects unknown lines and non-finite values', () => {
    const p = new ProgressivePool(CFG);
    for (const bad of ['TWO PAIR', 'JOKER ANYTHING', 'THREE OF A KIND', '__proto__']) {
      const line = bad as ProgressiveLine;
      expect(() => p.value(line)).toThrow();
      expect(() => p.award(line)).toThrow();
      expect(() => p.displayValue(line)).toThrow();
      expect(() => new ProgressivePool(CFG, { [bad]: 5 } as Partial<Record<ProgressiveLine, number>>)).toThrow();
    }
    for (const bad of [NaN, Infinity, -Infinity]) expect(() => new ProgressivePool(CFG, { [FS]: bad })).toThrow();
  });

  it('snapshot is a copy', () => {
    const p = new ProgressivePool(CFG);
    const s = p.snapshot();
    s[FS] = 9999;
    expect(p.value(FS)).toBe(32);
  });

  it('honours changed config (3-decimal increments)', () => {
    const cfg = defineConfig({ progressive: { counters: { [FS]: { initial: 10, increment: 0.001 } } } }).progressive;
    const p = new ProgressivePool(cfg);
    for (let i = 0; i < 1000; i++) p.addMaxBetGame();
    expect(p.value(FS)).toBe(11);
    expect(p.displayValue(FS)).toBe(11);
    p.addMaxBetGame();
    expect(p.displayValue(FS)).toBe(12);
  });
});

describe('ProgressivePool restored value bounds (review)', () => {
  it('rejects values whose thousandths are not safe integers', async () => {
    const { ProgressivePool } = await import('@/domain/progressive');
    const { DEFAULT_CONFIG } = await import('@/domain/config');
    expect(() => new ProgressivePool(DEFAULT_CONFIG.progressive, { 'FIVE OF A KIND': 1e306 })).toThrow();
  });
});
