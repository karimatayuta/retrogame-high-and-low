"""Exhaustive verification of the spec's 検算結果 (proves our rule interpretation)."""

from __future__ import annotations

from collections import Counter
from fractions import Fraction
from itertools import combinations

import pytest

from twinjokers.domain.cards import standard_deck
from twinjokers.domain.config import DEFAULT_CONFIG as C
from twinjokers.domain.enums import HAND_TO_PAYLINE, HandRank
from twinjokers.domain.free_game import detect_free_game
from twinjokers.domain.hand import evaluate_hand

TOTAL = 3_162_510
TOL = 0.0005


def _enumerate() -> tuple[Counter[HandRank], Counter]:
    ranks: Counter[HandRank] = Counter()
    both: Counter = Counter()
    for h in combinations(standard_deck(2), 5):
        r = evaluate_hand(h)
        t = detect_free_game(h, C.free_game)
        ranks[r] += 1
        both[(r, t)] += 1
    return ranks, both


def _per_bet_payout(rank: HandRank, bet: int) -> int:
    line = HAND_TO_PAYLINE.get(rank)
    return 0 if line is None else bet * C.paytable.multipliers[line]


@pytest.mark.slow
def test_rtp_matches_spec():
    ranks, both = _enumerate()
    assert sum(ranks.values()) == TOTAL
    assert ranks[HandRank.JOKER_ANYTHING] == 339_696
    assert ranks[HandRank.NOTHING] == 2_400_780

    trig = Counter()
    for (_, t), n in both.items():
        if t is not None:
            trig[t] += n
    awards = C.free_game.awards
    a = Fraction(sum(n * awards[t] for t, n in trig.items()), TOTAL)  # games awarded / hand
    extra_per_hand = a / (1 - a)  # total free games per paid game, incl. retriggers (geometric)

    hit_hands = sum(n for r, n in ranks.items() if r is not HandRank.NOTHING)
    hit_with_free = hit_hands + sum(n for (r, t), n in both.items() if r is HandRank.NOTHING and t)
    assert hit_hands / TOTAL == pytest.approx(0.2409, abs=TOL / 100 * 10)
    assert hit_with_free / TOTAL == pytest.approx(0.2537, abs=TOL / 100 * 10)

    for bet in (1, 2, 3, 4):
        base = Fraction(sum(n * _per_bet_payout(r, bet) for r, n in ranks.items()), TOTAL * bet)
        mult = C.free_game.payout_multiplier
        f_min = Fraction(
            sum(n * max(mult * _per_bet_payout(r, bet), bet) for r, n in ranks.items()),
            TOTAL * bet,
        )
        f_nomin = Fraction(
            sum(n * mult * _per_bet_payout(r, bet) for r, n in ranks.items()), TOTAL * bet
        )
        free = extra_per_hand * f_min
        total = base + free
        print(
            f"bet={bet} base={float(base):.5f} free={float(free):.5f} total={float(total):.5f}"
            f" (no-min free={float(extra_per_hand * f_nomin):.5f}, N={float(extra_per_hand):.4f})"
        )
        assert float(base) == pytest.approx(0.610, abs=TOL)
        assert float(free) == pytest.approx(0.313, abs=TOL)
        assert float(total) == pytest.approx(0.9224, abs=TOL)
