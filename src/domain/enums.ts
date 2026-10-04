/**
 * Shared domain vocabulary. Kept in one module so every layer (and every
 * contributor) uses the same names. Array order matters: earlier entries are
 * stronger / take precedence. String values are what the screen shows.
 */

/** Main game hands, strongest first. Only the first match is paid. */
export const HAND_RANKS = [
  'FIVE OF A KIND',
  'ROYAL FLUSH',
  'STRAIGHT FLUSH',
  'FOUR OF A KIND',
  'FULL HOUSE',
  'FLUSH',
  'STRAIGHT',
  'THREE OF A KIND',
  'TWO PAIR',
  'JOKER ANYTHING',
  'NOTHING',
] as const;
export type HandRank = (typeof HAND_RANKS)[number];

/** Rows of the pay table (several hands may share one row). */
export const PAY_LINES = [
  'FIVE OF A KIND',
  'ROYAL FLUSH',
  'STRAIGHT FLUSH',
  '4 OF A KIND / FULL HOUSE',
  'FLUSH / STRAIGHT',
  'THREE OF A KIND',
  'TWO PAIR',
  'JOKER ANYTHING',
] as const;
export type PayLine = (typeof PAY_LINES)[number];

export const HAND_TO_PAYLINE: Readonly<Record<Exclude<HandRank, 'NOTHING'>, PayLine>> = {
  'FIVE OF A KIND': 'FIVE OF A KIND',
  'ROYAL FLUSH': 'ROYAL FLUSH',
  'STRAIGHT FLUSH': 'STRAIGHT FLUSH',
  'FOUR OF A KIND': '4 OF A KIND / FULL HOUSE',
  'FULL HOUSE': '4 OF A KIND / FULL HOUSE',
  FLUSH: 'FLUSH / STRAIGHT',
  STRAIGHT: 'FLUSH / STRAIGHT',
  'THREE OF A KIND': 'THREE OF A KIND',
  'TWO PAIR': 'TWO PAIR',
  'JOKER ANYTHING': 'JOKER ANYTHING',
};

export function payLineOf(hand: HandRank): PayLine | null {
  return hand === 'NOTHING' ? null : HAND_TO_PAYLINE[hand];
}

/** Pay lines that carry a progressive counter when played at MAX BET. */
export const PROGRESSIVE_LINES = [
  'FIVE OF A KIND',
  'ROYAL FLUSH',
  'STRAIGHT FLUSH',
  '4 OF A KIND / FULL HOUSE',
  'FLUSH / STRAIGHT',
] as const satisfies readonly PayLine[];
export type ProgressiveLine = (typeof PROGRESSIVE_LINES)[number];

export function isProgressiveLine(line: PayLine): line is ProgressiveLine {
  return (PROGRESSIVE_LINES as readonly PayLine[]).includes(line);
}

/** Free game conditions by face cards (J/Q/K; jokers never count), most games first. */
export const FREE_GAME_TRIGGERS = [
  '5 R/B FACES',
  'ANY 5 FACES',
  '4 R/B FACES',
  'ANY 4 FACES',
  '3 R/B FACES',
] as const;
export type FreeGameTrigger = (typeof FREE_GAME_TRIGGERS)[number];

/** Special bonus hands of HIGH & LOW (5 cards, never contain a joker), strongest first. */
export const HIGH_LOW_BONUSES = [
  'ROYAL FLUSH',
  'STRAIGHT FLUSH',
  'FULL HOUSE',
  'FLUSH',
  'STRAIGHT',
  'THREE OF A KIND',
  'TWO PAIR',
  'JACKS OR BETTER',
  'NONE',
] as const;
export type HighLowBonus = (typeof HIGH_LOW_BONUSES)[number];

export type DoubleDownKind = 'STANDARD' | 'HIGH & LOW' | 'RED & BLACK';

/** Items shown under HOLD 1..5 after a win (order defined in config). */
export const DOUBLE_DOWN_MENU_ITEMS = ['HALF DOUBLE', 'STANDARD', 'HIGH & LOW', 'RED & BLACK', 'TAKE SCORE'] as const;
export type DoubleDownMenuItem = (typeof DOUBLE_DOWN_MENU_ITEMS)[number];

export type HighLowGuess = 'HIGH' | 'LOW';

/** ARCADE: win drawn with a fixed probability, then a matching card is shown. FAIR: plain shuffled deck. */
export type HighLowDrawMode = 'ARCADE' | 'FAIR';
