/** Presentation preferences (mute, CRT) kept in localStorage. Never throws. */
export interface Prefs {
  readonly muted: boolean;
  readonly crt: boolean;
}

export const PREFS_KEY = 'twinjokers.web.prefs.v1';
export const DEFAULT_PREFS: Prefs = { muted: false, crt: true };

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function resolve(storage?: StorageLike | null): StorageLike | null {
  try {
    if (storage !== undefined) return storage;
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadPrefs(storage?: StorageLike | null): Prefs {
  try {
    const text = resolve(storage)?.getItem(PREFS_KEY);
    if (!text) return DEFAULT_PREFS;
    const raw = JSON.parse(text) as Record<string, unknown>;
    return {
      muted: typeof raw.muted === 'boolean' ? raw.muted : DEFAULT_PREFS.muted,
      crt: typeof raw.crt === 'boolean' ? raw.crt : DEFAULT_PREFS.crt,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs, storage?: StorageLike | null): void {
  try {
    resolve(storage)?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode / quota: not worth a crash */
  }
}
