/**
 * Progressive counters (spec: プログレッシブ).
 *
 * Values are held as integer thousandths of a medal (config increments have at
 * most 3 decimals, see validateConfig). Float accumulation drifts (e.g.
 * `32 + 0.335 * 100` is not exactly 65.5) and `ceil` would flip a whole medal;
 * integer arithmetic keeps the displayed/paid value the true ceil.
 */
import type { ProgressiveConfig } from './config';
import { PROGRESSIVE_LINES, type ProgressiveLine } from './enums';

const SCALE = 1000;

function isProgressiveLine(line: unknown): line is ProgressiveLine {
  return (PROGRESSIVE_LINES as readonly unknown[]).includes(line);
}

function check(line: unknown): asserts line is ProgressiveLine {
  if (!isProgressiveLine(line)) throw new Error(`${String(line)} has no progressive counter`);
}

export class ProgressivePool {
  private readonly initial: Record<ProgressiveLine, number>;
  private readonly step: Record<ProgressiveLine, number>;
  private readonly values: Record<ProgressiveLine, number>;

  /**
   * @param values optional restored medal values. Below-initial values are
   * raised to the initial; unknown lines and non-finite numbers throw (the
   * save layer sanitizes first).
   */
  constructor(cfg: ProgressiveConfig, values: Partial<Record<ProgressiveLine, number>> = {}) {
    const initial = {} as Record<ProgressiveLine, number>;
    const step = {} as Record<ProgressiveLine, number>;
    for (const line of PROGRESSIVE_LINES) {
      initial[line] = Math.round(cfg.counters[line].initial * SCALE);
      step[line] = Math.round(cfg.counters[line].increment * SCALE);
    }
    this.initial = initial;
    this.step = step;
    this.values = { ...initial };
    for (const [line, v] of Object.entries(values)) {
      check(line);
      if (typeof v !== 'number' || !Number.isSafeInteger(Math.round(v * SCALE))) throw new Error(`invalid progressive value for ${line}: ${String(v)}`);
      this.values[line] = Math.max(Math.round(v * SCALE), initial[line]);
    }
  }

  /** Medals, possibly fractional. */
  value(line: ProgressiveLine): number {
    check(line);
    return this.values[line] / SCALE;
  }

  /** Displayed / paid medals: exact ceil on the integer representation. */
  displayValue(line: ProgressiveLine): number {
    check(line);
    return Math.ceil(this.values[line] / SCALE);
  }

  /** Advance all counters by one MAX BET game. */
  addMaxBetGame(): void {
    for (const line of PROGRESSIVE_LINES) this.values[line] += this.step[line];
  }

  /** Pay out `ceil(value)` and reset only that line to its initial value. */
  award(line: ProgressiveLine): number {
    const paid = this.displayValue(line);
    this.values[line] = this.initial[line];
    return paid;
  }

  snapshot(): Record<ProgressiveLine, number> {
    const out = {} as Record<ProgressiveLine, number>;
    for (const line of PROGRESSIVE_LINES) out[line] = this.values[line] / SCALE;
    return out;
  }
}
