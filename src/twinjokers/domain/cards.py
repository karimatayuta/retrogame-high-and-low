"""Playing cards: the most basic value objects of the game.

Cards are frozen dataclasses (not pydantic models) because the hand
evaluator touches millions of them during verification; pydantic is used at
the system boundaries (config, save data, view models) instead.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import IntEnum, StrEnum


class Color(StrEnum):
    RED = "RED"
    BLACK = "BLACK"


class Suit(StrEnum):
    SPADES = "S"
    HEARTS = "H"
    DIAMONDS = "D"
    CLUBS = "C"

    @property
    def color(self) -> Color:
        return Color.RED if self in (Suit.HEARTS, Suit.DIAMONDS) else Color.BLACK

    @property
    def symbol(self) -> str:
        return {"S": "♠", "H": "♥", "D": "♦", "C": "♣"}[self.value]


class Rank(IntEnum):
    """Card rank. The int value is the strength: 2 is weakest, ACE is strongest."""

    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE = 5
    SIX = 6
    SEVEN = 7
    EIGHT = 8
    NINE = 9
    TEN = 10
    JACK = 11
    QUEEN = 12
    KING = 13
    ACE = 14

    @property
    def is_face(self) -> bool:
        """J, Q and K are face cards (used by the free game trigger)."""
        return self in (Rank.JACK, Rank.QUEEN, Rank.KING)

    @property
    def label(self) -> str:
        return {10: "10", 11: "J", 12: "Q", 13: "K", 14: "A"}.get(self.value, str(self.value))


@dataclass(frozen=True, slots=True)
class Card:
    """A playing card. A joker has ``rank`` and ``suit`` set to ``None``.

    ``joker_id`` (1 or 2) only distinguishes the two physical jokers so that
    every card in a deck is unique; it has no effect on game rules.
    """

    rank: Rank | None
    suit: Suit | None
    joker_id: int = 0

    def __post_init__(self) -> None:
        if (self.rank is None) != (self.suit is None):
            raise ValueError("rank and suit must both be set, or both be None (joker)")
        if self.rank is None and self.joker_id <= 0:
            raise ValueError("a joker needs a positive joker_id")
        if self.rank is not None and self.joker_id != 0:
            raise ValueError("a normal card must not have a joker_id")

    @property
    def is_joker(self) -> bool:
        return self.rank is None

    @property
    def color(self) -> Color | None:
        return None if self.suit is None else self.suit.color

    @property
    def is_face(self) -> bool:
        """Jokers never count as face cards (spec: confirmed)."""
        return self.rank is not None and self.rank.is_face

    def __str__(self) -> str:
        if self.rank is None or self.suit is None:
            return "JKR"
        return f"{self.rank.label}{self.suit.value}"


def joker(joker_id: int = 1) -> Card:
    return Card(None, None, joker_id)


def card(text: str) -> Card:
    """Parse a short card notation, handy in tests: ``"AS"``, ``"10H"``, ``"TD"``, ``"JKR"``.

    ``"JKR"`` / ``"JKR2"`` give joker 1 / joker 2.
    """
    text = text.strip().upper()
    if text.startswith("JKR"):
        return joker(int(text[3:] or "1"))
    rank_text, suit_text = text[:-1], text[-1]
    by_label = {r.label: r for r in Rank} | {"T": Rank.TEN}
    return Card(by_label[rank_text], Suit(suit_text))


def cards(text: str) -> list[Card]:
    """Parse space separated cards: ``cards("AS KS QS JS 10S")``."""
    return [card(t) for t in text.split()]


def standard_deck(jokers: int = 0) -> list[Card]:
    """52 cards plus ``jokers`` jokers, in a fixed (unshuffled) order."""
    if not 0 <= jokers <= 2:
        raise ValueError("jokers must be 0, 1 or 2")
    deck = [Card(rank, suit) for suit in Suit for rank in Rank]
    deck.extend(joker(i + 1) for i in range(jokers))
    return deck
