import { Howl, Howler } from 'howler';
import { SFX_NAMES, sfxToDataUri, type SfxName } from '@/presentation/chiptune';

export type SoundName = SfxName;
export { SFX_NAMES };

export interface SoundBoard {
  play(name: SoundName): void;
  setMuted(muted: boolean): void;
  readonly muted: boolean;
  /** Call from the first user gesture (pointer/key): resumes a suspended AudioContext (iOS/Android). */
  unlock(): void;
}

/** Howler wrapper. Howls are built lazily on first use; nothing here ever throws. */
export function createSoundBoard(): SoundBoard {
  const howls = new Map<SoundName, Howl>();
  let muted = false;
  let broken = false;

  const get = (name: SoundName): Howl | null => {
    if (broken) return null;
    let h = howls.get(name);
    if (!h) {
      try {
        h = new Howl({ src: [sfxToDataUri(name)], format: ['wav'], volume: 0.6, preload: true });
        howls.set(name, h);
      } catch {
        broken = true;
        return null;
      }
    }
    return h;
  };

  return {
    get muted() {
      return muted;
    },
    play(name) {
      if (muted) return;
      try {
        get(name)?.play();
      } catch {
        /* audio unavailable */
      }
    },
    setMuted(m) {
      muted = m;
      try {
        Howler.mute(m);
      } catch {
        /* ignore */
      }
    },
    unlock() {
      try {
        const ctx = Howler.ctx as AudioContext | null | undefined;
        if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
      } catch {
        /* ignore */
      }
    },
  };
}
