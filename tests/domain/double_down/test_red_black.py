import pytest

from twinjokers.domain.cards import card
from twinjokers.domain.config import DoubleDownConfig
from twinjokers.domain.double_down.common import DoubleDownError, Phase
from twinjokers.domain.double_down.red_black import RedBlackDouble

CFG = DoubleDownConfig()


def test_same_color_wins_different_loses(scripted):
    r = RedBlackDouble(10, CFG, scripted("7S 8H 6C 2D KC")).pick(2)
    assert r.won and r.payout == 20 and not r.flush
    r = RedBlackDouble(10, CFG, scripted("7S 8H 6C 2D KC")).pick(1)
    assert not r.won and r.payout == 0
    assert len(r.cards) == 5


def test_no_jokers_in_deck():
    assert CFG.red_black_jokers == 0


def test_flush_pays_x10(scripted):
    g = RedBlackDouble(10, CFG, scripted("2H 5H 9H JH KH"))
    r = g.pick(3)
    assert r.flush and r.won
    assert r.payout == 100
    assert g.phase is Phase.FINISHED


def test_flush_cap(scripted):
    r = RedBlackDouble(2000, CFG, scripted("2H 5H 9H JH KH")).pick(1)
    assert r.payout == 10000  # 20000 capped
    r = RedBlackDouble(900, CFG, scripted("2C 5C 9C JC KC")).pick(1)
    assert r.payout == 9000


def test_same_colour_not_flush_is_x2(scripted):
    r = RedBlackDouble(10, CFG, scripted("2H 5D 9H JH KH")).pick(1)
    assert not r.flush and r.payout == 20


def test_picked_index_and_cards(scripted):
    g = RedBlackDouble(10, CFG, scripted("2H 5D 9H JH KH"))
    assert g.dealer_card == card("2H")
    r = g.pick(4)
    assert r.picked_index == 4
    assert g.result is r


def test_illegal(scripted):
    g = RedBlackDouble(10, CFG, scripted())
    for bad in (0, 5):
        with pytest.raises(DoubleDownError):
            g.pick(bad)
    g.pick(1)
    with pytest.raises(DoubleDownError):
        g.pick(1)
    with pytest.raises(DoubleDownError):
        RedBlackDouble(0, CFG, scripted())
    with pytest.raises(DoubleDownError):
        RedBlackDouble(5001, CFG, scripted())


def test_win_rate_matches_25_51():
    import random

    rng = random.Random(1)
    n = 20000
    wins = sum(RedBlackDouble(1, CFG, rng).pick(1).won for _ in range(n))
    assert abs(wins / n - 25 / 51) < 0.02
