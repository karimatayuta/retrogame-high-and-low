import type { Container, Filter } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter } from 'pixi-filters';

export interface CrtOptions {
  /** Barrel distortion of the glass (default 1.2; 0 = flat). */
  curvature?: number;
  /** Scanline thickness in output px (default 2.0 = one logical pixel at x2). */
  lineWidth?: number;
  /** Scanline darkness 0..1 (default 0.06). */
  lineContrast?: number;
  /** Edge darkening (default 0.3). */
  vignetting?: number;
  /** Grain 0..1 (default 0.012; 0 disables the animated noise). */
  noise?: number;
  /** Phosphor glow; false to skip the bloom pass (cheaper on weak mobile GPUs). */
  bloom?: boolean;
}

export interface CrtFilters {
  readonly crt: CRTFilter;
  readonly bloom: AdvancedBloomFilter | null;
  /** Filters in apply order (bloom first so the scanlines cut through the glow). */
  readonly filters: Filter[];
  /** Call from the ticker with elapsed ms: animates noise/flicker. */
  update(deltaMs: number): void;
}

/** CRT look tuned for the 640x480 output (320x240 logical, x2). */
export function createCrtFilters(options: CrtOptions = {}): CrtFilters {
  const noise = options.noise ?? 0.012;
  const crt = new CRTFilter({
    curvature: options.curvature ?? 1.2,
    lineWidth: options.lineWidth ?? 2,
    lineContrast: options.lineContrast ?? 0.06,
    verticalLine: false,
    noise,
    noiseSize: 1,
    vignetting: options.vignetting ?? 0.3,
    vignettingAlpha: 0.8,
    vignettingBlur: 0.4,
    seed: 0,
    time: 0,
  });
  const bloom =
    options.bloom === false
      ? null
      : new AdvancedBloomFilter({ threshold: 0.7, bloomScale: 0.3, brightness: 1, blur: 3, quality: 3 });
  const filters: Filter[] = bloom ? [bloom, crt] : [crt];
  return {
    crt,
    bloom,
    filters,
    update(deltaMs) {
      if (noise > 0) {
        crt.time += deltaMs * 0.01;
        crt.seed = Math.random(); // visual-only grain; no game logic depends on it
      }
    },
  };
}

const attached = new WeakMap<Container, CrtFilters>();

/**
 * Turn the CRT effect on/off for a container (normally the scaled game stage).
 * Pass `filters` the first time; afterwards `setCrtEnabled(stage, false)` keeps
 * the set for a later re-enable.
 */
export function setCrtEnabled(stage: Container, on: boolean, filters?: CrtFilters): void {
  if (filters) attached.set(stage, filters);
  const set = attached.get(stage);
  stage.filters = on && set ? set.filters : null;
}
