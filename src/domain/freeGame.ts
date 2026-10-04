/** Free game trigger detection (spec: フリーゲーム). Jokers never count as face cards. */
import { colorOf, isFace, type Card } from './cards';
import type { FreeGameConfig } from './config';
import { FREE_GAME_TRIGGERS, type FreeGameTrigger } from './enums';

/** Every trigger condition the hand satisfies (not yet reduced to one), strongest condition first. */
export function matchingTriggers(hand: readonly Card[]): FreeGameTrigger[] {
  const faces = hand.filter(isFace);
  const n = faces.length;
  const red = faces.filter((c) => colorOf(c) === 'RED').length;
  const sameColor = Math.max(red, n - red);
  const found: FreeGameTrigger[] = [];
  if (sameColor >= 5) found.push('5 R/B FACES');
  if (n >= 5) found.push('ANY 5 FACES');
  if (sameColor >= 4) found.push('4 R/B FACES');
  if (n >= 4) found.push('ANY 4 FACES');
  if (sameColor >= 3) found.push('3 R/B FACES');
  return found;
}

/**
 * The matching trigger that awards the most games, or null.
 *
 * The choice follows `cfg.awards` (not list order), so a changed setting such
 * as ANY 5 FACES = 50 vs. 5 R/B FACES = 40 still picks the larger award.
 * Ties go to the stronger (earlier in FREE_GAME_TRIGGERS) condition.
 */
export function detectFreeGame(hand: readonly Card[], cfg: FreeGameConfig): FreeGameTrigger | null {
  const found = matchingTriggers(hand);
  let best: FreeGameTrigger | null = null;
  for (const t of FREE_GAME_TRIGGERS) {
    if (!found.includes(t)) continue;
    if (best === null || cfg.awards[t] > cfg.awards[best]) best = t;
  }
  return best;
}
