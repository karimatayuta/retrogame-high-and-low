/**
 * Debug scenes for `?scene=NAME`: find a seed whose first MAX BET game reaches the wanted
 * situation, plus the button presses that lead to the scene. Dev / screenshot helper only.
 */
import type { GameSession } from '@/application/gameSession';
import type { Action } from '@/presentation/input';
import { toCommand } from '@/presentation/input';

export const SCENE_NAMES = ['win', 'standard', 'redblack', 'highlow', 'freegame', 'jackpot'] as const;
export type SceneName = (typeof SCENE_NAMES)[number];

export interface Scene {
  readonly seed: number;
  readonly script: readonly Action[];
}

const hold = (n: number): Action => ({ kind: 'hold', n });

const SCRIPTS: Readonly<Record<SceneName, readonly Action[]>> = {
  win: [{ kind: 'maxBet' }],
  standard: [{ kind: 'maxBet' }, { kind: 'deal' }],
  redblack: [{ kind: 'maxBet' }, hold(4)],
  highlow: [{ kind: 'maxBet' }, hold(3)],
  freegame: [{ kind: 'maxBet' }],
  jackpot: [{ kind: 'maxBet' }],
};

const WANTED_PHASE: Readonly<Record<SceneName, string | null>> = {
  win: 'DOUBLE_SELECT',
  standard: 'STANDARD_PICK',
  redblack: 'RED_BLACK_PICK',
  highlow: 'HIGH_LOW_GUESS',
  freegame: 'FREE_GAME',
  jackpot: null,
};

export function isSceneName(name: string | null): name is SceneName {
  return name !== null && (SCENE_NAMES as readonly string[]).includes(name);
}

export function findScene(name: SceneName, makeSession: (seed: number) => GameSession, limit = 5000): Scene | null {
  const script = SCRIPTS[name];
  for (let seed = 1; seed <= limit; seed++) {
    const session = makeSession(seed);
    let progressive = false;
    for (const a of script) {
      const cmd = toCommand(a, session.view());
      if (!cmd) break;
      session.send(cmd);
      for (const e of session.drainEvents()) if (e.kind === 'PROGRESSIVE_WON') progressive = true;
    }
    const want = WANTED_PHASE[name];
    const ok = want === null ? progressive && session.view().phase === 'DOUBLE_SELECT' : session.view().phase === want;
    if (ok) return { seed, script };
  }
  return null;
}
