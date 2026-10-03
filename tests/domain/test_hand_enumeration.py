"""Exhaustive check of the evaluator against the spec's verification table."""

from __future__ import annotations

from collections import Counter
from itertools import combinations

import pytest

from twinjokers.domain.cards import standard_deck
from twinjokers.domain.enums import HandRank
from twinjokers.domain.hand import card_code, evaluate_codes, evaluate_hand

EXPECTED = {
    HandRank.FIVE_OF_A_KIND: 78,
    HandRank.ROYAL_FLUSH: 84,
    HandRank.STRAIGHT_FLUSH: 540,
    HandRank.FOUR_OF_A_KIND: 9_360,
    HandRank.FULL_HOUSE: 9_360,
    HandRank.FLUSH: 11_388,
    HandRank.STRAIGHT: 34_704,
    HandRank.THREE_OF_A_KIND: 232_968,
    HandRank.TWO_PAIR: 123_552,
    HandRank.JOKER_ANYTHING: 339_696,
    HandRank.NOTHING: 2_400_780,
}


@pytest.mark.slow
def test_all_hands_match_spec_counts() -> None:
    counter: Counter[HandRank] = Counter(evaluate_codes(h) for h in combinations(range(54), 5))
    assert sum(counter.values()) == 3_162_510
    assert dict(counter) == EXPECTED


@pytest.mark.slow
def test_card_api_agrees_with_code_api_on_a_sample() -> None:
    deck = standard_deck(jokers=2)
    assert [card_code(c) for c in deck] == [*range(52), 52, 53] or len(
        {card_code(c) for c in deck}
    ) == 54
    for i, combo in enumerate(combinations(deck, 5)):
        if i % 997 == 0:
            assert evaluate_hand(combo) == evaluate_codes([card_code(c) for c in combo])
