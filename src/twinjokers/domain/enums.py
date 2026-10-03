"""Shared domain vocabulary.

Kept in one module so that every layer (and every contributor) uses the same
names. Member order matters: earlier members are stronger / take precedence.
"""

from __future__ import annotations

from enum import StrEnum


class HandRank(StrEnum):
    """Main game hands, strongest first. Only the first match is paid."""

    FIVE_OF_A_KIND = "FIVE OF A KIND"
    ROYAL_FLUSH = "ROYAL FLUSH"
    STRAIGHT_FLUSH = "STRAIGHT FLUSH"
    FOUR_OF_A_KIND = "FOUR OF A KIND"
    FULL_HOUSE = "FULL HOUSE"
    FLUSH = "FLUSH"
    STRAIGHT = "STRAIGHT"
    THREE_OF_A_KIND = "THREE OF A KIND"
    TWO_PAIR = "TWO PAIR"
    JOKER_ANYTHING = "JOKER ANYTHING"
    NOTHING = "NOTHING"


class PayLine(StrEnum):
    """Rows of the pay table (several hands may share one row)."""

    FIVE_OF_A_KIND = "FIVE OF A KIND"
    ROYAL_FLUSH = "ROYAL FLUSH"
    STRAIGHT_FLUSH = "STRAIGHT FLUSH"
    FOUR_OR_FULL = "4 OF A KIND / FULL HOUSE"
    FLUSH_OR_STRAIGHT = "FLUSH / STRAIGHT"
    THREE_OF_A_KIND = "THREE OF A KIND"
    TWO_PAIR = "TWO PAIR"
    JOKER_ANYTHING = "JOKER ANYTHING"


HAND_TO_PAYLINE: dict[HandRank, PayLine] = {
    HandRank.FIVE_OF_A_KIND: PayLine.FIVE_OF_A_KIND,
    HandRank.ROYAL_FLUSH: PayLine.ROYAL_FLUSH,
    HandRank.STRAIGHT_FLUSH: PayLine.STRAIGHT_FLUSH,
    HandRank.FOUR_OF_A_KIND: PayLine.FOUR_OR_FULL,
    HandRank.FULL_HOUSE: PayLine.FOUR_OR_FULL,
    HandRank.FLUSH: PayLine.FLUSH_OR_STRAIGHT,
    HandRank.STRAIGHT: PayLine.FLUSH_OR_STRAIGHT,
    HandRank.THREE_OF_A_KIND: PayLine.THREE_OF_A_KIND,
    HandRank.TWO_PAIR: PayLine.TWO_PAIR,
    HandRank.JOKER_ANYTHING: PayLine.JOKER_ANYTHING,
}

# Pay lines that carry a progressive counter when played at MAX BET.
PROGRESSIVE_LINES: tuple[PayLine, ...] = (
    PayLine.FIVE_OF_A_KIND,
    PayLine.ROYAL_FLUSH,
    PayLine.STRAIGHT_FLUSH,
    PayLine.FOUR_OR_FULL,
    PayLine.FLUSH_OR_STRAIGHT,
)


class FreeGameTrigger(StrEnum):
    """Free game conditions, by face cards (J/Q/K; jokers never count)."""

    FIVE_SAME_COLOR = "5 R/B FACES"
    ANY_FIVE = "ANY 5 FACES"
    FOUR_SAME_COLOR = "4 R/B FACES"
    ANY_FOUR = "ANY 4 FACES"
    THREE_SAME_COLOR = "3 R/B FACES"


class HighLowBonus(StrEnum):
    """Special bonus hands of HIGH & LOW (5 cards, never contain a joker)."""

    ROYAL_FLUSH = "ROYAL FLUSH"
    STRAIGHT_FLUSH = "STRAIGHT FLUSH"
    FULL_HOUSE = "FULL HOUSE"
    FLUSH = "FLUSH"
    STRAIGHT = "STRAIGHT"
    THREE_OF_A_KIND = "THREE OF A KIND"
    TWO_PAIR = "TWO PAIR"
    JACKS_OR_BETTER = "JACKS OR BETTER"
    NONE = "NONE"


class DoubleDownKind(StrEnum):
    STANDARD = "STANDARD"
    HIGH_LOW = "HIGH & LOW"
    RED_BLACK = "RED & BLACK"


class DoubleDownMenuItem(StrEnum):
    """Items shown under HOLD 1..5 after a win (order defined in config)."""

    HALF_DOUBLE = "HALF DOUBLE"
    STANDARD = "STANDARD"
    HIGH_LOW = "HIGH & LOW"
    RED_BLACK = "RED & BLACK"
    TAKE_SCORE = "TAKE SCORE"


class HighLowGuess(StrEnum):
    HIGH = "HIGH"
    LOW = "LOW"


class HighLowDrawMode(StrEnum):
    ARCADE = "ARCADE"  # 実機風: win drawn with fixed probability, then a matching card is shown
    FAIR = "FAIR"  # cards simply come off a shuffled deck
