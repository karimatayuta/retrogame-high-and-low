from __future__ import annotations

import pytest

from twinjokers.domain.config import DEFAULT_CONFIG as C
from twinjokers.domain.enums import HAND_TO_PAYLINE, HandRank, PayLine
from twinjokers.domain.payout import settle_main_game
from twinjokers.domain.progressive import ProgressivePool


def pool() -> ProgressivePool:
    return ProgressivePool(C.progressive)


@pytest.mark.parametrize("bet", [1, 2, 3, 4])
@pytest.mark.parametrize("hand", list(HAND_TO_PAYLINE))
def test_normal_bets(hand, bet):
    p = settle_main_game(hand, bet, pool(), C, free_game=False)
    assert p.amount == bet * C.paytable.multipliers[HAND_TO_PAYLINE[hand]]
    assert p.progressive_line is None


@pytest.mark.parametrize("hand", list(HAND_TO_PAYLINE))
def test_max_bet_fixed_or_progressive(hand):
    pl = pool()
    p = settle_main_game(hand, 5, pl, C, free_game=False)
    line = HAND_TO_PAYLINE[hand]
    if line in C.progressive.counters:
        assert p.progressive_line == line
        assert p.amount == C.paytable.max_bet_payouts[line]  # fresh pool = initial
    else:
        assert p.progressive_line is None
        assert p.amount == C.paytable.max_bet_payouts[line]


def test_progressive_pays_counter_and_resets():
    pl = pool()
    for _ in range(10):
        pl.add_max_bet_game()
    p = settle_main_game(HandRank.FLUSH, 5, pl, C, free_game=False)
    assert p.amount == 36 and p.progressive_line == PayLine.FLUSH_OR_STRAIGHT
    assert pl.value(PayLine.FLUSH_OR_STRAIGHT) == 32
    assert pl.display_value(PayLine.FOUR_OR_FULL) == 43  # untouched (40 + 2.4)


def test_no_progressive_below_max_bet_and_counter_untouched():
    pl = pool()
    for _ in range(10):
        pl.add_max_bet_game()
    snap = pl.snapshot()
    settle_main_game(HandRank.ROYAL_FLUSH, 4, pl, C, free_game=False)
    assert pl.snapshot() == snap


def test_nothing():
    assert settle_main_game(HandRank.NOTHING, 5, pool(), C, free_game=False).amount == 0
    p = settle_main_game(HandRank.NOTHING, 3, pool(), C, free_game=False)
    assert (p.amount, p.line, p.progressive_line) == (0, None, None)


def test_settle_does_not_increment():
    pl = pool()
    settle_main_game(HandRank.TWO_PAIR, 5, pl, C, free_game=False)
    assert pl.snapshot() == ProgressivePool(C.progressive).snapshot()


@pytest.mark.parametrize("bet", [1, 2, 3, 4, 5])
def test_free_game_min_bet(bet):
    assert settle_main_game(HandRank.NOTHING, bet, pool(), C, free_game=True).amount == bet
    # JOKER ANYTHING x2 = 2*bet at 1..4 (> bet); 8 at max bet
    p = settle_main_game(HandRank.JOKER_ANYTHING, bet, pool(), C, free_game=True)
    assert p.amount == (8 if bet == 5 else 2 * bet)


def test_free_game_doubles_progressive():
    pl = pool()
    for _ in range(10):
        pl.add_max_bet_game()
    p = settle_main_game(HandRank.STRAIGHT, 5, pl, C, free_game=True)
    assert p.amount == 72 and p.progressive_line == PayLine.FLUSH_OR_STRAIGHT
    assert pl.value(PayLine.FLUSH_OR_STRAIGHT) == 32


def test_free_game_min_rule_can_be_disabled():
    cfg = C.model_copy(
        update={"free_game": C.free_game.model_copy(update={"min_payout_is_bet": False})}
    )
    assert settle_main_game(HandRank.NOTHING, 3, pool(), cfg, free_game=True).amount == 0


@pytest.mark.parametrize("bet", [0, 6, -1])
def test_bad_bet(bet):
    with pytest.raises(ValueError):
        settle_main_game(HandRank.NOTHING, bet, pool(), C, free_game=False)
