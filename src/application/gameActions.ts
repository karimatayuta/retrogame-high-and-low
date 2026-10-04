/**
 * Binds the plain game steps (steps.ts) to XState: apply the context patch,
 * emit the game events, save when asked. Kept separate so the machine file
 * reads as a diagram.
 */
import { enqueueActions } from 'xstate';
import type { SessionEvent } from './commands';
import type { GameEvent } from './events';
import { buildSaveData, type SessionContext } from './sessionContext';
import type { Step } from './steps';
import type { SessionPhase } from './view';

/** What the machine emits to the outside (the facade collects them). */
export type GameEmitted = { type: 'game'; event: GameEvent };

function persist(ctx: SessionContext, refundBet: boolean): void {
  try {
    ctx.saveRepository.save(buildSaveData(ctx, refundBet)); // false (failure) is ignored: the game runs without saving
  } catch {
    // a throwing repository must not break the game either
  }
}

/** Wrap a step as a machine action. */
export function act(step: Step) {
  return enqueueActions<SessionContext, SessionEvent, undefined, SessionEvent, never, never, never, never, GameEmitted>(
    ({ context, event, enqueue }) => {
      const result = step(context, event);
      const patch = result.patch;
      if (patch !== undefined) enqueue.assign(patch);
      for (const e of result.events ?? []) enqueue.emit({ type: 'game', event: e });
      if (result.save) {
        const refund = result.save === 'refundBet';
        // runs after the assign above, so it sees the patched context
        enqueue(({ context: after }: { context: SessionContext }) => persist(after, refund));
      }
    },
  );
}

/** The phase (stable state name) the machine is in, for rejection messages. */
export function phaseOf(value: unknown): SessionPhase {
  return String(value) as SessionPhase;
}
