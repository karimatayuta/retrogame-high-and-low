import { describe, expect, it } from 'vitest';
import { card, cardKey, cards } from '@/domain/cards';
import { defineConfig } from '@/domain/config';
import { DoubleDownError } from '@/domain/doubleDown/common';
import { StandardDouble, standardStrength } from '@/domain/doubleDown/standard';
import { seededRandomizer } from '@/domain/random';
import { scripted } from './helpers';

const CFG = defineConfig().doubleDown;

describe('standard double', () => {
  it('strength order', () => {
    expect(standardStrength(card('2S'))).toBeLessThan(standardStrength(card('KS')));
    expect(standardStrength(card('KS'))).toBeLessThan(standardStrength(card('AS')));
    expect(standardStrength(card('AS'))).toBeLessThan(standardStrength(card('JKR')));
  });

  it('win / lose', () => {
    let g = new StandardDouble(10, CFG, scripted('7S 8H 6H 7D KC'));
    expect(g.dealerCard).toEqual(card('7S'));
    const r = g.pick(1);
    expect(r.outcome).toBe('WIN');
    expect(r.payout).toBe(20);
    expect(r.cards).toEqual(cards('7S 8H 6H 7D KC'));
    expect(g.phase).toBe('FINISHED');
    expect(g.finished).toBe(true);
    expect(g.canCollect).toBe(true);
    g = new StandardDouble(10, CFG, scripted('7S 8H 6H 7D KC'));
    const l = g.pick(2);
    expect(l.outcome).toBe('LOSE');
    expect(l.payout).toBe(0);
    expect(g.canCollect).toBe(false);
  });

  it('draw requires redeal and blocks collect', () => {
    const g = new StandardDouble(10, CFG, scripted('7S 8H 6H 7D KC'));
    const r = g.pick(3);
    expect(r.outcome).toBe('DRAW');
    expect(r.canCollect).toBe(false);
    expect(r.payout).toBe(0);
    expect(g.canCollect).toBe(false);
    expect(g.phase).toBe('NEEDS_REDEAL');
    expect(() => g.pick(1)).toThrow(DoubleDownError);
    g.redeal();
    expect(g.phase).toBe('AWAITING_PICK');
    expect(g.result).toBeNull();
    expect(g.stake).toBe(10);
    g.pick(1);
    expect(() => g.redeal()).toThrow(DoubleDownError);
  });

  it('redeal reshuffles (a new deal, not a replay)', () => {
    let tested = 0;
    for (let seed = 0; seed < 400 && tested < 5; seed++) {
      const g = new StandardDouble(10, CFG, seededRandomizer(seed));
      const first = g.pick(1);
      if (first.outcome !== 'DRAW') continue;
      g.redeal();
      expect(g.pick(1).cards.map(cardKey)).not.toEqual(first.cards.map(cardKey));
      tested++;
    }
    expect(tested).toBe(5);
  });

  it('joker dealer: only a joker draws', () => {
    let g = new StandardDouble(10, CFG, scripted('JKR AS JKR2 2C KS'));
    expect(g.pick(1).outcome).toBe('LOSE');
    g = new StandardDouble(10, CFG, scripted('JKR AS JKR2 2C KS'));
    expect(g.pick(2).outcome).toBe('DRAW');
  });

  it('joker pick beats ace', () => {
    expect(new StandardDouble(10, CFG, scripted('AS JKR 2C 3C 4C')).pick(1).outcome).toBe('WIN');
  });

  it('cap', () => {
    expect(new StandardDouble(5000, CFG, scripted('2S 3H 4H 5D 6C')).pick(1).payout).toBe(10000);
    const cfg = defineConfig({ doubleDown: { payoutCap: 7000 } }).doubleDown;
    expect(new StandardDouble(5000, cfg, scripted('2S 3H 4H 5D 6C')).pick(1).payout).toBe(7000);
  });

  it('illegal calls', () => {
    // dealer slot, out of range, fractional, NaN
    for (const bad of [0, 5, -1, 99, 1.5, Number.NaN]) {
      expect(() => new StandardDouble(10, CFG, scripted()).pick(bad)).toThrow(DoubleDownError);
    }
    const g = new StandardDouble(10, CFG, scripted('7S 8H 6H 2D KC'));
    g.pick(1);
    expect(() => g.pick(2)).toThrow(DoubleDownError); // pick twice
    expect(() => g.redeal()).toThrow(DoubleDownError);
    for (const stake of [0, -3, 5001, 1.5]) {
      expect(() => new StandardDouble(stake, CFG, scripted())).toThrow(DoubleDownError);
    }
  });

  it('a bad pick does not consume the round', () => {
    const g = new StandardDouble(10, CFG, scripted('7S 8H 6H 2D KC'));
    expect(() => g.pick(0)).toThrow(DoubleDownError);
    expect(g.phase).toBe('AWAITING_PICK');
    expect(g.pick(1).outcome).toBe('WIN');
  });

  it('stake boundaries', () => {
    expect(() => new StandardDouble(1, CFG, scripted())).not.toThrow();
    expect(() => new StandardDouble(5000, CFG, scripted())).not.toThrow();
  });

  it('five distinct cards; deck has 54 cards by default', () => {
    expect(CFG.standardJokers).toBe(2);
    for (let seed = 0; seed < 200; seed++) {
      const r = new StandardDouble(1, CFG, seededRandomizer(seed)).pick(1);
      expect(new Set(r.cards.map(cardKey)).size).toBe(5);
    }
  });

  it('results are frozen / readonly snapshots', () => {
    const r = new StandardDouble(10, CFG, scripted('7S 8H 6H 7D KC')).pick(1);
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.cards)).toBe(true);
  });

  it('natural win rate matches the 54-card deck', () => {
    // P(win) over random slots: by symmetry P(win) = P(lose) = (1 - P(draw)) / 2, P(draw) from rank multiplicities.
    const rng = seededRandomizer(123);
    const n = 20000;
    let win = 0;
    let draw = 0;
    for (let i = 0; i < n; i++) {
      const o = new StandardDouble(1, CFG, rng).pick(1).outcome;
      if (o === 'WIN') win++;
      if (o === 'DRAW') draw++;
    }
    // draw: same rank. 13 ranks x 4 cards: 4*3 ordered pairs, joker 2*1; over 54*53.
    const pDraw = (13 * 4 * 3 + 2) / (54 * 53);
    expect(draw / n).toBeCloseTo(pDraw, 1);
    expect(Math.abs(win / n - (1 - pDraw) / 2)).toBeLessThan(0.02);
  });
});
