/** Fuzz: random valid and invalid commands from random phases must never break the session. */
import { describe, expect, it } from 'vitest';
import { createGameSession, type GameSession } from '@/application/gameSession';
import type { Command } from '@/application/commands';
import { SESSION_PHASES, type SessionPhase } from '@/application/view';
import { seededRandomizer, type Randomizer } from '@/domain/random';
import { FakeRepository, ledgerOk, makeConfig } from './sessionHelpers';

function randomCommand(r: Randomizer): Command | { type: string; [k: string]: unknown } {
  const pick = r.int(0, 15);
  switch (pick) {
    case 0: return { type: 'BET_ONE' };
    case 1: return { type: 'MAX_BET' };
    case 2:
    case 3: return { type: 'DEAL' };
    case 4:
    case 5: return { type: 'ADVANCE' };
    case 6:
    case 7:
    case 8: return { type: 'HOLD', n: r.pick([-1, 0, 1, 2, 3, 4, 5, 6, 2.5, Number.NaN]) };
    case 9: return { type: 'DOUBLE' };
    case 10: return { type: 'COLLECT' };
    case 11: return { type: 'GUESS', guess: r.pick(['HIGH', 'LOW', 'MID']) };
    case 12: return r.next() < 0.3 ? { type: 'ADD_MEDALS' } : { type: 'COLLECT' };
    case 13: return { type: 'NOPE' };
    default: return { type: 'HOLD', n: r.int(1, 6) };
  }
}

/** Whatever the phase, a sane player can always get back to BETTING. */
function escapeToBetting(s: GameSession): void {
  for (let i = 0; i < 5000; i++) {
    const phase = s.phase;
    if (phase === 'BETTING') return;
    if (phase === 'FREE_GAME') expect(s.send({ type: 'ADVANCE' })).toBe(true);
    else if (phase === 'DOUBLE_SELECT' || phase === 'HIGH_LOW_GUESS' || s.view().canCollect) expect(s.send({ type: 'COLLECT' })).toBe(true);
    else expect(s.send({ type: 'HOLD', n: 2 })).toBe(true); // standard draw: pick again
  }
  throw new Error(`stuck in ${s.phase}`);
}

describe('fuzz', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`10,000 random commands keep the invariants (seed ${seed})`, () => {
      const r = seededRandomizer(seed * 7919);
      const initial = 40; // small bankroll: exercises insufficient credits and add medals
      const repo = new FakeRepository(null, seed === 4); // seed 4: every save fails
      const s = createGameSession({ config: makeConfig({ credits: initial }), rng: seededRandomizer(seed), saveRepository: repo });
      let medals = 0;
      const seen = new Set<SessionPhase>();
      for (let step = 0; step < 10_000; step++) {
        const betBefore = s.stats.totalBet;
        const ok = s.send(randomCommand(r) as Command);
        const events = s.drainEvents();
        expect(events.some((e) => e.kind === 'REJECTED')).toBe(!ok);
        for (const e of events) if (e.kind === 'CREDITS_ADDED') medals += e.amount;
        const v = s.view();
        seen.add(v.phase);
        expect(v.credits).toBeGreaterThanOrEqual(0);
        expect(v.win).toBeGreaterThanOrEqual(0);
        expect(v.win).toBeLessThanOrEqual(10_000);
        expect(v.bet).toBeGreaterThanOrEqual(0);
        expect(v.bet).toBeLessThanOrEqual(5);
        expect(v.cards).toHaveLength(5);
        expect(v.faceUp).toHaveLength(5);
        expect(v.paytable).toHaveLength(8);
        expect(Number.isInteger(v.credits)).toBe(true);
        expect(ledgerOk(s, initial, medals)).toBe(true);
        expect(s.stats.totalBet).toBeGreaterThanOrEqual(betBefore);
        if (v.phase !== 'BETTING') expect(v.bet).toBeGreaterThan(0);
        if (v.phase === 'FREE_GAME') expect(v.freeGamesLeft).toBeGreaterThan(0);
        if (step % 250 === 249) {
          escapeToBetting(s);
          expect(s.phase).toBe('BETTING');
        }
      }
      expect(repo.data === null || repo.data.credits >= 0).toBe(true);
      expect(new Set(seen)).toEqual(new Set(SESSION_PHASES)); // the fuzz really visited every phase
      s.shutdown();
      expect(s.phase).toBe('BETTING');
      expect(ledgerOk(s, initial, medals)).toBe(true);
    });
  }

  it('shutdown from any random point loses no medals', () => {
    for (let seed = 10; seed < 40; seed++) {
      const r = seededRandomizer(seed);
      const repo = new FakeRepository();
      const s = createGameSession({ config: makeConfig({ credits: 60 }), rng: seededRandomizer(seed), saveRepository: repo });
      let medals = 0;
      for (let step = 0; step < 300; step++) {
        s.send(randomCommand(r) as Command);
        for (const e of s.drainEvents()) if (e.kind === 'CREDITS_ADDED') medals += e.amount;
      }
      s.shutdown();
      expect(s.phase).toBe('BETTING');
      const credits = s.view().credits + s.view().bet; // an undealt bet is given back in the save
      expect(ledgerOk(s, 60, medals)).toBe(true);
      expect(repo.data?.credits).toBe(credits); // what a reload would show
    }
  });

  it('high-volume autoplay with a sensible strategy keeps the economy consistent', () => {
    const r = seededRandomizer(7);
    const initial = 1000;
    const s = createGameSession({ config: makeConfig({ credits: initial }), rng: seededRandomizer(7), saveRepository: new FakeRepository() });
    let medals = 0;
    for (let game = 0; game < 3000; game++) {
      if (s.view().credits < 5) {
        s.send({ type: 'ADD_MEDALS' });
        medals += 100;
      }
      s.send({ type: 'MAX_BET' });
      for (let guard = 0; s.phase !== 'BETTING'; guard++) {
        expect(guard).toBeLessThan(5000);
        if (s.phase === 'FREE_GAME') s.send({ type: 'ADVANCE' });
        else if (s.phase === 'DOUBLE_SELECT') s.send(r.next() < 0.5 ? { type: 'HOLD', n: r.pick([2, 3, 4]) } : { type: 'COLLECT' });
        else if (s.phase === 'HIGH_LOW_GUESS') s.send(r.next() < 0.7 ? { type: 'HOLD', n: r.pick([2, 4]) } : { type: 'COLLECT' });
        else if (s.view().canCollect && r.next() < 0.3) s.send({ type: 'COLLECT' });
        else s.send({ type: 'HOLD', n: r.int(2, 6) });
      }
      expect(ledgerOk(s, initial, medals)).toBe(true);
      s.drainEvents();
    }
  });

  it('the same seed and commands give the same views (deterministic)', () => {
    const run = (): string => {
      const r = seededRandomizer(99);
      const s = createGameSession({ config: makeConfig(), rng: seededRandomizer(5), saveRepository: new FakeRepository() });
      const trace: unknown[] = [];
      for (let i = 0; i < 500; i++) {
        s.send(randomCommand(r) as Command);
        const v = s.view();
        trace.push([v.phase, v.credits, v.win, v.message]);
      }
      return JSON.stringify(trace);
    };
    expect(run()).toBe(run());
  });
});
