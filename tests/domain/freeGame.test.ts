import { describe, expect, it } from 'vitest';
import { cards } from '@/domain/cards';
import { DEFAULT_CONFIG, defineConfig } from '@/domain/config';
import type { FreeGameTrigger } from '@/domain/enums';
import { detectFreeGame } from '@/domain/freeGame';

const CFG = DEFAULT_CONFIG.freeGame;

const CASES: [string, FreeGameTrigger | null][] = [
  ['JH QH KH JD QD', '5 R/B FACES'],
  ['JS QS KC JC QC', '5 R/B FACES'],
  ['JH QH KH JD QS', 'ANY 5 FACES'],
  ['JH QH KH JS QS', 'ANY 5 FACES'],
  ['JH QH KH JD 2S', '4 R/B FACES'],
  ['JH QH KH JS 2S', 'ANY 4 FACES'],
  ['JH QH KH 2D 3S', '3 R/B FACES'],
  ['JH QH KS 2D 3S', null],
  ['JH QH KS QS 3S', 'ANY 4 FACES'],
  ['JH QH KS 4S 3S', null],
  ['JH QH KH JKR JKR2', '3 R/B FACES'], // jokers never count
  ['JH QH JKR JKR2 KH', '3 R/B FACES'],
  ['JH QH KH QD JKR', '4 R/B FACES'],
  ['AH 10H 9S 2C 3D', null],
  ['JKR JKR2 AH 2H 3H', null],
];

describe('detectFreeGame', () => {
  it.each(CASES)('%s -> %s', (hand, expected) => {
    expect(detectFreeGame(cards(hand), CFG)).toBe(expected);
  });

  it('most games wins, not list order', () => {
    const cfg = defineConfig({ freeGame: { awards: { 'ANY 5 FACES': 150 } } }).freeGame;
    expect(detectFreeGame(cards('JH QH KH JD QD'), cfg)).toBe('ANY 5 FACES');
    expect(detectFreeGame(cards('JH QH KH JD QS'), CFG)).toBe('ANY 5 FACES');
    const cfg2 = defineConfig({ freeGame: { awards: { 'ANY 4 FACES': 30 } } }).freeGame;
    expect(detectFreeGame(cards('JH QH KH JD 2S'), cfg2)).toBe('ANY 4 FACES');
  });

  it('ties go to the earlier trigger', () => {
    const cfg = defineConfig({ freeGame: { awards: { 'ANY 5 FACES': 100 } } }).freeGame;
    expect(detectFreeGame(cards('JH QH KH JD QD'), cfg)).toBe('5 R/B FACES');
  });

  it('works on fewer than 5 cards without crashing', () => {
    expect(detectFreeGame([], CFG)).toBeNull();
    expect(detectFreeGame(cards('JH QH KH'), CFG)).toBe('3 R/B FACES');
  });
});
