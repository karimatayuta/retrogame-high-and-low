import { describe, expect, it } from 'vitest';
import { buttonsFor, chooseMode, computeFit, hitTest, hitTargets, toLogical, type Rect } from '@/presentation/layout';

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('layout', () => {
  const fits = [computeFit(1000, 800, 1), computeFit(390, 844, 3), computeFit(360, 740, 3), computeFit(768, 1024, 2)];

  it('buttons stay inside the canvas and never overlap', () => {
    for (const fit of fits) {
      const bs = buttonsFor(fit);
      for (const b of bs) {
        expect(b.x, b.id).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w, b.id).toBeLessThanOrEqual(fit.logicalW);
        expect(b.y + b.h, b.id).toBeLessThanOrEqual(fit.logicalH);
      }
      bs.forEach((a, i) => bs.slice(i + 1).forEach((b) => expect(overlap(a, b), `${a.id}/${b.id}`).toBe(false)));
    }
  });

  it('every button is hit-testable at its centre', () => {
    for (const fit of fits) {
      for (const b of buttonsFor(fit)) expect(hitTest(fit, b.x + b.w / 2, b.y + b.h / 2)?.id).toBe(b.id);
      expect(hitTargets(fit).filter((t) => t.id.startsWith('label'))).toHaveLength(5);
    }
    expect(hitTest(fits[0] as never, 1, 1)).toBeNull();
  });

  it('picks portrait layout for tall windows', () => {
    expect(chooseMode(390, 844)).toBe('tall');
    expect(chooseMode(1280, 720)).toBe('wide');
  });

  it('always uses whole device pixels per logical pixel when 2x fits', () => {
    for (const fit of fits) expect(Number.isInteger(fit.deviceScale), `${fit.logicalW}x${fit.logicalH}`).toBe(true);
    const f = computeFit(1000, 800, 1);
    expect(f.deviceScale).toBe(3);
    expect(f.cssW / f.cssH).toBeCloseTo(4 / 3, 2);
    expect(computeFit(844, 390, 3).deviceScale).toBe(4);
  });

  it('portrait canvas fills the window in whole logical pixels', () => {
    const f = computeFit(390, 844, 3);
    expect(f.mode).toBe('tall');
    expect(f.deviceScale).toBe(3);
    expect(f.logicalW).toBe(390);
    expect(f.logicalH).toBe(844);
    expect(f.offsetX).toBe(35);
    expect(f.cssW).toBe(390);
  });

  it('falls back to a fractional scale only below 1.5x', () => {
    expect(computeFit(100, 80, 1).deviceScale).toBeLessThan(1);
    expect(computeFit(420, 330, 1).deviceScale).toBe(1);
  });

  it('maps client coordinates to logical ones', () => {
    const p = toLogical(150, 100, { left: 50, top: 0, width: 640, height: 480 }, { logicalW: 320, logicalH: 240 });
    expect(p).toEqual({ x: 50, y: 50 });
  });
});
