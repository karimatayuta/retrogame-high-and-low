import { describe, expect, it } from 'vitest';
import { card } from '@/domain/cards';
import { defineConfig } from '@/domain/config';
import { DoubleDownError } from '@/domain/doubleDown/common';
import { RedBlackDouble } from '@/domain/doubleDown/redBlack';
import { seededRandomizer } from '@/domain/random';
import { scripted } from './helpers';

const CFG = defineConfig().doubleDown;

describe('red & black', () => {
  it('same colour wins, different loses', () => {
    let r = new RedBlackDouble(10, CFG, scripted('7S 8H 6C 2D KC')).pick(2);
    expect(r.won).toBe(true);
    expect(r.payout).toBe(20);
    expect(r.flush).toBe(false);
    r = new RedBlackDouble(10, CFG, scripted('7S 8H 6C 2D KC')).pick(1);
    expect(r.won).toBe(false);
    expect(r.payout).toBe(0);
    expect(r.cards).toHaveLength(5);
  });

  it('no jokers in the deck', () => {
    expect(CFG.redBlackJokers).toBe(0);
    for (let seed = 0; seed < 100; seed++) {
      const r = new RedBlackDouble(1, CFG, seededRandomizer(seed)).pick(1);
      expect(r.cards.every((c) => c.kind === 'normal')).toBe(true);
    }
  });

  it('flush pays x10', () => {
    const g = new RedBlackDouble(10, CFG, scripted('2H 5H 9H JH KH'));
    const r = g.pick(3);
    expect(r.flush && r.won).toBe(true);
    expect(r.payout).toBe(100);
    expect(g.phase).toBe('FINISHED');
    expect(g.finished).toBe(true);
  });

  it('flush cap applies to the total', () => {
    expect(new RedBlackDouble(2000, CFG, scripted('2H 5H 9H JH KH')).pick(1).payout).toBe(10000);
    expect(new RedBlackDouble(900, CFG, scripted('2C 5C 9C JC KC')).pick(1).payout).toBe(9000);
    expect(new RedBlackDouble(1001, CFG, scripted('2C 5C 9C JC KC')).pick(1).payout).toBe(10000);
  });

  it('same colour but not flush is x2', () => {
    const r = new RedBlackDouble(10, CFG, scripted('2H 5D 9H JH KH')).pick(1);
    expect(r.flush).toBe(false);
    expect(r.payout).toBe(20);
  });

  it('picked index and cards', () => {
    const g = new RedBlackDouble(10, CFG, scripted('2H 5D 9H JH KH'));
    expect(g.dealerCard).toEqual(card('2H'));
    expect(g.result).toBeNull();
    const r = g.pick(4);
    expect(r.pickedIndex).toBe(4);
    expect(g.result).toBe(r);
  });

  it('flush bonus follows config', () => {
    const cfg = defineConfig({ doubleDown: { redBlackFlushBonusMultiplier: 3 } }).doubleDown;
    expect(new RedBlackDouble(10, cfg, scripted('2H 5H 9H JH KH')).pick(1).payout).toBe(50);
  });

  it('illegal', () => {
    const g = new RedBlackDouble(10, CFG, scripted());
    for (const bad of [0, 5, -1, 2.5]) expect(() => g.pick(bad)).toThrow(DoubleDownError);
    g.pick(1);
    expect(() => g.pick(1)).toThrow(DoubleDownError);
    for (const stake of [0, 5001, -1]) expect(() => new RedBlackDouble(stake, CFG, scripted())).toThrow(DoubleDownError);
  });

  it('win rate is about 25/51', () => {
    const rng = seededRandomizer(1);
    const n = 20000;
    let wins = 0;
    for (let i = 0; i < n; i++) if (new RedBlackDouble(1, CFG, rng).pick(1).won) wins++;
    expect(Math.abs(wins / n - 25 / 51)).toBeLessThan(0.02);
  });
});
