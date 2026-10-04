import { Texture, type Renderer } from 'pixi.js';
import type { Card } from '@/domain/cards';
import { isJoker } from '@/domain/cards';
import type { Bitmap } from '@/presentation/pixelBitmap';
import { CARD_H, CARD_W, HIGHLIGHT_PAD, renderCardBack, renderCardFace, renderHighlight } from '@/presentation/cardPixels';

export { CARD_H, CARD_W, HIGHLIGHT_PAD };

export interface CardTextures {
  /** Face texture of a card (created lazily, cached). Jokers differ by `id`. */
  face(card: Card): Texture;
  readonly back: Texture;
  /** Gold selection/HOLD frame, (CARD_W+4)x(CARD_H+4); place it at card position - HIGHLIGHT_PAD. */
  readonly highlight: Texture;
  readonly width: number;
  readonly height: number;
  /** Create every face texture now (avoids a hitch on first deal). */
  preload(): void;
  /** Release all GPU textures. */
  destroy(): void;
}

function toTexture(bmp: Bitmap): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = bmp.w;
  canvas.height = bmp.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.putImageData(new ImageData(bmp.toRgba() as Uint8ClampedArray<ArrayBuffer>, bmp.w, bmp.h), 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  tex.source.autoGenerateMipmaps = false;
  return tex;
}

const key = (card: Card): string => (isJoker(card) ? `J${card.id}` : `${card.rank}${card.suit}`);

/**
 * Cards are drawn in code into pure bitmaps (see cardPixels.ts) and uploaded as
 * nearest-neighbour textures. `renderer` is accepted for API symmetry/future use
 * (the bitmaps are rasterised through a 2D canvas, so it is not required).
 */
export function createCardTextures(_renderer?: Renderer): CardTextures {
  const cache = new Map<string, Texture>();
  const back = toTexture(renderCardBack());
  const highlight = toTexture(renderHighlight());
  const all: Card[] = [];
  for (const suit of ['S', 'H', 'D', 'C'] as const)
    for (let rank = 2; rank <= 14; rank++) all.push({ kind: 'normal', rank: rank as 2, suit });
  all.push({ kind: 'joker', id: 1 }, { kind: 'joker', id: 2 });
  return {
    face(card) {
      const k = key(card);
      let t = cache.get(k);
      if (!t) {
        t = toTexture(renderCardFace(card));
        cache.set(k, t);
      }
      return t;
    },
    back,
    highlight,
    width: CARD_W,
    height: CARD_H,
    preload() {
      for (const c of all) this.face(c);
    },
    destroy() {
      for (const t of cache.values()) t.destroy(true);
      cache.clear();
      back.destroy(true);
      highlight.destroy(true);
    },
  };
}
