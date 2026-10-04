import { cards, sameCard, type Card } from '@/domain/cards';
import { seededRandomizer, type Randomizer } from '@/domain/random';

export interface ScriptOptions {
  /** Values returned by `next()` before falling back to the seeded generator. */
  randoms?: readonly number[];
  /** Cards returned by `pick()` (must be among the candidates) before falling back. */
  choices?: string;
  seed?: number;
}

/** Randomizer whose shuffle puts the `front` cards on top (in order); the rest is seeded-shuffled. */
export function scripted(front = '', opts: ScriptOptions = {}): Randomizer {
  const inner = seededRandomizer(opts.seed ?? 0);
  const frontCards: Card[] = front.trim() === '' ? [] : cards(front);
  const randoms = [...(opts.randoms ?? [])];
  const choices: Card[] = opts.choices ? cards(opts.choices) : [];
  return {
    next: () => (randoms.length > 0 ? (randoms.shift() as number) : inner.next()),
    int: (min, max) => inner.int(min, max),
    shuffle<T>(items: T[]): T[] {
      inner.shuffle(items);
      for (const c of [...frontCards].reverse()) {
        const i = (items as unknown as Card[]).findIndex((x) => sameCard(x, c));
        if (i < 0) throw new Error('scripted card not in deck');
        items.splice(i, 1);
        items.unshift(c as unknown as T);
      }
      return items;
    },
    pick<T>(items: readonly T[]): T {
      const c = choices.shift();
      if (c) {
        const found = items.find((x) => sameCard(x as unknown as Card, c));
        if (found === undefined) throw new Error(`scripted choice ${JSON.stringify(c)} not among candidates`);
        return found;
      }
      return inner.pick(items);
    },
  };
}

/** Seeded randomizer that forces `first` onto the top of every shuffle. */
export function seededWithFront(seed: number, first: string): () => Randomizer {
  const inner = seededRandomizer(seed);
  const front = cards(first);
  return () => ({
    ...inner,
    shuffle<T>(items: T[]): T[] {
      inner.shuffle(items);
      for (const c of [...front].reverse()) {
        const i = (items as unknown as Card[]).findIndex((x) => sameCard(x, c));
        items.splice(i, 1);
        items.unshift(c as unknown as T);
      }
      return items;
    },
  });
}
