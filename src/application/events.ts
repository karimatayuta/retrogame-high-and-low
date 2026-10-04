/**
 * Game events: what happened inside the session, for sounds and animations.
 *
 * The session advances its state instantly. The presentation layer calls
 * `GameSession.drainEvents()` once per frame and plays the events over time.
 *
 */
import type { Card } from '@/domain/cards';

export const EVENT_KINDS = [
  'BET', // amount = medals just deducted
  'DEAL', // a paid main game was dealt; amount = bet
  'HAND', // a hand was evaluated; amount = payout, detail = hand name
  'NO_WIN', // a paid game ended without any payout
  'PROGRESSIVE_WON', // amount = counter paid, detail = pay line
  'FREE_GAME_AWARDED', // amount = games added, detail = trigger
  'FREE_GAME_STEP', // one free game was played; amount = its payout
  'FREE_GAME_END', // amount = total free game win
  'DOUBLE_START', // amount = stake at risk, detail = double kind
  'HALF_DOUBLE_TOGGLED', // detail = "ON" / "OFF"
  'DOUBLE_WIN', // amount = new win; cards = all revealed cards
  'DOUBLE_LOSE', // cards = all revealed cards (HIGH & LOW: the losing card)
  'DOUBLE_DRAW', // standard draw; index = picked slot, cards = revealed cards
  'HIGH_LOW_STEP', // amount = amount after the guess, detail = HIGH/LOW, cards = [revealed card]
  'JOKER', // HIGH & LOW ended by a joker
  'HIGH_LOW_BONUS', // amount = bonus medals, detail = bonus hand
  'COLLECT', // amount moved to CREDITS by the player
  'AUTO_SETTLED', // amount moved to CREDITS automatically
  'CREDITS_ADDED', // "add medals"; amount = medals
  'REJECTED', // invalid command (play a buzzer); detail = "COMMAND: reason"
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** One thing that happened. `index` is a card slot (or -1), `cards` is optional context. */
export interface GameEvent {
  readonly kind: EventKind;
  readonly amount: number;
  readonly detail: string;
  readonly index: number;
  readonly cards: readonly Card[];
}

export function gameEvent(kind: EventKind, amount = 0, detail = '', index = -1, cards: readonly Card[] = []): GameEvent {
  return Object.freeze({ kind, amount, detail, index, cards });
}
