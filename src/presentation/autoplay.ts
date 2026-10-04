/** A polite bot for `?autoplay=1`: bet, deal, sometimes double (all three kinds), pick, collect. */
import type { SessionView } from '@/application/view';
import type { Action } from '@/presentation/input';

export type Rand = () => number;

/** Small deterministic PRNG (presentation-only; game decisions never use it). */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hold = (n: number): Action => ({ kind: 'hold', n });

/** The next action the bot presses in `view` (null: wait). */
export function chooseAction(view: SessionView, r: Rand): Action | null {
  switch (view.phase) {
    case 'BETTING': {
      if (view.credits < 5 && view.bet === 0) return { kind: 'addMedals' };
      const roll = r();
      if (roll < 0.5) return { kind: 'maxBet' };
      if (roll < 0.8 || view.bet > 0) return view.bet > 0 || r() < 0.5 ? { kind: 'deal' } : { kind: 'bet' };
      return { kind: 'bet' };
    }
    case 'FREE_GAME':
      return null; // runs by itself
    case 'DOUBLE_SELECT': {
      const roll = r();
      if (roll < 0.35) return { kind: 'collect' };
      if (roll < 0.5) return { kind: 'deal' }; // STANDARD
      if (roll < 0.62) return hold(3); // HIGH & LOW
      if (roll < 0.74) return hold(4); // RED & BLACK
      if (roll < 0.82) return hold(1); // toggle HALF DOUBLE
      return hold(5); // TAKE SCORE
    }
    case 'STANDARD_PICK':
    case 'RED_BLACK_PICK':
      if (view.canCollect && r() < 0.15) return { kind: 'collect' };
      return hold(2 + Math.floor(r() * 4));
    case 'HIGH_LOW_GUESS':
      if (r() < 0.2) return { kind: 'collect' };
      return { kind: r() < 0.5 ? 'high' : 'low' };
  }
}
