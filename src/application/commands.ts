/** Commands the presentation sends to the session (they are the machine's events). */
import type { HighLowGuess } from '@/domain/enums';

export type Command =
  | { readonly type: 'BET_ONE' }
  | { readonly type: 'MAX_BET' }
  | { readonly type: 'DEAL' }
  | { readonly type: 'ADVANCE' }
  | { readonly type: 'HOLD'; readonly n: number }
  | { readonly type: 'DOUBLE' }
  | { readonly type: 'COLLECT' }
  | { readonly type: 'GUESS'; readonly guess: HighLowGuess }
  | { readonly type: 'ADD_MEDALS' };

export type CommandType = Command['type'];
export const COMMAND_TYPES: readonly CommandType[] = [
  'BET_ONE', 'MAX_BET', 'DEAL', 'ADVANCE', 'HOLD', 'DOUBLE', 'COLLECT', 'GUESS', 'ADD_MEDALS',
];

/** Internal event sent by `GameSession.shutdown()` (D13): settle what is pending, then save. */
export type ShutdownEvent = { readonly type: 'SHUTDOWN' };

export type SessionEvent = Command | ShutdownEvent;
