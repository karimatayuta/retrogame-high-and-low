/** Shared test helpers for the GameSession tests (scripted decks, fake repository). */
import { createGameSession, type GameSession } from '@/application/gameSession';
import type { SaveRepository } from '@/application/ports';
import type { SaveData } from '@/application/saveData';
import { defineConfig, type GameConfig } from '@/domain/config';
import type { GameEvent, EventKind } from '@/application/events';
import { cards, sameCard, type Card } from '@/domain/cards';
import { seededRandomizer, type Randomizer } from '@/domain/random';
import type { SessionPhase } from '@/application/view';

// Hands (54-card main deck). The names are the hand ranks they evaluate to.
export const NOTHING = '2S 5H 9D JC KS';
export const JOKER_ANYTHING = 'JKR 2S 5H 9D 4C';
export const TWO_PAIR = '2S 2H 5D 5C 9S';
export const THREE_KIND = '7S 7H 7D 2C 9S';
export const FOUR_KIND = '9S 9H 9D 9C 2S';
export const ROYAL = '10S JS QS KS AS';
export const THREE_BLACK_FACES = 'JS QS KC 2H 5D'; // free game: 5 games
export const FIVE_KIND = '9S 9H 9D 9C JKR'; // no faces: no free game
export const FOUR_FACES_FIVE_KIND = 'KS KC KH KD JKR'; // 4 faces (10 games) AND five of a kind

export const STANDARD_WIN = '5S 9H 3D 5C 2H'; // HOLD 2 (9H) wins, HOLD 4 (5C) draws, HOLD 5 (2H) loses
export const RB_WIN = '5S 9C 3D 5H 2S'; // HOLD 2 (9C black) wins, HOLD 3 (3D red) loses

/**
 * Randomizer: each `shuffle` call consumes one scripted "front" (cards put on top).
 * When the script is exhausted (or a front is ""), the deck is just seeded-shuffled.
 */
export function scriptedRng(decks: readonly string[] = [], seed = 0): Randomizer {
  const inner = seededRandomizer(seed);
  const queue = [...decks];
  return {
    next: () => inner.next(),
    int: (min, max) => inner.int(min, max),
    pick: (items) => inner.pick(items),
    shuffle<T>(items: T[]): T[] {
      inner.shuffle(items);
      const text = queue.shift() ?? '';
      const front: Card[] = text.trim() === '' ? [] : cards(text);
      for (const c of [...front].reverse()) {
        const i = (items as unknown as Card[]).findIndex((x) => sameCard(x, c));
        if (i < 0) throw new Error(`scripted card ${JSON.stringify(c)} not in deck`);
        items.splice(i, 1);
        items.unshift(c as unknown as T);
      }
      return items;
    },
  };
}

/** In-memory SaveRepository. */
export class FakeRepository implements SaveRepository {
  saves = 0;
  constructor(
    public data: SaveData | null = null,
    public fail = false,
    public throws = false,
  ) {}
  load(): SaveData | null {
    return this.data;
  }
  save(data: SaveData): boolean {
    this.saves += 1;
    if (this.throws) throw new Error('disk on fire');
    if (this.fail) return false;
    this.data = structuredClone(data);
    return true;
  }
}

export interface ConfigOptions {
  fiveProgressive?: number;
  halfInHighLow?: boolean;
  credits?: number;
  progressiveInFreeGame?: boolean;
}

/** Default config, HIGH & LOW in FAIR mode (cards come off the scripted deck). */
export function makeConfig(o: ConfigOptions = {}): GameConfig {
  const five = o.fiveProgressive;
  return defineConfig({
    progressive: {
      incrementInFreeGame: o.progressiveInFreeGame ?? false,
      ...(five === undefined ? {} : { counters: { 'FIVE OF A KIND': { initial: five, increment: 0.05 } } }),
    },
    doubleDown: { highLowDrawMode: 'FAIR', halfDoubleAllowedInHighLow: o.halfInHighLow ?? false },
    economy: { initialCredits: o.credits ?? 1000 },
  });
}

export function makeSession(
  decks: readonly string[] = [],
  opts: { config?: GameConfig; repo?: FakeRepository; seed?: number } = {},
): GameSession {
  return createGameSession({
    config: opts.config ?? makeConfig(),
    rng: scriptedRng(decks, opts.seed ?? 0),
    saveRepository: opts.repo ?? new FakeRepository(),
  });
}

/** Bet `bet` medals one by one and deal (the scripted deck decides the hand). */
export function playToWin(s: GameSession, bet = 4): void {
  for (let i = 0; i < bet; i++) accepted(s.send({ type: 'BET_ONE' }));
  accepted(s.send({ type: 'DEAL' }));
}

export function accepted(ok: boolean): void {
  if (!ok) throw new Error('command was rejected');
}

export const hold = (s: GameSession, n: number): boolean => s.send({ type: 'HOLD', n });

export function kinds(s: GameSession): EventKind[] {
  return s.drainEvents().map((e) => e.kind);
}

/** A session sitting in `phase`. `extra` is the deck of the double game. */
export function sessionIn(phase: SessionPhase, extra: string = STANDARD_WIN): GameSession {
  if (phase === 'BETTING') return makeSession();
  if (phase === 'FREE_GAME') {
    const s = makeSession([THREE_BLACK_FACES]);
    playToWin(s, 1);
    return s;
  }
  const s = makeSession([JOKER_ANYTHING, extra]);
  playToWin(s, 4); // JOKER ANYTHING pays 4
  expectPhase(s, 'DOUBLE_SELECT');
  if (phase === 'DOUBLE_SELECT') return s;
  const n = { STANDARD_PICK: 2, HIGH_LOW_GUESS: 3, RED_BLACK_PICK: 4 }[phase];
  accepted(hold(s, n));
  expectPhase(s, phase);
  return s;
}

function expectPhase(s: GameSession, phase: SessionPhase): void {
  if (s.phase !== phase) throw new Error(`expected phase ${phase}, got ${s.phase}`);
}

/** credits == initial + medals - bets paid + medals won (an undealt bet counts as paid). */
export function ledgerOk(s: GameSession, initial: number, medals = 0): boolean {
  const v = s.view();
  const undealt = v.phase === 'BETTING' ? v.bet : 0;
  return v.credits === initial + medals - s.stats.totalBet - undealt + s.stats.totalWon;
}

export type { GameEvent };
