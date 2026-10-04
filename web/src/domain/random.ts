/**
 * Randomness port.
 *
 * The domain never calls `Math.random` or `crypto` directly for game
 * decisions. It receives a {@link Randomizer}. Production uses
 * `crypto.getRandomValues` (infrastructure/cryptoRandom.ts); tests use the
 * seeded {@link seededRandomizer} below so failures are reproducible.
 */

export interface Randomizer {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, maxExclusive). Unbiased. */
  int(min: number, maxExclusive: number): number;
  /** In-place Fisher–Yates shuffle. Returns the same array for convenience. */
  shuffle<T>(items: T[]): T[];
  /** One uniformly chosen element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
}

const TWO_32 = 0x1_0000_0000;

/**
 * Build a {@link Randomizer} from any source of uniform 32-bit unsigned
 * integers. Integer draws use rejection sampling so there is no modulo bias.
 */
export function randomizerFromUint32(nextUint32: () => number): Randomizer {
  const int = (min: number, maxExclusive: number): number => {
    const span = maxExclusive - min;
    if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || span <= 0 || span > TWO_32) {
      throw new RangeError(`bad range [${min}, ${maxExclusive})`);
    }
    const limit = TWO_32 - (TWO_32 % span);
    let x = nextUint32();
    while (x >= limit) x = nextUint32();
    return min + (x % span);
  };
  return {
    next: () => nextUint32() / TWO_32,
    int,
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(0, i + 1);
        const tmp = items[i] as T;
        items[i] = items[j] as T;
        items[j] = tmp;
      }
      return items;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick from empty array');
      return items[int(0, items.length)] as T;
    },
  };
}

/** Deterministic randomizer (sfc32) for tests, demos and replays. Not for production play. */
export function seededRandomizer(seed: number): Randomizer {
  let a = 0x9e3779b9;
  let b = 0x243f6a88;
  let c = 0xb7e15162;
  let d = seed >>> 0;
  const nextUint32 = (): number => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 15; i++) nextUint32();
  return randomizerFromUint32(nextUint32);
}
