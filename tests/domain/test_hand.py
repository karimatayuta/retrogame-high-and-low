from __future__ import annotations

import pytest

from twinjokers.domain.cards import cards
from twinjokers.domain.enums import HandRank as H
from twinjokers.domain.enums import HighLowBonus as B
from twinjokers.domain.hand import evaluate_hand, evaluate_high_low_bonus


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("7S 7H 7D 7C JKR", H.FIVE_OF_A_KIND),
        ("7S 7H 7D JKR JKR2", H.FIVE_OF_A_KIND),
        ("AS AH AD AC JKR2", H.FIVE_OF_A_KIND),
        ("10S JS QS KS AS", H.ROYAL_FLUSH),
        ("JKR 10S JS QS AS", H.ROYAL_FLUSH),
        ("JKR JKR2 10S JS QS", H.ROYAL_FLUSH),
        ("JKR 10H JH QH KH", H.ROYAL_FLUSH),
        ("JKR JKR2 AS KS QS", H.ROYAL_FLUSH),
        ("9S 10S JS QS KS", H.STRAIGHT_FLUSH),
        ("JKR 2S 3S 4S 5S", H.STRAIGHT_FLUSH),
        ("AS 2S 3S 4S 5S", H.STRAIGHT_FLUSH),
        ("JKR AS 2S 3S 4S", H.STRAIGHT_FLUSH),
        ("JKR JKR2 2S 3S 5S", H.STRAIGHT_FLUSH),
        ("JKR 9S JS QS KS", H.STRAIGHT_FLUSH),
        ("JKR JKR2 9S JS KS", H.STRAIGHT_FLUSH),
        ("JKR JKR2 7S 7H 2D", H.FOUR_OF_A_KIND),
        ("7S 7H 7D 7C 2D", H.FOUR_OF_A_KIND),
        ("JKR 7S 7H 7D 2C", H.FOUR_OF_A_KIND),
        ("JKR JKR2 7S 7H 2D", H.FOUR_OF_A_KIND),
        ("7S 7H 7D 2C 2D", H.FULL_HOUSE),
        ("JKR 7S 7H 2C 2D", H.FULL_HOUSE),
        ("2S 5S 9S JS KS", H.FLUSH),
        ("JKR 2S 5S 9S KS", H.FLUSH),
        ("JKR JKR2 2S 9S KS", H.FLUSH),
        ("JKR 2H 3H 4H 9H", H.FLUSH),
        ("2S 3H 4D 5C 6S", H.STRAIGHT),
        ("AS 2H 3D 4C 5S", H.STRAIGHT),
        ("10S JH QD KC AS", H.STRAIGHT),
        ("JKR AS KH QD JC", H.STRAIGHT),
        ("JKR JKR2 AS KH QD", H.STRAIGHT),
        ("JKR 2S 4H 5D 3C", H.STRAIGHT),
        ("JKR AS 2H 3D 5C", H.STRAIGHT),
        ("JKR JKR2 AS 2H 4D", H.STRAIGHT),
        ("QS KH AD 2C 3S", H.NOTHING),  # no wraparound
        ("JKR KS AH 2D 3C", H.JOKER_ANYTHING),  # no wraparound with joker
        ("JKR QS KH AD 2C", H.JOKER_ANYTHING),
        ("JKR JKR2 KS AH 2D", H.THREE_OF_A_KIND),  # two jokers: trips at least
        ("7S 7H 7D 2C 9D", H.THREE_OF_A_KIND),
        ("JKR 7S 7H 2C 9D", H.THREE_OF_A_KIND),
        ("JKR JKR2 7S 2C 9D", H.THREE_OF_A_KIND),
        ("7S 7H 2D 2C 9D", H.TWO_PAIR),
        ("JKR 2S 5H 9D KC", H.JOKER_ANYTHING),
        ("JKR JKR2 2S 5H 9D", H.THREE_OF_A_KIND),
        ("7S 7H 2D 4C 9D", H.NOTHING),
        ("AS AH 2D 4C 9D", H.NOTHING),
        ("2S 5H 9D JC KS", H.NOTHING),
        ("2S 3S 4S 5S 7S", H.FLUSH),
        ("2S 3H 4S 5S 7S", H.NOTHING),
        ("2S 3S 4S 5S 7D", H.NOTHING),
        ("AS KS QS JS 9S", H.FLUSH),
        ("AS 2S 3S 4S 6S", H.FLUSH),
        ("JKR AS 2S 3S 6S", H.FLUSH),
        ("JKR AS 2S 3S 4D", H.STRAIGHT),
    ],
)
def test_evaluate_hand(text: str, expected: H) -> None:
    assert evaluate_hand(cards(text)) == expected


def test_order_does_not_matter() -> None:
    hand = cards("JKR 2S 3S 4S 5S")
    assert evaluate_hand(hand[::-1]) == evaluate_hand(hand) == H.STRAIGHT_FLUSH


def test_accepts_tuple() -> None:
    assert evaluate_hand(tuple(cards("10S JS QS KS AS"))) == H.ROYAL_FLUSH


@pytest.mark.parametrize("text", ["AS KS QS JS", "AS KS QS JS 10S 9S", "", "AS AS KS QS JS"])
def test_bad_size_or_duplicate_raises(text: str) -> None:
    with pytest.raises(ValueError):
        evaluate_hand(cards(text))


def test_duplicate_joker_raises() -> None:
    with pytest.raises(ValueError):
        evaluate_hand(cards("JKR JKR 2S 3S 4S"))


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("10S JS QS KS AS", B.ROYAL_FLUSH),
        ("9H 10H JH QH KH", B.STRAIGHT_FLUSH),
        ("AH 2H 3H 4H 5H", B.STRAIGHT_FLUSH),
        ("7S 2D 7H 2S 7C", B.FULL_HOUSE),
        ("2S 5S 9S JS KS", B.FLUSH),
        ("2S 3H 4D 5C 6S", B.STRAIGHT),
        ("7S 7H 7D 2C 9D", B.THREE_OF_A_KIND),
        ("7S 7H 2D 2C 9D", B.TWO_PAIR),
        ("JS JH 2D 4C 9D", B.JACKS_OR_BETTER),
        ("QS QH 2D 4C 9D", B.JACKS_OR_BETTER),
        ("KS KH 2D 4C 9D", B.JACKS_OR_BETTER),
        ("AS AH 2D 4C 9D", B.JACKS_OR_BETTER),
        ("10S 10H 2D 4C 9D", B.NONE),
        ("2S 2H 3D 4C 9D", B.NONE),
        ("2S 5H 9D JC KS", B.NONE),
        ("7S 7H 7D 7C 2D", B.FULL_HOUSE),  # four of a kind: documented fallback
    ],
)
def test_high_low_bonus(text: str, expected: B) -> None:
    assert evaluate_high_low_bonus(cards(text)) == expected


def test_high_low_bonus_rejects_joker() -> None:
    with pytest.raises(ValueError):
        evaluate_high_low_bonus(cards("JKR 2S 3S 4S 5S"))
