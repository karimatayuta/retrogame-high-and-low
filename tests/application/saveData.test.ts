import { describe, expect, it } from 'vitest';
import { EMPTY_STATS, parseSaveData, type SaveData } from '@/application/saveData';

const good: SaveData = {
  version: 1,
  credits: 1234,
  progressive: { 'FLUSH / STRAIGHT': 40.5, '4 OF A KIND / FULL HOUSE': 41 },
  stats: { gamesPlayed: 3, totalBet: 15, totalWon: 9, biggestWin: 8, freeGamesPlayed: 1 },
};

describe('parseSaveData', () => {
  it('round-trips through JSON', () => {
    expect(parseSaveData(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it.each([null, undefined, 5, 'x', [], {}, { credits: -5 }, { credits: 1.5 }, { credits: '1' }, { credits: NaN },
    { credits: Infinity }, { credits: 1e300 }, { credits: 1, version: 2 }, { credits: null }])('rejects %j', (raw) => {
    expect(parseSaveData(raw)).toBeNull();
  });

  it('accepts credits 0 and missing optional parts', () => {
    expect(parseSaveData({ credits: 0 })).toEqual({ version: 1, credits: 0, progressive: {}, stats: EMPTY_STATS });
  });

  it('drops bad individual progressive values, keeps the rest', () => {
    const r = parseSaveData({
      credits: 10,
      progressive: { 'FLUSH / STRAIGHT': NaN, 'ROYAL FLUSH': 'x', 'STRAIGHT FLUSH': -3, 'FIVE OF A KIND': 2600, 'TWO PAIR': 9, BAD: 1, '__proto__': 1 },
    });
    expect(r?.progressive).toEqual({ 'FIVE OF A KIND': 2600 });
  });

  it('survives JSON null / non-object progressive and stats', () => {
    expect(parseSaveData({ credits: 1, progressive: null, stats: 7 })).toEqual({ version: 1, credits: 1, progressive: {}, stats: EMPTY_STATS });
    expect(parseSaveData({ credits: 1, progressive: [1, 2], stats: [] })?.progressive).toEqual({});
  });

  it('sanitizes stats per field', () => {
    const r = parseSaveData({ credits: 1, stats: { gamesPlayed: 4, totalBet: -1, totalWon: 1.5, biggestWin: 'x', extra: 1 } });
    expect(r?.stats).toEqual({ gamesPlayed: 4, totalBet: 0, totalWon: 0, biggestWin: 0, freeGamesPlayed: 0 });
  });

  it('ignores extra keys', () => {
    const r = parseSaveData({ credits: 1, hack: true });
    expect(r).not.toBeNull();
    expect(r).not.toHaveProperty('hack');
  });
});
