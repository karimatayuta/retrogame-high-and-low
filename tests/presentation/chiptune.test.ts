import { describe, expect, it } from 'vitest';
import { SAMPLE_RATE, SFX_NAMES, noteFreq, renderSfx, sfxToDataUri, sfxToWav } from '@/presentation/chiptune';

describe('chiptune', () => {
  it('note frequencies', () => {
    expect(noteFreq('a4')).toBeCloseTo(440, 5);
    expect(noteFreq('c5')).toBeCloseTo(523.25, 1);
    expect(noteFreq('bb3')).toBeCloseTo(233.08, 1);
  });

  for (const name of SFX_NAMES) {
    describe(name, () => {
      const wav = sfxToWav(name);
      const dv = new DataView(wav);
      const tag = (o: number): string => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

      it('has a valid RIFF/WAVE header', () => {
        expect(tag(0)).toBe('RIFF');
        expect(tag(8)).toBe('WAVE');
        expect(tag(12)).toBe('fmt ');
        expect(dv.getUint16(20, true)).toBe(1);
        expect(dv.getUint16(22, true)).toBe(1);
        expect(dv.getUint32(24, true)).toBe(SAMPLE_RATE);
        expect(dv.getUint16(34, true)).toBe(16);
        expect(tag(36)).toBe('data');
        expect(dv.getUint32(4, true)).toBe(wav.byteLength - 8);
        expect(dv.getUint32(40, true)).toBe(wav.byteLength - 44);
      });

      it('has a sensible duration', () => {
        const sec = (wav.byteLength - 44) / 2 / SAMPLE_RATE;
        expect(sec).toBeGreaterThan(0.02);
        expect(sec).toBeLessThan(4);
      });

      it('is audible, finite, not clipped, and deterministic', () => {
        const a = renderSfx(name);
        const b = renderSfx(name);
        expect(Array.from(a)).toEqual(Array.from(b));
        let peak = 0;
        for (const v of a) {
          expect(Number.isFinite(v)).toBe(true);
          peak = Math.max(peak, Math.abs(v));
        }
        expect(peak).toBeGreaterThan(1000);
        expect(peak).toBeLessThan(32767);
      });
    });
  }

  it('data URI is base64 WAV', () => {
    const uri = sfxToDataUri('bet');
    expect(uri.startsWith('data:audio/wav;base64,UklGR')).toBe(true);
    expect(Buffer.from(uri.split(',')[1] as string, 'base64').equals(Buffer.from(sfxToWav('bet')))).toBe(true);
  });

  it('big wins are longer than ticks', () => {
    expect(renderSfx('bigWin').length).toBeGreaterThan(renderSfx('countTick').length * 20);
  });
});
