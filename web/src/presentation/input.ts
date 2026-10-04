/**
 * Input mapping: keys / buttons -> Action -> session Command. Pure (no DOM).
 *
 *   1-5 HOLD   B BET   M MAX BET   Space/Enter DEAL / DOUBLE / skip   Up/Down HIGH/LOW
 *   C COLLECT  A add medals   S toggle CRT   N mute
 *
 * Whether a button is *enabled* is derived from the SessionView only (never re-implementing rules).
 */
import type { Command } from '@/application/commands';
import type { SessionView } from '@/application/view';

export type Action =
  | { readonly kind: 'hold'; readonly n: number }
  | { readonly kind: 'bet' }
  | { readonly kind: 'maxBet' }
  | { readonly kind: 'deal' }
  | { readonly kind: 'collect' }
  | { readonly kind: 'high' }
  | { readonly kind: 'low' }
  | { readonly kind: 'addMedals' }
  | { readonly kind: 'crt' }
  | { readonly kind: 'mute' };

/** Actions that only touch the presentation (allowed any time, never locked). */
export const isUiAction = (a: Action): boolean => a.kind === 'crt' || a.kind === 'mute';

const KEYS: Readonly<Record<string, Action>> = {
  '1': { kind: 'hold', n: 1 },
  '2': { kind: 'hold', n: 2 },
  '3': { kind: 'hold', n: 3 },
  '4': { kind: 'hold', n: 4 },
  '5': { kind: 'hold', n: 5 },
  b: { kind: 'bet' },
  m: { kind: 'maxBet' },
  ' ': { kind: 'deal' },
  enter: { kind: 'deal' },
  c: { kind: 'collect' },
  arrowup: { kind: 'high' },
  arrowdown: { kind: 'low' },
  a: { kind: 'addMedals' },
  s: { kind: 'crt' },
  n: { kind: 'mute' },
  f1: { kind: 'mute' },
};

/** `KeyboardEvent.key` -> Action (null for keys the game does not use). */
export function actionForKey(key: string): Action | null {
  return KEYS[key.toLowerCase()] ?? null;
}

/** The command an action stands for in the current view (null for UI actions). */
export function toCommand(action: Action, view: SessionView): Command | null {
  switch (action.kind) {
    case 'hold':
      return { type: 'HOLD', n: action.n };
    case 'bet':
      return { type: 'BET_ONE' };
    case 'maxBet':
      return { type: 'MAX_BET' };
    case 'deal':
      if (view.phase === 'DOUBLE_SELECT') return { type: 'DOUBLE' };
      if (view.phase === 'FREE_GAME') return { type: 'ADVANCE' };
      return { type: 'DEAL' };
    case 'collect':
      return { type: 'COLLECT' };
    case 'high':
      return { type: 'GUESS', guess: 'HIGH' };
    case 'low':
      return { type: 'GUESS', guess: 'LOW' };
    case 'addMedals':
      return { type: 'ADD_MEDALS' };
    case 'crt':
    case 'mute':
      return null;
  }
}

/** Label of the DEAL button for the phase. */
export function dealLabel(view: SessionView): string {
  if (view.phase === 'FREE_GAME') return 'NEXT';
  if (view.phase === 'DOUBLE_SELECT') return 'DOUBLE';
  return 'DEAL';
}

/** Would pressing this action do something useful right now? (Derived from the view only.) */
export function isEnabled(action: Action, view: SessionView): boolean {
  const betting = view.phase === 'BETTING';
  switch (action.kind) {
    case 'bet':
      return betting && view.bet < view.maxBet && view.credits >= 1;
    case 'maxBet':
      return betting && view.maxBet - view.bet <= view.credits;
    case 'deal':
      if (betting) return view.bet > 0 || (view.lastBet >= 1 && view.lastBet <= view.credits);
      if (view.phase === 'DOUBLE_SELECT') return view.menu.find((m) => m.item === 'STANDARD')?.enabled ?? false;
      return view.phase === 'FREE_GAME';
    case 'collect':
      return view.canCollect;
    case 'addMedals':
      return betting;
    case 'hold': {
      const label = view.holdLabels[action.n - 1];
      if (!label) return false;
      if (view.menu.length > 0) return view.menu[action.n - 1]?.enabled ?? false;
      return true;
    }
    case 'high':
    case 'low':
      return view.phase === 'HIGH_LOW_GUESS';
    case 'crt':
    case 'mute':
      return true;
  }
}
