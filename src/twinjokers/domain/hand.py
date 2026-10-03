"""Hand evaluation for the main game (54 cards, two wild jokers) and HIGH & LOW bonus.

Internally hands are reduced to plain ints so that all 3,162,510 five-card hands
can be enumerated quickly. A *code* is ``suit_index * 13 + (rank - 2)`` for normal
cards (0..51) and 52 / 53 for the two jokers.
"""

from __future__ import annotations

from collections.abc import Sequence

from twinjokers.domain.cards import Card, Suit
from twinjokers.domain.enums import HandRank, HighLowBonus

HAND_SIZE = 5
JOKER_CODE_1 = 52
JOKER_CODE_2 = 53

_SUIT_INDEX: dict[Suit, int] = {suit: i for i, suit in enumerate(Suit)}


def card_code(c: Card) -> int:
    """Map a card to its 0..53 integer code (see module docstring)."""
    if c.rank is None or c.suit is None:
        return JOKER_CODE_1 + (c.joker_id - 1)
    return _SUIT_INDEX[c.suit] * 13 + (int(c.rank) - 2)


def _codes(hand: Sequence[Card]) -> list[int]:
    if len(hand) != HAND_SIZE:
        raise ValueError(f"a hand must have exactly {HAND_SIZE} cards, got {len(hand)}")
    codes = [card_code(c) for c in hand]
    if len(set(codes)) != HAND_SIZE:
        raise ValueError("a hand must not contain duplicate cards")
    if any(code > JOKER_CODE_2 for code in codes):
        raise ValueError("joker_id must be 1 or 2")
    return codes


def evaluate_codes(codes: Sequence[int]) -> HandRank:
    """Evaluate five distinct card codes (no validation; used for enumeration)."""
    ranks: list[int] = []
    first_suit = -1
    same_suit = True
    for code in codes:
        if code >= JOKER_CODE_1:
            continue
        suit, r = divmod(code, 13)
        ranks.append(r + 2)
        if first_suit < 0:
            first_suit = suit
        elif suit != first_suit:
            same_suit = False
    jokers = HAND_SIZE - len(ranks)

    counts: dict[int, int] = {}
    for r in ranks:
        counts[r] = counts.get(r, 0) + 1
    top = max(counts.values())
    distinct = len(counts) == len(ranks)

    if top + jokers >= 5:
        return HandRank.FIVE_OF_A_KIND

    straight = False
    if distinct:
        lo, hi = min(ranks), max(ranks)
        if hi - lo <= 4:
            straight = True
        elif hi == 14:  # ace may play low: A-2-3-4-5
            ranks_wo_ace = [r for r in ranks if r != 14]
            straight = max(ranks_wo_ace) <= 5
    if same_suit and straight:
        return HandRank.ROYAL_FLUSH if min(ranks) >= 10 else HandRank.STRAIGHT_FLUSH
    if top + jokers >= 4:
        return HandRank.FOUR_OF_A_KIND
    if jokers <= 1:
        pairs = sum(1 for n in counts.values() if n >= 2)
        # 3+2 (no joker) or two pair + joker
        if (jokers == 0 and top == 3 and pairs == 2) or (jokers == 1 and top == 2 and pairs == 2):
            return HandRank.FULL_HOUSE
    if same_suit:
        return HandRank.FLUSH
    if straight:
        return HandRank.STRAIGHT
    if top + jokers >= 3:
        return HandRank.THREE_OF_A_KIND
    if jokers == 0 and sum(1 for n in counts.values() if n == 2) == 2:
        return HandRank.TWO_PAIR
    return HandRank.JOKER_ANYTHING if jokers else HandRank.NOTHING


def evaluate_hand(hand: Sequence[Card]) -> HandRank:
    """Rank a five-card hand from the 54-card deck; jokers are wild.

    Raises ValueError for a wrong card count or duplicate cards.
    """
    return evaluate_codes(_codes(hand))


_BONUS_FROM_RANK: dict[HandRank, HighLowBonus] = {
    HandRank.ROYAL_FLUSH: HighLowBonus.ROYAL_FLUSH,
    HandRank.STRAIGHT_FLUSH: HighLowBonus.STRAIGHT_FLUSH,
    # Four of a kind is not in the bonus table (spec: cannot occur). If it ever does,
    # pay it as FULL_HOUSE: the nearest listed hand that is not weaker than it.
    HandRank.FOUR_OF_A_KIND: HighLowBonus.FULL_HOUSE,
    HandRank.FULL_HOUSE: HighLowBonus.FULL_HOUSE,
    HandRank.FLUSH: HighLowBonus.FLUSH,
    HandRank.STRAIGHT: HighLowBonus.STRAIGHT,
    HandRank.THREE_OF_A_KIND: HighLowBonus.THREE_OF_A_KIND,
    HandRank.TWO_PAIR: HighLowBonus.TWO_PAIR,
}


def evaluate_high_low_bonus(hand: Sequence[Card]) -> HighLowBonus:
    """Special bonus for the five HIGH & LOW cards (no jokers allowed)."""
    if any(c.is_joker for c in hand):
        raise ValueError("HIGH & LOW bonus hands must not contain jokers")
    rank = evaluate_hand(hand)
    bonus = _BONUS_FROM_RANK.get(rank)
    if bonus is not None:
        return bonus
    # Only NOTHING is left (no jokers): a single pair of J/Q/K/A is JACKS OR BETTER.
    seen: set[int] = set()
    for c in hand:
        assert c.rank is not None
        if int(c.rank) >= 11 and int(c.rank) in seen:
            return HighLowBonus.JACKS_OR_BETTER
        seen.add(int(c.rank))
    return HighLowBonus.NONE
