import { describe, expect, it } from 'vitest';
import { card, cardLabel, cards, colorOf, isFace, joker, standardDeck } from '@/domain/cards';
import { DEFAULT_CONFIG, defineConfig, validateConfig } from '@/domain/config';
import { seededRandomizer } from '@/domain/random';

describe('cards', () => {
  it('parses and prints notation', () => {
    expect(cards('AS 10H TD JKR JKR2').map(cardLabel)).toEqual(['AS', '10H', '10D', 'JKR', 'JKR2']);
    expect(() => card('1S')).toThrow();
    expect(() => card('AX')).toThrow();
  });
  it('builds decks', () => {
    expect(standardDeck(2)).toHaveLength(54);
    expect(new Set(standardDeck(2).map(cardLabel)).size).toBe(54);
    expect(() => standardDeck(3)).toThrow();
  });
  it('colour and face rules', () => {
    expect(colorOf(card('AH'))).toBe('RED');
    expect(colorOf(joker())).toBeNull();
    expect(isFace(card('JS'))).toBe(true);
    expect(isFace(card('AS'))).toBe(false);
    expect(isFace(joker())).toBe(false);
  });
});

describe('config', () => {
  it('default is valid and frozen', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual([]);
    expect(Object.isFrozen(DEFAULT_CONFIG.paytable.multipliers)).toBe(true);
  });
  it('overrides merge and validate', () => {
    expect(defineConfig({ freeGame: { awards: { 'ANY 4 FACES': 12 } } }).freeGame.awards['ANY 5 FACES']).toBe(40);
    expect(() => defineConfig({ doubleDown: { highLowLowHold: 4 } })).toThrow(/differ/);
    expect(() => defineConfig({ progressive: { counters: { 'ROYAL FLUSH': { initial: 1, increment: 0.0001 } } } })).toThrow();
  });
});

describe('seeded randomizer', () => {
  it('is reproducible and in range', () => {
    const a = seededRandomizer(42);
    const b = seededRandomizer(42);
    const xs = Array.from({ length: 1000 }, () => a.int(0, 6));
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b.int(0, 6)));
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(5);
    const deck = seededRandomizer(1).shuffle(standardDeck(2));
    expect(new Set(deck.map(cardLabel)).size).toBe(54);
  });
});
