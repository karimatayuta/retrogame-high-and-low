import { afterEach, describe, expect, it, vi } from 'vitest';
import { cryptoRandomizer } from '@/infrastructure/cryptoRandom';

afterEach(() => vi.restoreAllMocks());

describe('cryptoRandomizer', () => {
  it('next() is in [0,1), int() in range, shuffle is a permutation, pick works', () => {
    const r = cryptoRandomizer();
    for (let i = 0; i < 2000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThan(6);
    }
    const xs = Array.from({ length: 54 }, (_, i) => i);
    expect([...r.shuffle([...xs])].sort((a, b) => a - b)).toEqual(xs);
    expect(r.pick([7])).toBe(7);
    expect(() => r.pick([])).toThrow();
  });

  it('covers every value of a small range (not stuck)', () => {
    const r = cryptoRandomizer();
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(0, 6));
    expect(seen.size).toBe(6);
  });

  it('refills its buffer (more draws than buffer size) and calls getRandomValues in bulk', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const r = cryptoRandomizer();
    for (let i = 0; i < 1000; i++) r.next();
    expect(spy.mock.calls.length).toBeGreaterThan(1);
    expect(spy.mock.calls.length).toBeLessThan(100);
  });

  it('rejects out of range draws', () => {
    const r = cryptoRandomizer();
    expect(() => r.int(5, 5)).toThrow(RangeError);
    expect(() => r.int(0.5, 3)).toThrow(RangeError);
  });

  it('throws a clear error without crypto', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      expect(() => cryptoRandomizer()).toThrow(/crypto/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
