import { describe, expect, it } from 'vitest';
import { forEachCombination } from './combinations';

describe('forEachCombination', () => {
  it('yields C(n,k) distinct sorted combos', () => {
    const out: string[] = [];
    forEachCombination([1, 2, 3, 4, 5], 3, (c) => out.push(c.join('')));
    expect(out).toHaveLength(10);
    expect(new Set(out).size).toBe(10);
    expect(out[0]).toBe('123');
    expect(out[9]).toBe('345');
  });
  it('handles k=0, k=n, k>n', () => {
    let n = 0;
    forEachCombination([1, 2], 0, () => n++);
    expect(n).toBe(1);
    n = 0;
    forEachCombination([1, 2], 2, () => n++);
    expect(n).toBe(1);
    n = 0;
    forEachCombination([1, 2], 3, () => n++);
    expect(n).toBe(0);
  });
});
