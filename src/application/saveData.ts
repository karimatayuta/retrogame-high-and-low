/** Save data model (CREDITS, progressive counters, stats). Validation: T1.2 (Agent B). */
import { PROGRESSIVE_LINES, type ProgressiveLine } from '@/domain/enums';

export interface Stats {
  readonly gamesPlayed: number;
  readonly totalBet: number;
  readonly totalWon: number;
  readonly biggestWin: number;
  readonly freeGamesPlayed: number;
}

export interface SaveData {
  readonly version: 1;
  readonly credits: number;
  /** Raw progressive values (medals, may be fractional). Missing lines start at their initial value. */
  readonly progressive: Readonly<Partial<Record<ProgressiveLine, number>>>;
  readonly stats: Stats;
}

export const EMPTY_STATS: Stats = Object.freeze({ gamesPlayed: 0, totalBet: 0, totalWon: 0, biggestWin: 0, freeGamesPlayed: 0 });

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function nonNegInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
}

/**
 * Defensive validation of untrusted (JSON-parsed) save data. Returns null when
 * the save is unusable (wrong shape, unknown version, bad credits). Bad
 * individual progressive values / stats fields are dropped, not the whole save.
 * Extra keys are ignored.
 */
export function parseSaveData(raw: unknown): SaveData | null {
  if (!isRecord(raw)) return null;
  if (raw['version'] !== undefined && raw['version'] !== 1) return null;
  const credits = raw['credits'];
  if (!nonNegInt(credits)) return null;

  const progressive: Partial<Record<ProgressiveLine, number>> = {};
  const rawProg = raw['progressive'];
  if (isRecord(rawProg)) {
    for (const line of PROGRESSIVE_LINES) {
      const v = Object.hasOwn(rawProg, line) ? rawProg[line] : undefined;
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) progressive[line] = v;
    }
  }

  let stats: Stats = EMPTY_STATS;
  const rawStats = raw['stats'];
  if (isRecord(rawStats)) {
    const field = (k: keyof Stats): number => (nonNegInt(rawStats[k]) ? rawStats[k] : 0);
    stats = {
      gamesPlayed: field('gamesPlayed'),
      totalBet: field('totalBet'),
      totalWon: field('totalWon'),
      biggestWin: field('biggestWin'),
      freeGamesPlayed: field('freeGamesPlayed'),
    };
  }
  return { version: 1, credits, progressive, stats };
}
