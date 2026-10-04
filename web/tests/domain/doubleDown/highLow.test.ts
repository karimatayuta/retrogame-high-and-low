import { describe, expect, it } from 'vitest';
import { card, cardKey, cards, isJoker, type Card } from '@/domain/cards';
import { defineConfig } from '@/domain/config';
import { DoubleDownError } from '@/domain/doubleDown/common';
import { HighLowGame } from '@/domain/doubleDown/highLow';
import { seededRandomizer } from '@/domain/random';
import { scripted, seededWithFront } from './helpers';

const ARCADE = defineConfig().doubleDown;
const FAIR = defineConfig({ doubleDown: { highLowDrawMode: 'FAIR' } }).doubleDown;
/** Cap checks need amounts above the default doublable maximum (no validation by design). */
const FAIR_BIG = { ...FAIR, maxAmountToDouble: 20000 };

function fairGame(front: string, stake = 10, mainBet = 1, cfg = FAIR): HighLowGame {
  return new HighLowGame(stake, mainBet, cfg, scripted(front));
}

describe('high & low (FAIR / scripted)', () => {
  it('first card is never a joker', () => {
    for (let seed = 0; seed < 300; seed++) {
      expect(isJoker(new HighLowGame(1, 1, FAIR, seededRandomizer(seed)).baseCard)).toBe(false);
    }
  });

  it('skips a scripted top joker, which stays in the deck', () => {
    const g = new HighLowGame(10, 1, FAIR, scripted('JKR 7S 9H'));
    expect(g.baseCard).toEqual(card('7S'));
    expect(isJoker(g.guess('HIGH').card)).toBe(true);
  });

  it('win continues and the base card moves', () => {
    const g = fairGame('7S 9H 4D');
    const s = g.guess('HIGH');
    expect(s.won).toBe(true);
    expect(s.outcome).toBe('WIN_CONTINUE');
    expect(s.finished).toBe(false);
    expect(s.payout).toBeNull();
    expect(g.amount).toBe(20);
    expect(g.roundsWon).toBe(1);
    expect(g.baseCard).toEqual(card('9H'));
    expect(g.phase).toBe('AWAITING_GUESS');
    expect(g.canCollect).toBe(true);
    const s2 = g.guess('LOW');
    expect(s2.won).toBe(true);
    expect(g.amount).toBe(40);
    expect(g.baseCard).toEqual(card('4D'));
    expect(g.history).toEqual(cards('7S 9H 4D'));
  });

  it('loss', () => {
    const g = fairGame('7S 4H');
    const s = g.guess('HIGH');
    expect(s.won).toBe(false);
    expect(s.outcome).toBe('LOSE');
    expect(g.amount).toBe(0);
    expect(g.payout).toBe(0);
    expect(g.finished).toBe(true);
    expect(g.roundsWon).toBe(0);
    expect(s.payout).toBe(0);
    expect(s.amount).toBe(0);
  });

  it('equal rank loses in both directions', () => {
    for (const guess of ['HIGH', 'LOW'] as const) {
      expect(fairGame('7S 7H').guess(guess).outcome).toBe('LOSE');
    }
  });

  it('collect before the first guess', () => {
    const g = fairGame('7S 9H', 13);
    expect(g.collect()).toBe(13);
    expect(g.payout).toBe(13);
    expect(g.outcome).toBe('COLLECTED');
    expect(g.history).toEqual([card('7S')]);
  });

  it('collect after a win', () => {
    const g = fairGame('7S 9H', 13);
    g.guess('HIGH');
    expect(g.collect()).toBe(26);
    expect(g.payout).toBe(26);
  });

  it('actions after finish raise', () => {
    let g = fairGame('7S 4H');
    g.guess('HIGH');
    expect(() => g.guess('HIGH')).toThrow(DoubleDownError);
    expect(() => g.collect()).toThrow(DoubleDownError);
    expect(g.canCollect).toBe(false);
    g = fairGame('7S 9H');
    g.collect();
    expect(() => g.guess('LOW')).toThrow(DoubleDownError);
    expect(() => g.collect()).toThrow(DoubleDownError);
  });

  it('payout is null until finished', () => {
    const g = fairGame('7S 9H');
    expect(g.payout).toBeNull();
    g.guess('HIGH');
    expect(g.payout).toBeNull();
    expect(g.outcome).toBe('WIN_CONTINUE');
  });

  it('a joker wins but forces the end without bonus', () => {
    const g = fairGame('7S JKR', 10, 5);
    const s = g.guess('LOW');
    expect(s.won).toBe(true);
    expect(s.outcome).toBe('JOKER_END');
    expect(g.finished).toBe(true);
    expect(g.amount).toBe(20);
    expect(g.payout).toBe(20);
    expect(g.bonus).toBe(0);
    expect(g.bonusHand).toBeNull();
    expect(() => g.guess('HIGH')).toThrow(DoubleDownError);
  });

  it('a joker after three wins has no bonus', () => {
    const g = fairGame('5S 9H 5D 9C JKR', 10, 5);
    g.guess('HIGH');
    g.guess('LOW');
    g.guess('HIGH');
    const s = g.guess('HIGH');
    expect(s.outcome).toBe('JOKER_END');
    expect(g.payout).toBe(160);
    expect(g.bonus).toBe(0);
  });

  it('four wins: x16 plus bonus (spec example)', () => {
    const g = fairGame('5S 9H 5D 9C KS', 12, 5);
    for (const guess of ['HIGH', 'LOW', 'HIGH'] as const) expect(g.guess(guess).outcome).toBe('WIN_CONTINUE');
    const s = g.guess('HIGH');
    expect(s.outcome).toBe('COMPLETED');
    expect(s.finished).toBe(true);
    expect(g.amount).toBe(192);
    expect(g.bonusHand).toBe('TWO PAIR');
    expect(g.bonus).toBe(100);
    expect(g.payout).toBe(292);
    expect(s.payout).toBe(292);
    expect(s.bonusHand).toBe('TWO PAIR');
    expect(s.bonus).toBe(100);
    expect(g.roundsWon).toBe(4);
  });

  it('four wins without a bonus hand', () => {
    const g = fairGame('2S 4H 6D 8C 10S', 10, 5);
    let s = g.guess('HIGH');
    for (let i = 0; i < 3; i++) s = g.guess('HIGH');
    expect(s.outcome).toBe('COMPLETED');
    expect(g.bonusHand).toBe('NONE');
    expect(g.bonus).toBe(0);
    expect(g.payout).toBe(160);
  });

  it('auto-settles above 5000', () => {
    const g = fairGame('7S 9H 2D', 3000);
    const s = g.guess('HIGH');
    expect(s.outcome).toBe('AUTO_SETTLED');
    expect(g.amount).toBe(6000);
    expect(g.payout).toBe(6000);
    expect(g.finished).toBe(true);
    expect(g.bonus).toBe(0);
  });

  it('does not auto-settle at exactly 5000', () => {
    const g = fairGame('7S 9H 2D', 2500);
    expect(g.guess('HIGH').outcome).toBe('WIN_CONTINUE');
    expect(g.amount).toBe(5000);
    expect(g.guess('LOW').outcome).toBe('AUTO_SETTLED');
    expect(g.payout).toBe(10000);
  });

  it('stake 5000, one win is capped at 10000', () => {
    const g = fairGame('7S 9H', 5000);
    expect(g.guess('HIGH').outcome).toBe('AUTO_SETTLED');
    expect(g.payout).toBe(10000);
  });

  it('cap applies to amount + bonus', () => {
    let g = new HighLowGame(500, 5, FAIR_BIG, scripted('5S 9H 5D 9C KS'));
    for (const guess of ['HIGH', 'LOW', 'HIGH', 'HIGH'] as const) g.guess(guess);
    expect(g.amount).toBe(8000);
    expect(g.bonus).toBe(100);
    expect(g.payout).toBe(8100);
    g = new HighLowGame(600, 50, FAIR_BIG, scripted('5S 9H 5D 9C KS'));
    for (const guess of ['HIGH', 'LOW', 'HIGH', 'HIGH'] as const) g.guess(guess);
    expect(g.amount).toBe(9600);
    expect(g.bonus).toBe(1000);
    expect(g.payout).toBe(10000);
  });

  it('cap applies when doubling', () => {
    const g = new HighLowGame(6000, 1, FAIR_BIG, scripted('5S 9H'));
    g.guess('HIGH');
    expect(g.amount).toBe(10000);
  });

  it('a royal-flush first-5 pays the huge bonus but is capped', () => {
    const g = new HighLowGame(1000, 5, { ...FAIR_BIG }, scripted('10S JS QS KS AS'));
    for (let i = 0; i < 4; i++) g.guess('HIGH');
    expect(g.bonusHand).toBe('ROYAL FLUSH');
    expect(g.bonus).toBe(5000);
    expect(g.payout).toBe(10000);
  });

  it('illegal construction', () => {
    for (const stake of [0, -1, 5001, 2.5]) {
      expect(() => new HighLowGame(stake, 1, FAIR, scripted())).toThrow(DoubleDownError);
    }
    for (const bet of [0, -1, 1.5]) expect(() => new HighLowGame(10, bet, FAIR, scripted())).toThrow(DoubleDownError);
    expect(() => new HighLowGame(1, 1, FAIR, scripted())).not.toThrow();
    expect(() => new HighLowGame(5000, 1, FAIR, scripted())).not.toThrow();
  });

  it('a bad guess value is rejected and does not consume a card', () => {
    const g = fairGame('7S 9H');
    expect(() => g.guess('MIDDLE' as never)).toThrow(DoubleDownError);
    expect(g.history).toHaveLength(1);
  });

  it('FAIR deck never repeats cards and ends within the round limit', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = new HighLowGame(1, 1, FAIR, seededRandomizer(seed));
      while (!g.finished) g.guess('HIGH');
      expect(new Set(g.history.map(cardKey)).size).toBe(g.history.length);
      expect(g.history.length).toBeLessThanOrEqual(5);
    }
  });

  it('history is a copy', () => {
    const g = fairGame('7S 9H');
    (g.history as Card[]).push(card('2C'));
    expect(g.history).toHaveLength(1);
  });

  it('FAIR win rate for base 7 / HIGH is 29/53', () => {
    const make = seededWithFront(7, '7S');
    const n = 20000;
    let wins = 0;
    for (let i = 0; i < n; i++) if (new HighLowGame(1, 1, FAIR, make()).guess('HIGH').won) wins++;
    expect(Math.abs(wins / n - 29 / 53)).toBeLessThan(0.02);
  });
});

