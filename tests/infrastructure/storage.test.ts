import { describe, expect, it } from 'vitest';
import type { SaveData } from '@/application/saveData';
import { LocalStorageSaveRepository, MemorySaveRepository } from '@/infrastructure/localStorageSaveRepository';

const sample: SaveData = {
  version: 1,
  credits: 1234,
  progressive: { 'FLUSH / STRAIGHT': 40.5, '4 OF A KIND / FULL HOUSE': 41 },
  stats: { gamesPlayed: 3, totalBet: 15, totalWon: 9, biggestWin: 8, freeGamesPlayed: 1 },
};

function fakeStorage(init: Record<string, string> = {}): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}

describe('LocalStorageSaveRepository', () => {
  it('round-trips and overwrites', () => {
    const repo = new LocalStorageSaveRepository('k', fakeStorage());
    expect(repo.load()).toBeNull();
    expect(repo.save(sample)).toBe(true);
    expect(repo.load()).toEqual(sample);
    expect(repo.save({ ...sample, credits: 1 })).toBe(true);
    expect(repo.load()?.credits).toBe(1);
  });

  it('uses the default key', () => {
    const s = fakeStorage();
    new LocalStorageSaveRepository(undefined, s).save(sample);
    expect(s.getItem('twinjokers.save.v1')).not.toBeNull();
  });

  it.each(['{not json', '', '[]', 'null', '{"credits": -5}', '{"credits": "abc"}', '"str"', '{"credits": 1, "version": 9}'])(
    'corrupted %j loads as null',
    (text) => {
      expect(new LocalStorageSaveRepository('k', fakeStorage({ k: text })).load()).toBeNull();
    },
  );

  it('keeps a save with a bad progressive entry', () => {
    const s = fakeStorage({ k: '{"credits": 5, "progressive": {"BAD": 1, "ROYAL FLUSH": 1300}}' });
    expect(new LocalStorageSaveRepository('k', s).load()?.progressive).toEqual({ 'ROYAL FLUSH': 1300 });
  });

  it('never throws when storage methods throw (quota, access)', () => {
    const boom = (): never => {
      throw new DOMException('nope', 'QuotaExceededError');
    };
    const s: Storage = { ...fakeStorage(), getItem: boom, setItem: boom };
    const repo = new LocalStorageSaveRepository('k', s);
    expect(repo.load()).toBeNull();
    expect(repo.save(sample)).toBe(false);
  });

  it('never throws when merely accessing globalThis.localStorage throws', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      const repo = new LocalStorageSaveRepository();
      expect(() => repo.load()).not.toThrow();
      expect(repo.load()).toBeNull();
      expect(repo.save(sample)).toBe(false);
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('handles absent or null storage', () => {
    expect(new LocalStorageSaveRepository('k', null).load()).toBeNull();
    expect(new LocalStorageSaveRepository('k', null).save(sample)).toBe(false);
    // node has no localStorage global
    const repo = new LocalStorageSaveRepository('k');
    expect(repo.load()).toBeNull();
    expect(repo.save(sample)).toBe(false);
  });

  it('save serialisation failure returns false', () => {
    const cyc = { ...sample } as { self?: unknown };
    cyc.self = cyc;
    expect(new LocalStorageSaveRepository('k', fakeStorage()).save(cyc as unknown as SaveData)).toBe(false);
  });
});

describe('MemorySaveRepository', () => {
  it('stores copies', () => {
    const repo = new MemorySaveRepository();
    expect(repo.load()).toBeNull();
    expect(repo.save(sample)).toBe(true);
    expect(repo.load()).toEqual(sample);
    expect(repo.load()).not.toBe(sample);
  });
});
