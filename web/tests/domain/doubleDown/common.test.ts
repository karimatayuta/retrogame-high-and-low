import { describe, expect, it } from 'vitest';
import { defineConfig } from '@/domain/config';
import { applyCap, canDouble, canHalfDouble, DoubleDownError, mustAutoSettle, splitHalf } from '@/domain/doubleDown/common';

const CFG = defineConfig().doubleDown;

describe('common', () => {
  it.each([
    [7, 4, 3],
    [8, 4, 4],
    [1, 1, 0],
    [2, 1, 1],
    [0, 0, 0],
  ])('splitHalf(%i)', (amount, kept, stake) => {
    expect(splitHalf(amount)).toEqual({ kept, stake });
  });

  it('splitHalf rejects negative / fractional', () => {
    expect(() => splitHalf(-1)).toThrow(RangeError);
    expect(() => splitHalf(1.5)).toThrow(RangeError);
  });

  it('half double refused for 1', () => {
    expect(canHalfDouble(1)).toBe(false);
    expect(canHalfDouble(0)).toBe(false);
    expect(canHalfDouble(2)).toBe(true);
    expect(canHalfDouble(5000, CFG)).toBe(true);
    expect(canHalfDouble(5001, CFG)).toBe(false);
  });

  it.each([
    [0, false, false],
    [1, true, false],
    [5000, true, false],
    [5001, false, true],
    [10000, false, true],
  ])('boundaries %i', (amount, doubling, auto) => {
    expect(canDouble(amount, CFG)).toBe(doubling);
    expect(mustAutoSettle(amount, CFG)).toBe(auto);
  });

  it('applyCap', () => {
    expect(applyCap(9999, CFG)).toBe(9999);
    expect(applyCap(10000, CFG)).toBe(10000);
    expect(applyCap(10001, CFG)).toBe(10000);
  });

  it('DoubleDownError is an Error', () => {
    const e = new DoubleDownError('x');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('DoubleDownError');
  });

  it('non-integer amounts cannot be doubled', () => {
    expect(canDouble(1.5, CFG)).toBe(false);
    expect(canDouble(Number.NaN, CFG)).toBe(false);
  });
});
