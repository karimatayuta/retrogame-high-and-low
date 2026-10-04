/** Scheduling of the five-card row animation (deal ticks, flips, reveals). Pure, in seconds. */
import type { Card } from '@/domain/cards';
import type { SfxName } from '@/presentation/chiptune';
import type { SlotVis } from '@/presentation/stages';

export const SLOTS = 5;

export interface Timing {
  /** seconds between card appearances (deal) */
  readonly step: number;
  /** pause between the last appearance and the first flip */
  readonly gap: number;
  /** seconds between flips */
  readonly stagger: number;
  /** flip duration */
  readonly flip: number;
  /** slide-in duration of an appearing card */
  readonly slide: number;
}

export const NORMAL: Timing = { step: 0.085, gap: 0.13, stagger: 0.1, flip: 0.17, slide: 0.12 };
export const FAST: Timing = { step: 0.033, gap: 0.05, stagger: 0.033, flip: 0.1, slide: 0.06 };

export interface SlotAnim {
  readonly prev: SlotVis;
  readonly target: SlotVis;
  readonly appearAt: number;
  /** null: the card stays as it is (face down) */
  flipAt: number | null;
  /** true: a face-down card that simply turns over (no slide) */
  readonly reveal: boolean;
}

export interface RowPlan {
  readonly anims: (SlotAnim | null)[];
  readonly sounds: { at: number; sfx: SfxName }[];
  readonly end: number;
}

const sameCard = (a: Card | null, b: Card | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'joker' ? a.id === (b as typeof a).id : a.rank === (b as typeof a).rank && a.suit === (b as typeof a).suit;
};

const same = (a: SlotVis, b: SlotVis): boolean => a.present === b.present && a.up === b.up && sameCard(a.card, b.card);

const isReveal = (prev: SlotVis, target: SlotVis): boolean => prev.present && !prev.up && target.present && target.up;

export function planRow(vis: readonly SlotVis[], targets: readonly SlotVis[], t0: number, timing: Timing): RowPlan {
  const anims: (SlotAnim | null)[] = Array.from({ length: SLOTS }, () => null);
  const sounds: { at: number; sfx: SfxName }[] = [];
  const idx = Array.from({ length: SLOTS }, (_, i) => i);
  const at = (i: number): SlotVis => vis[i] as SlotVis;
  const tg = (i: number): SlotVis => targets[i] as SlotVis;
  const reveals = idx.filter((i) => isReveal(at(i), tg(i)));
  const appears = idx.filter((i) => !same(tg(i), at(i)) && !reveals.includes(i) && tg(i).present);
  let end = t0;
  appears.forEach((i, n) => {
    const when = t0 + n * timing.step;
    anims[i] = { prev: at(i), target: tg(i), appearAt: when, flipAt: null, reveal: false };
    sounds.push({ at: when, sfx: 'deal' });
    end = Math.max(end, when + timing.slide);
  });
  const firstFlip = t0 + (appears.length > 0 ? appears.length * timing.step + timing.gap : 0.07);
  const flips = idx.filter((i) => (reveals.includes(i) || appears.includes(i)) && tg(i).up);
  flips.forEach((i, j) => {
    const when = firstFlip + j * timing.stagger;
    if (reveals.includes(i)) anims[i] = { prev: at(i), target: tg(i), appearAt: t0, flipAt: when, reveal: true };
    else (anims[i] as SlotAnim).flipAt = when;
    sounds.push({ at: when, sfx: 'flip' });
    end = Math.max(end, when + timing.flip);
  });
  for (const i of idx) {
    if (anims[i] === null && !same(tg(i), at(i))) {
      // removed card (or something else with no animation): change at once
      anims[i] = { prev: at(i), target: tg(i), appearAt: t0, flipAt: null, reveal: false };
    }
  }
  sounds.sort((a, b) => a.at - b.at);
  return { anims, sounds, end };
}
