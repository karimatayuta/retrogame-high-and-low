/** Save repositories. Never throw: no save is better than a crash (private mode, quota, disabled storage). */
import { parseSaveData, type SaveData } from '@/application/saveData';
import type { SaveRepository } from '@/application/ports';

export const DEFAULT_SAVE_KEY = 'twinjokers.save.v1';

export class LocalStorageSaveRepository implements SaveRepository {
  constructor(
    private readonly key: string = DEFAULT_SAVE_KEY,
    private readonly storage?: Storage | null,
  ) {}

  /** Resolved lazily: merely touching `globalThis.localStorage` can throw (SecurityError). */
  private resolve(): Storage | null {
    try {
      if (this.storage !== undefined) return this.storage;
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  load(): SaveData | null {
    try {
      const storage = this.resolve();
      if (!storage) return null;
      const text = storage.getItem(this.key);
      if (text === null) return null;
      return parseSaveData(JSON.parse(text));
    } catch {
      return null;
    }
  }

  save(data: SaveData): boolean {
    try {
      const storage = this.resolve();
      if (!storage) return false;
      storage.setItem(this.key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
}

/** In-memory repository for tests and storage-less environments. */
export class MemorySaveRepository implements SaveRepository {
  private data: SaveData | null = null;

  load(): SaveData | null {
    return this.data === null ? null : structuredClone(this.data);
  }

  save(data: SaveData): boolean {
    this.data = structuredClone(data);
    return true;
  }
}
