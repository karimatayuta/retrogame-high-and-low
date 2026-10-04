/**
 * Playing cards: the most basic value objects of the game.
 *
 * Cards are plain frozen objects (a discriminated union) so they are cheap to
 * create during the 3,162,510-hand verification and trivially serialisable.
 */

export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

export type Color = 'RED' | 'BLACK';

/** Card rank. The number is the strength: 2 is weakest, 14 (ACE) is strongest. */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const JACK = 11 as const;
export const QUEEN = 12 as const;
export const KING = 13 as const;
export const ACE = 14 as const;

export interface NormalCard {
  readonly kind: 'normal';
  readonly rank: Rank;
  readonly suit: Suit;
}

/** `id` (1 or 2) only distinguishes the two physical jokers; it has no rule effect. */
export interface JokerCard {
  readonly kind: 'joker';
  readonly id: 1 | 2;
}

export type Card = NormalCard | JokerCard;

export const SUIT_SYMBOL: Readonly<Record<Suit, string>> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function normal(rank: Rank, suit: Suit): NormalCard {
  return Object.freeze({ kind: 'normal', rank, suit });
}

export function joker(id: 1 | 2 = 1): JokerCard {
  return Object.freeze({ kind: 'joker', id });
}

export function isJoker(card: Card): card is JokerCard {
  return card.kind === 'joker';
}

export function suitColor(suit: Suit): Color {
  return suit === 'H' || suit === 'D' ? 'RED' : 'BLACK';
}

/** Colour of a card; jokers have none. */
export function colorOf(card: Card): Color | null {
  return card.kind === 'joker' ? null : suitColor(card.suit);
}

/** J, Q and K are face cards. Jokers never count as face cards (spec: confirmed). */
export function isFace(card: Card): boolean {
  return card.kind === 'normal' && card.rank >= JACK && card.rank <= KING;
}

export function rankLabel(rank: Rank): string {
  switch (rank) {
    case 11:
      return 'J';
    case 12:
      return 'Q';
    case 13:
      return 'K';
    case 14:
      return 'A';
    default:
      return String(rank);
  }
}

/** Short notation: `AS`, `10H`, `JKR` / `JKR2`. Inverse of {@link card}. */
export function cardLabel(card: Card): string {
  return card.kind === 'joker' ? (card.id === 1 ? 'JKR' : 'JKR2') : `${rankLabel(card.rank)}${card.suit}`;
}

/** Stable unique key within one deck (useful for Pixi object pools and React-like keys). */
export function cardKey(card: Card): string {
  return cardLabel(card);
}

export function sameCard(a: Card, b: Card): boolean {
  if (a.kind === 'joker') return b.kind === 'joker' && a.id === b.id;
  return b.kind === 'normal' && a.rank === b.rank && a.suit === b.suit;
}

const LABEL_TO_RANK: Readonly<Record<string, Rank>> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

/** Parse a short card notation, handy in tests: `card('AS')`, `card('10H')`, `card('TD')`, `card('JKR')`. */
export function card(text: string): Card {
  const t = text.trim().toUpperCase();
  if (t.startsWith('JKR')) {
    const id = t.length > 3 ? Number(t.slice(3)) : 1;
    if (id !== 1 && id !== 2) throw new Error(`bad joker: ${text}`);
    return joker(id);
  }
  const rank = LABEL_TO_RANK[t.slice(0, -1)];
  const suit = t.slice(-1) as Suit;
  if (rank === undefined || !SUITS.includes(suit)) throw new Error(`bad card: ${text}`);
  return normal(rank, suit);
}

/** Parse space separated cards: `cards('AS KS QS JS 10S')`. */
export function cards(text: string): Card[] {
  return text.trim().split(/\s+/).map(card);
}

/** 52 cards plus `jokers` jokers (0..2), in a fixed (unshuffled) order. */
export function standardDeck(jokers: 0 | 1 | 2 | number = 0): Card[] {
  if (!Number.isInteger(jokers) || jokers < 0 || jokers > 2) throw new Error('jokers must be 0, 1 or 2');
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(normal(rank, suit));
  for (let i = 1; i <= jokers; i++) deck.push(joker(i as 1 | 2));
  return deck;
}
