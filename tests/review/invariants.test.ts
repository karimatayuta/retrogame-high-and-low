/** REVIEW: view/acceptance consistency, shutdown + save/restore money conservation, tampered saves. */
import { describe, expect, it } from 'vitest';
import { createGameSession, type GameSession } from '@/application/gameSession';
import type { Command } from '@/application/commands';
import { parseSaveData } from '@/application/saveData';
import { defineConfig } from '@/domain/config';
import { seededRandomizer } from '@/domain/random';
import { MemorySaveRepository } from '@/infrastructure/localStorageSaveRepository';

const CMDS: Command[] = [
  { type: 'BET_ONE' }, { type: 'MAX_BET' }, { type: 'DEAL' }, { type: 'ADVANCE' },
  { type: 'HOLD', n: 1 }, { type: 'HOLD', n: 2 }, { type: 'HOLD', n: 3 }, { type: 'HOLD', n: 4 }, { type: 'HOLD', n: 5 },
  { type: 'DOUBLE' }, { type: 'COLLECT' }, { type: 'GUESS', guess: 'HIGH' }, { type: 'GUESS', guess: 'LOW' },
  { type: 'HOLD', n: 2 }, { type: 'HOLD', n: 4 }, { type: 'MAX_BET' }, { type: 'DEAL' }, { type: 'ADVANCE' },
];

function fresh(seed: number, repo = new MemorySaveRepository()): GameSession {
  return createGameSession({ config: defineConfig(), rng: seededRandomizer(seed), saveRepository: repo });
}
/** deterministic replay of the first `n` commands of the script of `seed` */
function replay(seed: number, n: number, repo = new MemorySaveRepository()): GameSession {
  const s = fresh(seed, repo);
  const pick = seededRandomizer(seed + 7);
  for (let i = 0; i < n; i++) s.send(pick.pick(CMDS));
  return s;
}

describe('REVIEW view <-> acceptance consistency', () => {
  it('canCollect / menu enabled / holdLabels agree with what the machine accepts', () => {
    const bad: string[] = [];
    const phases = new Set<string>();
    for (let seed = 0; seed < 25; seed++) {
      for (let n = 0; n < 160; n++) {
        const probe = replay(seed, n);
        const v = probe.view();
        phases.add(v.phase);
        const check = (label: string, cmd: Command, expected: boolean): void => {
          const s = replay(seed, n);
          const ok = s.send(cmd);
          if (ok !== expected) bad.push(`seed ${seed} step ${n} ${v.phase}: ${label} accepted=${ok} expected=${expected}`);
        };
        check('COLLECT', { type: 'COLLECT' }, v.canCollect);
        if (v.phase === 'DOUBLE_SELECT') {
          v.menu.forEach((m, i) => check(`menu ${m.label}`, { type: 'HOLD', n: i + 1 }, m.enabled));
        } else if (v.phase === 'STANDARD_PICK' || v.phase === 'RED_BLACK_PICK' || v.phase === 'HIGH_LOW_GUESS') {
          v.holdLabels.forEach((l, i) => check(`hold ${i + 1} label "${l}"`, { type: 'HOLD', n: i + 1 }, l !== ''));
        }
      }
    }
    expect(phases.size).toBe(6);
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120_000);
});

describe('REVIEW shutdown / save-restore', () => {
  it('after shutdown() the saved credits equal the in-memory credits plus the undealt bet, and a restored session continues identically', () => {
    const bad: string[] = [];
    for (let seed = 0; seed < 40; seed++) {
      for (let n = 0; n < 200; n += 3) {
        const repo = new MemorySaveRepository();
        const s = replay(seed, n, repo);
        s.shutdown();
        const v = s.view();
        const saved = repo.load();
        if (v.phase !== 'BETTING') bad.push(`seed ${seed} step ${n}: phase ${v.phase} after shutdown`);
        if (v.win !== 0) bad.push(`seed ${seed} step ${n}: win ${v.win} left after shutdown`);
        if (n > 0 && saved === null) { bad.push(`seed ${seed} step ${n}: nothing saved`); continue; }
        if (saved !== null && saved.credits !== v.credits + v.bet) bad.push(`seed ${seed} step ${n}: saved ${saved.credits} != ${v.credits}+${v.bet}`);
        // idempotent
        s.shutdown();
        const saved2 = repo.load();
        if (saved !== null && JSON.stringify(saved2) !== JSON.stringify(saved)) bad.push(`seed ${seed} step ${n}: second shutdown changed the save`);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });

  it('progressive counters survive a save/restore round trip exactly', () => {
    for (let seed = 0; seed < 20; seed++) {
      const repo = new MemorySaveRepository();
      const s = replay(seed, 150, repo);
      s.shutdown();
      const before = s.view().progressive;
      const s2 = createGameSession({ config: defineConfig(), rng: seededRandomizer(1), saveRepository: repo });
      expect(s2.view().progressive).toEqual(before);
    }
  });
});

describe('REVIEW tampered save data', () => {
  const base = { version: 1, credits: 10, stats: {} };
  it('huge progressive values must not display/pay Infinity', () => {
    const repo = new MemorySaveRepository();
    repo.save({ ...parseSaveData(base)!, progressive: { 'FIVE OF A KIND': 1e306 } });
    const s = createGameSession({ config: defineConfig(), rng: seededRandomizer(1), saveRepository: repo });
    const shown = s.view().progressive['FIVE OF A KIND'];
    expect(Number.isFinite(shown)).toBe(true);
  });
  it('progressive above payoutCap is clamped (display never exceeds the 10000 cap)', () => {
    const repo = new MemorySaveRepository();
    repo.save({ ...parseSaveData(base)!, progressive: { 'FIVE OF A KIND': 5e9 } });
    const s = createGameSession({ config: defineConfig(), rng: seededRandomizer(1), saveRepository: repo });
    expect(s.view().progressive['FIVE OF A KIND']).toBeLessThanOrEqual(10000);
  });
  it('credits beyond the safe integer range are rejected', () => {
    expect(parseSaveData({ ...base, credits: Number.MAX_SAFE_INTEGER })).not.toBeNull(); // documents current behaviour
    const s = createGameSession({ config: defineConfig(), rng: seededRandomizer(1), saveRepository: (() => { const r = new MemorySaveRepository(); r.save({ version: 1, credits: Number.MAX_SAFE_INTEGER, progressive: {}, stats: parseSaveData(base)!.stats }); return r; })() });
    s.send({ type: 'MAX_BET' });
    expect(Number.isSafeInteger(s.view().credits)).toBe(true);
  });
});
