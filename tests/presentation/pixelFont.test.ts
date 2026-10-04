import { describe, expect, it } from 'vitest';
import { DOUBLE_DOWN_MENU_ITEMS, FREE_GAME_TRIGGERS, HAND_RANKS, HIGH_LOW_BONUSES, PAY_LINES } from '@/domain/enums';
import { SUIT_SYMBOL } from '@/domain/cards';
import { GLYPHS, GLYPH_HEIGHT, missingGlyphs, textWidthPx } from '@/presentation/pixelFontData';

const UI_STRINGS = [
  'CREDITS', 'BET', 'MAX BET', 'WIN', 'TAKE SCORE', 'HOLD', 'DEAL', 'DOUBLE', 'COLLECT', 'FREE GAME', 'HIGH', 'LOW',
  'JACKPOT', 'INSERT MEDALS', 'GAME OVER', 'PROGRESSIVE', 'HIGH & LOW', 'RED & BLACK', 'x2 ×3 +5 -1 1,000.50 ?! A:B 10\'S',
  ...Object.values(SUIT_SYMBOL),
];

describe('pixel font', () => {
  it('draws every game string', () => {
    const all = [...HAND_RANKS, ...PAY_LINES, ...FREE_GAME_TRIGGERS, ...HIGH_LOW_BONUSES, ...DOUBLE_DOWN_MENU_ITEMS, ...UI_STRINGS];
    for (const s of all) expect(missingGlyphs(s), s).toEqual([]);
  });

  it('every glyph is well formed', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows.length, ch).toBe(GLYPH_HEIGHT);
      const w = (rows[0] as string).length;
      for (const r of rows) {
        expect(r.length, ch).toBe(w);
        expect(r).toMatch(/^[#.]+$/);
      }
      expect(rows.join('').includes('#'), ch).toBe(true);
    }
  });

  it('letters and digits are visually distinct', () => {
    const seen = new Map<string, string>();
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      const key = rows.join('|');
      expect(seen.get(key), `${ch} duplicates ${seen.get(key)}`).toBeUndefined();
      seen.set(key, ch);
    }
  });

  it('measures width', () => {
    expect(textWidthPx('')).toBe(0);
    expect(textWidthPx('AB')).toBe(7);
    expect(textWidthPx('a')).toBe(3);
  });
});
