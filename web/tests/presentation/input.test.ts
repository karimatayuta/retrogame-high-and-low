import { describe, expect, it } from 'vitest';
import { createGameSession } from '@/application/gameSession';
import { seededRandomizer } from '@/domain/random';
import { MemorySaveRepository } from '@/infrastructure/localStorageSaveRepository';
import { chooseAction, mulberry32 } from '@/presentation/autoplay';
import { actionForKey, dealLabel, isEnabled, toCommand } from '@/presentation/input';
import { loadPrefs, savePrefs } from '@/presentation/prefs';
import { SFX_NAMES } from '@/presentation/chiptune';
import { immediateSfx, planStages } from '@/presentation/stages';
import { gameEvent } from '@/application/events';

const make = (seed: number) => createGameSession({ rng: seededRandomizer(seed), saveRepository: new MemorySaveRepository() });

describe('keys', () => {
  it('maps the documented keys', () => {
    expect(actionForKey('1')).toEqual({ kind: 'hold', n: 1 });
    expect(actionForKey('B')).toEqual({ kind: 'bet' });
    expect(actionForKey(' ')).toEqual({ kind: 'deal' });
    expect(actionForKey('Enter')).toEqual({ kind: 'deal' });
    expect(actionForKey('ArrowUp')).toEqual({ kind: 'high' });
    expect(actionForKey('ArrowDown')).toEqual({ kind: 'low' });
    expect(actionForKey('s')).toEqual({ kind: 'crt' });
    expect(actionForKey('n')).toEqual({ kind: 'mute' });
    expect(actionForKey('x')).toBeNull();
  });
});

describe('commands and enabled state', () => {
  it('derives enabled buttons from the view', () => {
    const s = make(1);
    const v = s.view();
    expect(isEnabled({ kind: 'bet' }, v)).toBe(true);
    expect(isEnabled({ kind: 'collect' }, v)).toBe(false);
    expect(isEnabled({ kind: 'hold', n: 1 }, v)).toBe(false);
    expect(isEnabled({ kind: 'deal' }, v)).toBe(false); // nothing bet yet, no last bet
    expect(toCommand({ kind: 'deal' }, v)).toEqual({ type: 'DEAL' });
    expect(dealLabel(v)).toBe('DEAL');
  });

  it('deal means DOUBLE in the double select and ADVANCE in a free game', () => {
    for (let seed = 1; seed < 400; seed++) {
      const s = make(seed);
      s.send({ type: 'MAX_BET' });
      const v = s.view();
      if (v.phase === 'DOUBLE_SELECT') {
        expect(toCommand({ kind: 'deal' }, v)).toEqual({ type: 'DOUBLE' });
        expect(dealLabel(v)).toBe('DOUBLE');
        expect(isEnabled({ kind: 'collect' }, v)).toBe(true);
        expect(isEnabled({ kind: 'hold', n: 3 }, v)).toBe(true);
      }
      if (v.phase === 'FREE_GAME') {
        expect(toCommand({ kind: 'deal' }, v)).toEqual({ type: 'ADVANCE' });
        return;
      }
    }
    throw new Error('no free game seed in range');
  });

  it('the bot only ever plays what the session accepts or politely rejects, and never throws', () => {
    for (const seed of [1, 2, 3]) {
      const s = make(seed);
      const r = mulberry32(seed);
      let accepted = 0;
      for (let i = 0; i < 3000; i++) {
        const v = s.view();
        if (v.phase === 'FREE_GAME') {
          s.send({ type: 'ADVANCE' });
          continue;
        }
        const a = chooseAction(v, r);
        const cmd = a && toCommand(a, v);
        if (cmd && s.send(cmd)) accepted++;
        s.drainEvents();
      }
      expect(accepted).toBeGreaterThan(1000);
    }
  });
});

describe('sounds and stages', () => {
  it('maps immediate events to existing sfx', () => {
    for (const k of ['BET', 'CREDITS_ADDED', 'REJECTED', 'HALF_DOUBLE_TOGGLED'] as const) {
      expect(SFX_NAMES).toContain(immediateSfx(gameEvent(k)));
    }
    expect(immediateSfx(gameEvent('DEAL'))).toBeNull();
  });

  it('every sfx used by a stage exists', () => {
    for (let seed = 1; seed < 150; seed++) {
      const s = make(seed);
      s.send({ type: 'MAX_BET' });
      const v = s.view();
      const stages = planStages(s.drainEvents(), v);
      expect(stages.length).toBeGreaterThan(0);
      for (const st of stages) for (const n of [st.sfx, st.startSfx]) if (n) expect(SFX_NAMES).toContain(n);
    }
  });
});

describe('prefs', () => {
  it('round trips and survives broken storage', () => {
    const store = new Map<string, string>();
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    savePrefs({ muted: true, crt: false }, fake);
    expect(loadPrefs(fake)).toEqual({ muted: true, crt: false });
    store.set([...store.keys()][0] as string, '{bad');
    expect(loadPrefs(fake)).toEqual({ muted: false, crt: true });
    const throwing = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(loadPrefs(throwing).muted).toBe(false);
    expect(() => savePrefs({ muted: true, crt: true }, throwing)).not.toThrow();
  });
});
