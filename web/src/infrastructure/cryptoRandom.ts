/** Production randomness: `crypto.getRandomValues`, buffered, with unbiased integer draws. */
import { randomizerFromUint32, type Randomizer } from '@/domain/random';

const BUFFER_SIZE = 256;

export function cryptoRandomizer(): Randomizer {
  const crypto = globalThis.crypto;
  if (typeof crypto?.getRandomValues !== 'function') throw new Error('crypto.getRandomValues is not available');
  const buffer = new Uint32Array(BUFFER_SIZE);
  let index = BUFFER_SIZE;
  return randomizerFromUint32(() => {
    if (index >= BUFFER_SIZE) {
      crypto.getRandomValues(buffer);
      index = 0;
    }
    return buffer[index++] as number;
  });
}
