/**
 * Differential test: the TS GameSession must reproduce a frozen golden-master trace
 * (events and views) for the same scripted random stream and command script.
 * The fixture `fixtures/python_trace.json.gz` was recorded from the former Pyxel edition
 * (removed 2026-10-04); its generator no longer exists. If a rule change intentionally
 * alters behaviour, update or retire this test deliberately.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGameSession } from '@/application/gameSession';
import type { Command } from '@/application/commands';
import { defineConfig } from '@/domain/config';
import type { Card } from '@/domain/cards';
import type { Randomizer } from '@/domain/random';
import { MemorySaveRepository } from '@/infrastructure/localStorageSaveRepository';

const M = 2 ** 32;
class Lcg {
  x: number;
  constructor(seed: number) {
    this.x = Number((BigInt(seed) * 2654435761n + 12345n) % BigInt(M));
  }
  u(): number {
    this.x = Number((BigInt(this.x) * 1664525n + 1013904223n) % BigInt(M));
    return this.x;
  }
  int(lo: number, hi: number): number {
    return lo + (this.u() >>> 8) % (hi - lo);
  }
}
function rngOf(seed: number): Randomizer {
  const l = new Lcg(seed);
  return {
    next: () => l.u() / M,
    int: (a, b) => l.int(a, b),
    shuffle<T>(x: T[]): T[] {
      for (let i = x.length - 1; i > 0; i--) {
        const j = l.int(0, i + 1);
        [x[i], x[j]] = [x[j] as T, x[i] as T];
      }
      return x;
    },
    pick: <T>(s: readonly T[]) => s[l.int(0, s.length)] as T,
  };
}
const CMDS = ['BET_ONE','MAX_BET','DEAL','ADVANCE','H1','H2','H3','H4','H5','DOUBLE','COLLECT','HIGH','LOW','ADD_MEDALS','H2','H3','H4','ADVANCE','MAX_BET','DEAL'];
const lab = (c: Card | null): string | null =>
  c === null ? null : c.kind === 'joker' ? 'JKR' : `${({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[c.rank] ?? c.rank}${c.suit}`;

function toCommand(c: string): Command {
  if (c.length === 2 && c[0] === 'H') return { type: 'HOLD', n: Number(c[1]) };
  if (c === 'HIGH' || c === 'LOW') return { type: 'GUESS', guess: c };
  return { type: c as 'BET_ONE' };
}

type Step = { cmd: string; ok: boolean; events: [string, number, string, number, (string | null)[]][]; view: Record<string, unknown> };
const trace = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'fixtures/python_trace.json.gz'))).toString('utf8')) as Step[][];

describe('REVIEW differential vs frozen golden-master trace', () => {
  it('matches the golden-master trace (events and views)', () => {
    const diffs: string[] = [];
    const seen = new Set<string>();
    trace.forEach((steps, seed) => {
      const s = createGameSession({ config: defineConfig(), rng: rngOf(seed), saveRepository: new MemorySaveRepository() });
      const cmdr = new Lcg(seed + 100000);
      for (let i = 0; i < steps.length && diffs.length < 15; i++) {
        const exp = steps[i] as Step;
        const c = CMDS[cmdr.int(0, CMDS.length)] as string;
        expect(c).toBe(exp.cmd);
        const ok = s.send(toCommand(c));
        const ev = s.drainEvents().map((e) => [e.kind, e.amount, e.kind === 'REJECTED' ? '' : e.detail, e.index, e.cards.map(lab)]);
        const v = s.view();
        seen.add(v.phase);
        const got = {
          phase: v.phase, message: v.message, credits: v.credits, bet: v.bet, lastBet: v.lastBet, win: v.win, lastPayout: v.lastPayout,
          cards: v.cards.map(lab), faceUp: [...v.faceUp], highlight: v.highlight, handRank: v.handRank, paidLine: v.paidLine,
          gamePayout: v.gamePayout, fgLeft: v.freeGamesLeft, fgPlayed: v.freeGamesPlayed, fgTotal: v.freeGameTotal, fgWin: v.freeGameWin,
          progressive: v.progressive, doubleKind: v.doubleKind, halfDouble: v.halfDouble,
          menu: v.menu.map((m) => [m.label, m.enabled, m.selected]), holdLabels: [...v.holdLabels], canCollect: v.canCollect,
          hl: v.highLow === null ? null : [v.highLow.active, v.highLow.roundsWon, v.highLow.currentAmount, v.highLow.nextAmount, v.highLow.bonusHand, v.highLow.bonusAmount, v.highLow.outcome],
          stats: { games_played: s.stats.gamesPlayed, total_bet: s.stats.totalBet, total_won: s.stats.totalWon, biggest_win: s.stats.biggestWin, free_games_played: s.stats.freeGamesPlayed },
        };
        const want = JSON.parse(JSON.stringify(exp.view)) as Record<string, unknown>;
        want['stats'] = Object.fromEntries(Object.entries(want['stats'] as object).filter(([k]) => k in got.stats));
        const a = JSON.stringify([ok, ev, got]);
        const b = JSON.stringify([exp.ok, exp.events, want]);
        if (a !== b) {
          diffs.push(`seed ${seed} step ${i} cmd ${c}\n  TS:  ${a.slice(0, 900)}\n  PY:  ${b.slice(0, 900)}`);
          break;
        }
      }
    });
    expect([...seen].sort()).toHaveLength(6);
    expect(diffs.join('\n')).toBe('');
  });
});
