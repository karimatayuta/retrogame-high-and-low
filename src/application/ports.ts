/**
 * Ports the application layer needs from the outside world.
 * Implementations live in infrastructure/ and are wired in src/main.ts.
 */
import type { SaveData } from './saveData';

export type { Randomizer } from '@/domain/random';

export interface SaveRepository {
  /** Saved data, or null when absent/unreadable/corrupt. Never throws. */
  load(): SaveData | null;
  /** Persist; false on failure (private mode, quota...). Never throws. */
  save(data: SaveData): boolean;
}
