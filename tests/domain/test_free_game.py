from __future__ import annotations

from itertools import combinations

import pytest

from twinjokers.domain.cards import cards, standard_deck
from twinjokers.domain.config import FreeGameConfig
from twinjokers.domain.enums import FreeGameTrigger as T
from twinjokers.domain.free_game import detect_free_game

CFG = FreeGameConfig()


@pytest.mark.parametrize(
    ("hand", "expected"),
    [
        ("JH QH KH JD QD", T.FIVE_SAME_COLOR),
        ("JS QS KC JC QC", T.FIVE_SAME_COLOR),
        ("JH QH KH JD QS", T.ANY_FIVE),
        ("JH QH KH JS QS", T.ANY_FIVE),
        ("JH QH KH JD 2S", T.FOUR_SAME_COLOR),
        ("JH QH KH JS 2S", T.ANY_FOUR),
        ("JH QH KH 2D 3S", T.THREE_SAME_COLOR),
        ("JH QH KS 2D 3S", None),
        ("JH QH KS QS 3S", T.ANY_FOUR),
        ("JH QH KS 4S 3S", None),
        ("JH QH KH JKR JKR2", T.THREE_SAME_COLOR),  # jokers never count
        ("JH QH JKR JKR2 KH", T.THREE_SAME_COLOR),
        ("JH QH KH QD JKR", T.FOUR_SAME_COLOR),
        ("AH 10H 9S 2C 3D", None),
    ],
)
def test_detect(hand, expected):
    assert detect_free_game(cards(hand), CFG) == expected


def test_most_games_wins_not_enum_order():
    # ANY 5 FACES configured above 5 R/B FACES: the larger award must win.
    cfg = FreeGameConfig(awards={**CFG.awards, T.ANY_FIVE: 150})
    assert detect_free_game(cards("JH QH KH JD QD"), cfg) == T.ANY_FIVE
    # 4 same colour + 1 odd: matches 4 R/B (25) and ANY 5 FACES (40) -> ANY 5 FACES
    assert detect_free_game(cards("JH QH KH JD QS"), CFG) == T.ANY_FIVE
    cfg2 = FreeGameConfig(awards={**CFG.awards, T.ANY_FOUR: 30})
    assert detect_free_game(cards("JH QH KH JD 2S"), cfg2) == T.ANY_FOUR


@pytest.mark.slow
def test_exclusive_counts_over_all_hands():
    counts: dict[T | None, int] = {}
    for hand in combinations(standard_deck(2), 5):
        t = detect_free_game(hand, CFG)
        counts[t] = counts.get(t, 0) + 1
    assert counts[T.FIVE_SAME_COLOR] == 12
    assert counts[T.ANY_FIVE] == 780
    assert counts[T.FOUR_SAME_COLOR] == 1260
    assert counts[T.ANY_FOUR] == 19530
    assert counts[T.THREE_SAME_COLOR] == 34440
