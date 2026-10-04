/**
 * Pure-TS 8-bit sound synthesis (no Web Audio, no Howler): every effect is
 * rendered offline into 16-bit mono PCM and wrapped as a WAV. Output is fully
 * deterministic (noise uses a fixed-seed LFSR), so it is unit-testable in Node.
 */
export const SAMPLE_RATE = 22050;

export const SFX_NAMES = [
  'button',
  'bet',
  'deal',
  'flip',
  'win',
  'bigWin',
  'lose',
  'doubleWin',
  'doubleLose',
  'draw',
  'freeGameStart',
  'freeGameTick',
  'highLowStep',
  'joker',
  'countTick',
  'reject',
  'addMedals',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

type Wave = 'square' | 'pulse' | 'triangle' | 'noise' | 'saw';

interface Voice {
  /** start time in seconds */
  t: number;
  dur: number;
  /** Hz (for noise: LFSR clock rate) */
  freq: number;
  wave: Wave;
  vol: number;
  /** glide linearly to this frequency over the note */
  slideTo?: number;
  /** envelope curve: higher = faster decay (default 0.7) */
  decay?: number;
}

const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** 'c4', 'f#3', 'bb5' -> Hz (A4 = 440). */
export function noteFreq(name: string): number {
  const m = /^([a-g])([#b]?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const semis = (SEMI[m[1] as string] as number) + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12 - 9;
  return 440 * 2 ** (semis / 12);
}

/** A run of notes ('r' = rest) one `step` apart, each lasting `len` (default step). */
function run(notes: string[], t0: number, step: number, wave: Wave, vol: number, extra: Partial<Voice> = {}, len = step): Voice[] {
  const out: Voice[] = [];
  notes.forEach((nm, i) => {
    if (nm === 'r') return;
    out.push({ t: t0 + i * step, dur: len, freq: noteFreq(nm), wave, vol, ...extra });
  });
  return out;
}

const hz = (nm: string): number => noteFreq(nm);

const DEFS: Record<SfxName, Voice[]> = {
  button: [{ t: 0, dur: 0.035, freq: hz('a5'), wave: 'pulse', vol: 0.3 }],
  bet: [...run(['e5', 'b5'], 0, 0.055, 'square', 0.35, {}, 0.05), { t: 0.11, dur: 0.12, freq: hz('b5'), wave: 'square', vol: 0.3, decay: 1.5 }],
  deal: [
    { t: 0, dur: 0.05, freq: 9000, wave: 'noise', vol: 0.35, decay: 2 },
    { t: 0, dur: 0.06, freq: hz('c3'), wave: 'triangle', vol: 0.4, slideTo: hz('g2'), decay: 1.5 },
  ],
  flip: [
    { t: 0, dur: 0.03, freq: 12000, wave: 'noise', vol: 0.3, decay: 2 },
    ...run(['g3', 'c4', 'e4'], 0.02, 0.03, 'triangle', 0.35),
  ],
  win: [...run(['c5', 'e5', 'g5', 'c6'], 0, 0.085, 'square', 0.3), { t: 0.34, dur: 0.32, freq: hz('c6'), wave: 'pulse', vol: 0.3, decay: 1.2 }, { t: 0.34, dur: 0.32, freq: hz('e5'), wave: 'square', vol: 0.18, decay: 1.2 }],
  bigWin: [
    ...run(['c5', 'e5', 'g5', 'c6', 'e6', 'g6', 'c6', 'e6', 'g6', 'c7'], 0, 0.075, 'pulse', 0.28),
    ...run(['c4', 'g4', 'c5', 'g4', 'c4', 'g4', 'c5', 'g4', 'e4', 'g4', 'c5', 'g4'], 0, 0.125, 'triangle', 0.4),
    ...run(['g5', 'e5', 'g5', 'c6', 'g5', 'c6', 'e6', 'g6'], 0.85, 0.1, 'square', 0.26),
    { t: 1.65, dur: 0.7, freq: hz('c6'), wave: 'pulse', vol: 0.3, decay: 1.4 },
    { t: 1.65, dur: 0.7, freq: hz('e6'), wave: 'square', vol: 0.2, decay: 1.4 },
    { t: 1.65, dur: 0.7, freq: hz('c4'), wave: 'triangle', vol: 0.4, decay: 1.4 },
  ],
  lose: run(['e4', 'd4', 'c4', 'g3', 'c3'], 0, 0.14, 'triangle', 0.5, { decay: 0.8 }, 0.14).concat([{ t: 0.7, dur: 0.3, freq: hz('c3'), wave: 'triangle', vol: 0.5, decay: 1.5 }]),
  doubleWin: [...run(['g4', 'c5', 'e5', 'g5'], 0, 0.07, 'square', 0.3), { t: 0.28, dur: 0.28, freq: hz('g5'), wave: 'pulse', vol: 0.3, decay: 1.3 }],
  doubleLose: [
    { t: 0, dur: 0.55, freq: 440, wave: 'saw', vol: 0.3, slideTo: 55, decay: 0.5 },
    { t: 0, dur: 0.25, freq: 3000, wave: 'noise', vol: 0.25, decay: 1.5 },
  ],
  draw: [...run(['c4', 'c4'], 0, 0.1, 'triangle', 0.45, {}, 0.07), { t: 0.2, dur: 0.1, freq: hz('e4'), wave: 'triangle', vol: 0.45 }],
  freeGameStart: [
    ...run(['g4', 'g4', 'g4', 'c5', 'r', 'c5', 'e5', 'g5', 'r', 'g5', 'c6'], 0, 0.1, 'square', 0.3, {}, 0.09),
    ...run(['c3', 'c3', 'c3', 'e3', 'r', 'e3', 'g3', 'c4', 'r', 'c4', 'c4'], 0, 0.1, 'triangle', 0.4, {}, 0.09),
    { t: 1.1, dur: 0.5, freq: hz('c6'), wave: 'pulse', vol: 0.3, decay: 1.3 },
    { t: 1.1, dur: 0.5, freq: hz('g5'), wave: 'square', vol: 0.2, decay: 1.3 },
  ],
  freeGameTick: [{ t: 0, dur: 0.04, freq: hz('a5'), wave: 'square', vol: 0.28, decay: 1.2 }],
  highLowStep: [{ t: 0, dur: 0.09, freq: hz('c4'), wave: 'triangle', vol: 0.45, slideTo: hz('g4'), decay: 0.9 }],
  joker: run(['c4', 'g4', 'c5', 'g5', 'c6', 'g5', 'c6', 'g6'], 0, 0.06, 'pulse', 0.3, { decay: 0.9 }).concat(run(['c3', 'g3', 'c4'], 0, 0.16, 'triangle', 0.4)),
  countTick: [{ t: 0, dur: 0.022, freq: hz('c5'), wave: 'square', vol: 0.22, decay: 1 }],
  reject: [
    { t: 0, dur: 0.2, freq: 110, wave: 'square', vol: 0.3, decay: 0.3 },
    { t: 0, dur: 0.2, freq: 117, wave: 'square', vol: 0.25, decay: 0.3 },
  ],
  addMedals: run(['c6', 'e6', 'c6', 'e6', 'g6'], 0, 0.04, 'square', 0.25, { decay: 1.2 }, 0.04),
};

function renderVoices(voices: Voice[], rate = SAMPLE_RATE): Float32Array {
  const total = Math.max(...voices.map((v) => v.t + v.dur)) + 0.03;
  const out = new Float32Array(Math.ceil(total * rate));
  for (const v of voices) {
    const start = Math.round(v.t * rate);
    const len = Math.round(v.dur * rate);
    let phase = 0;
    let lfsr = 0x7fff;
    let noiseOut = 1;
    let noiseAcc = 0;
    const decay = v.decay ?? 0.7;
    const rel = Math.min(len, Math.round(0.004 * rate));
    for (let i = 0; i < len; i++) {
      const p = i / len;
      const f = v.slideTo === undefined ? v.freq : v.freq + (v.slideTo - v.freq) * p;
      let s: number;
      if (v.wave === 'noise') {
        noiseAcc += f / rate;
        while (noiseAcc >= 1) {
          noiseAcc -= 1;
          const bit = (lfsr ^ (lfsr >> 1)) & 1;
          lfsr = (lfsr >> 1) | (bit << 14);
          noiseOut = lfsr & 1 ? 1 : -1;
        }
        s = noiseOut;
      } else {
        phase += f / rate;
        phase -= Math.floor(phase);
        s =
          v.wave === 'square' ? (phase < 0.5 ? 1 : -1)
          : v.wave === 'pulse' ? (phase < 0.25 ? 1 : -1)
          : v.wave === 'saw' ? 1 - 2 * phase
          : 4 * Math.abs(phase - 0.5) - 1; // triangle
        if (v.wave === 'triangle') s = Math.round(s * 7.5) / 7.5; // 4-bit-ish stair-steps
      }
      const attack = Math.min(1, i / Math.max(1, 0.002 * rate));
      const env = attack * (1 - p) ** decay * (len - i <= rel ? (len - i) / rel : 1);
      const idx = start + i;
      out[idx] = (out[idx] as number) + s * v.vol * env;
    }
  }
  // normalise only when over the safe ceiling, so quiet effects stay quiet
  let peak = 0;
  for (const x of out) peak = Math.max(peak, Math.abs(x));
  const g = peak > 0.9 ? 0.9 / peak : 1;
  if (g !== 1) for (let i = 0; i < out.length; i++) out[i] = (out[i] as number) * g;
  return out;
}

/** Render an effect into 16-bit PCM (mono, SAMPLE_RATE). */
export function renderSfx(name: SfxName): Int16Array {
  const f = renderVoices(DEFS[name]);
  const pcm = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round((f[i] as number) * 32767)));
  return pcm;
}

/** Wrap 16-bit mono PCM in a RIFF/WAVE container. */
export function pcmToWav(pcm: Int16Array, rate = SAMPLE_RATE): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, pcm[i] as number, true);
  return buf;
}

export function sfxToWav(name: SfxName): ArrayBuffer {
  return pcmToWav(renderSfx(name));
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = ((b[i] as number) << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0);
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63) + (i + 1 < b.length ? B64.charAt((n >> 6) & 63) : '=') + (i + 2 < b.length ? B64.charAt(n & 63) : '=');
  }
  return out;
}

export function sfxToDataUri(name: SfxName): string {
  return `data:audio/wav;base64,${toBase64(sfxToWav(name))}`;
}