describe('high & low (ARCADE)', () => {
  it('ace HIGH: only a joker can win', () => {
    let g = new HighLowGame(10, 1, ARCADE, scripted('AS', { randoms: [0.0], choices: 'JKR' }));
    expect(g.guess('HIGH').outcome).toBe('JOKER_END');
    const noJoker = { ...ARCADE, highLowJokers: 0 };
    g = new HighLowGame(10, 1, noJoker, scripted('AS', { randoms: [0.0] }));
    const s = g.guess('HIGH');
    expect(s.won).toBe(false);
    expect(isJoker(s.card)).toBe(false);
    if (s.card.kind === 'normal') expect(s.card.rank).toBeLessThanOrEqual(14);
  });

  it('ace HIGH with a joker and a win roll always draws the joker', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = new HighLowGame(10, 1, ARCADE, scripted('AS', { randoms: [0.0], seed }));
      expect(g.guess('HIGH').outcome).toBe('JOKER_END');
    }
  });

  it('two LOW without a joker cannot win', () => {
    const noJoker = { ...ARCADE, highLowJokers: 0 };
    const g = new HighLowGame(10, 1, noJoker, scripted('2S', { randoms: [0.0] }));
    expect(g.guess('LOW').won).toBe(false);
  });

  it('forces a win when no loser remains', () => {
    const g = new HighLowGame(10, 1, ARCADE, scripted('2S', { randoms: [0.99] }));
    (g as unknown as { deck: Card[] }).deck = [card('JKR')];
    const s = g.guess('HIGH');
    expect(s.won).toBe(true);
    expect(s.outcome).toBe('JOKER_END');
  });

  it('a win roll picks only winners', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = new HighLowGame(10, 1, ARCADE, scripted('7S', { randoms: [0.1], seed }));
      const s = g.guess('HIGH');
      expect(s.won).toBe(true);
      expect(s.card.kind === 'joker' || s.card.rank > 7).toBe(true);
    }
  });

  it('a lose roll picks only losers (incl. equal rank)', () => {
    let seenEqual = false;
    for (let seed = 0; seed < 200; seed++) {
      const g = new HighLowGame(10, 1, ARCADE, scripted('7S', { randoms: [0.9], seed }));
      const s = g.guess('HIGH');
      expect(s.won).toBe(false);
      if (s.card.kind !== 'normal') throw new Error('joker drawn on a lose roll');
      expect(s.card.rank).toBeLessThanOrEqual(7);
      seenEqual ||= s.card.rank === 7;
    }
    expect(seenEqual).toBe(true);
  });

  it('drawn cards are removed from the deck', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = new HighLowGame(1, 1, ARCADE, seededRandomizer(seed));
      while (!g.finished) {
        const b = g.baseCard;
        g.guess(b.kind === 'normal' && b.rank > 8 ? 'LOW' : 'HIGH');
      }
      expect(new Set(g.history.map(cardKey)).size).toBe(g.history.length);
    }
  });

  it('win rate is about 62/128 (HIGH from 7, LOW from 9)', () => {
    const n = 20000;
    const rng = seededRandomizer(42);
    const mk = (first: string) => () => ({ ...rng, shuffle: seededWithFrontOn(rng, first) });
    let wins = 0;
    for (let i = 0; i < n; i++) if (new HighLowGame(1, 1, ARCADE, mk('7S')()).guess('HIGH').won) wins++;
    expect(Math.abs(wins / n - 62 / 128)).toBeLessThan(0.02);
    wins = 0;
    for (let i = 0; i < n; i++) if (new HighLowGame(1, 1, ARCADE, mk('9D')()).guess('LOW').won) wins++;
    expect(Math.abs(wins / n - 62 / 128)).toBeLessThan(0.02);
  });

  it('is deterministic for a seed', () => {
    const run = (): string[] => {
      const g = new HighLowGame(10, 1, ARCADE, seededRandomizer(5));
      while (!g.finished) g.guess('HIGH');
      return g.history.map(cardKey);
    };
    expect(run()).toEqual(run());
  });
});

function seededWithFrontOn(rng: ReturnType<typeof seededRandomizer>, first: string) {
  const front = card(first);
  return <T>(items: T[]): T[] => {
    rng.shuffle(items);
    const i = (items as unknown as Card[]).findIndex((x) => cardKey(x) === cardKey(front));
    items.splice(i, 1);
    items.unshift(front as unknown as T);
    return items;
  };
}
