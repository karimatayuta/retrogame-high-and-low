import { describe, expect, it } from 'vitest';
import { RANKS, SUITS, type Card } from '@/domain/cards';
import { PALETTE } from '@/presentation/palette';
import { CARD_H, CARD_W, renderCardBack, renderCardFace } from '@/presentation/cardPixels';

const allCards: Card[] = [
  ...SUITS.flatMap((suit) => RANKS.map((rank) => ({ kind: 'normal', rank, suit }) as Card)),
  { kind: 'joker', id: 1 },
  { kind: 'joker', id: 2 },
];

describe('card art', () => {
  it('renders 54 distinct faces inside the palette', () => {
    const pal = new Set<number>(Object.values(PALETTE));
    pal.add(0xf0c890);
    const seen = new Set<string>();
    for (const c of allCards) {
      const b = renderCardFace(c);
      expect([b.w, b.h]).toEqual([CARD_W, CARD_H]);
      for (const col of b.colors()) expect(pal.has(col), `colour ${col.toString(16)}`).toBe(true);
      expect(b.get(0, 0)).toBe(-1); // rounded corner
      expect(b.get(CARD_W / 2, CARD_H / 2)).not.toBe(-1);
      seen.add(Array.from(b.px).join(','));
    }
    expect(seen.size).toBe(54);
  });

  it('has a back', () => {
    expect(renderCardBack().colors().size).toBeGreaterThan(3);
  });
});
