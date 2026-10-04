/**
 * GameSession: the facade the presentation layer talks to.
 *
 *   session.send({ type: 'BET_ONE' });   // command in (never throws; invalid -> REJECTED event)
 *   const view = session.view();         // draw this
 *   for (const e of session.drainEvents()) ...  // play sounds / animations
 *
 * Wraps the XState actor (gameMachine.ts): loads the save on creation (D12),
 * collects the machine's emitted game events, and notifies subscribers.
 */
import { createActor } from 'xstate';
import { defineConfig, type GameConfig } from '@/domain/config';
import type { Command } from './commands';
import type { GameEvent } from './events';
import { gameMachine } from './gameMachine';
import type { SaveRepository } from './ports';
import type { Randomizer } from '@/domain/random';
import type { Stats } from './saveData';
import { toView } from './toView';
import type { SessionPhase, SessionView } from './view';

/** A presentation that never drains must not leak memory. */
export const MAX_QUEUED_EVENTS = 512;

export interface GameSessionDeps {
  readonly config?: GameConfig;
  readonly rng: Randomizer;
  readonly saveRepository: SaveRepository;
}

export interface GameSession {
  /** Send a command. Returns true when it was accepted, false when it was rejected (REJECTED event queued). */
  send(command: Command): boolean;
  /** A snapshot with everything the screen needs to draw. */
  view(): SessionView;
  /** Return and clear everything that happened since the last call. */
  drainEvents(): GameEvent[];
  /** Called after every command (accepted or not) and after shutdown. Returns an unsubscribe function. */
  subscribe(listener: (view: SessionView) => void): () => void;
  readonly stats: Stats;
  readonly phase: SessionPhase;
  /** Closing the page (D13): finish pending free games, collect pending wins and double stakes, save. */
  shutdown(): void;
}

function safeLoad(repo: SaveRepository) {
  try {
    return repo.load();
  } catch {
    return null; // the port promises not to throw; a broken one means "no save"
  }
}

export function createGameSession(deps: GameSessionDeps): GameSession {
  const config = deps.config ?? defineConfig();
  const actor = createActor(gameMachine, {
    input: { config, rng: deps.rng, saveRepository: deps.saveRepository, saved: safeLoad(deps.saveRepository) },
  });
  let events: GameEvent[] = [];
  let rejected = false;
  actor.on('game', ({ event }) => {
    if (event.kind === 'REJECTED') rejected = true;
    events.push(event);
    if (events.length > MAX_QUEUED_EVENTS) events = events.slice(events.length - MAX_QUEUED_EVENTS);
  });
  actor.start();

  const listeners = new Set<(view: SessionView) => void>();
  let cached: SessionView | null = null;

  const phase = (): SessionPhase => String(actor.getSnapshot().value) as SessionPhase;
  const view = (): SessionView => (cached ??= toView(actor.getSnapshot().context, phase()));
  const notify = (): void => {
    cached = null;
    if (listeners.size === 0) return;
    const v = view();
    for (const l of [...listeners]) l(v);
  };

  return {
    send(command) {
      rejected = false;
      actor.send(command);
      notify();
      return !rejected;
    },
    view,
    drainEvents() {
      const out = events;
      events = [];
      return out;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    get stats() {
      return actor.getSnapshot().context.stats;
    },
    get phase() {
      return phase();
    },
    shutdown() {
      // free games already earned are played out (the win would be lost otherwise)
      for (let i = 0; i < 100_000 && phase() === 'FREE_GAME'; i++) actor.send({ type: 'ADVANCE' });
      actor.send({ type: 'SHUTDOWN' });
      notify();
    },
  };
}
