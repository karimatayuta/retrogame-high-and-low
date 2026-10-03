import random

import pytest

from twinjokers.domain.cards import card
from twinjokers.domain.config import DoubleDownConfig
from twinjokers.domain.double_down.common import DoubleDownError, Phase
from twinjokers.domain.double_down.standard import (
    StandardDouble,
    StandardOutcome,
    standard_strength,
)

CFG = DoubleDownConfig()


def test_strength_order():
    assert standard_strength(card("2S")) < standard_strength(card("KS"))
    assert standard_strength(card("KS")) < standard_strength(card("AS"))
    assert standard_strength(card("AS")) < standard_strength(card("JKR"))


def test_win_lose(scripted):
    g = StandardDouble(10, CFG, scripted("7S 8H 6H 7D KC"))
    assert g.dealer_card == card("7S")
    r = g.pick(1)
    assert r.outcome is StandardOutcome.WIN
    assert r.payout == 20
    assert r.cards == tuple(card(t) for t in ["7S", "8H", "6H", "7D", "KC"])
    assert g.phase is Phase.FINISHED
    assert g.can_collect
    g = StandardDouble(10, CFG, scripted("7S 8H 6H 7D KC"))
    r = g.pick(2)
    assert r.outcome is StandardOutcome.LOSE
    assert r.payout == 0
    assert not g.can_collect


def test_draw_requires_redeal_and_blocks_collect(scripted):
    g = StandardDouble(10, CFG, scripted("7S 8H 6H 7D KC"))
    r = g.pick(3)
    assert r.outcome is StandardOutcome.DRAW
    assert not r.can_collect
    assert not g.can_collect
    assert g.phase is Phase.NEEDS_REDEAL
    with pytest.raises(DoubleDownError):
        g.pick(1)
    g.redeal()
    assert g.phase is Phase.AWAITING_PICK
    assert g.result is None
    assert g.stake == 10
    g.pick(1)
    with pytest.raises(DoubleDownError):
        g.redeal()


def test_joker_dealer_only_joker_draws(scripted):
    g = StandardDouble(10, CFG, scripted("JKR AS JKR2 2C KS"))
    assert g.pick(1).outcome is StandardOutcome.LOSE
    g = StandardDouble(10, CFG, scripted("JKR AS JKR2 2C KS"))
    assert g.pick(2).outcome is StandardOutcome.DRAW  # joker vs joker


def test_joker_pick_beats_ace(scripted):
    g = StandardDouble(10, CFG, scripted("AS JKR 2C 3C 4C"))
    assert g.pick(1).outcome is StandardOutcome.WIN


def test_cap(scripted):
    g = StandardDouble(5000, CFG, scripted("2S 3H 4H 5D 6C"))
    assert g.pick(1).payout == 10000
    cfg = CFG.model_copy(update={"payout_cap": 7000})
    g = StandardDouble(5000, cfg, scripted("2S 3H 4H 5D 6C"))
    assert g.pick(1).payout == 7000


def test_illegal_calls(scripted):
    for bad in (0, 5, -1, 99):
        with pytest.raises(DoubleDownError):
            StandardDouble(10, CFG, scripted()).pick(bad)
    g = StandardDouble(10, CFG, scripted("7S 8H 6H 2D KC"))
    g.pick(1)
    with pytest.raises(DoubleDownError):
        g.pick(2)
    with pytest.raises(DoubleDownError):
        g.redeal()
    for stake in (0, -3, 5001):
        with pytest.raises(DoubleDownError):
            StandardDouble(stake, CFG, scripted())


def test_stake_boundaries(scripted):
    StandardDouble(1, CFG, scripted())
    StandardDouble(5000, CFG, scripted())


def test_deck_composition_and_distinct_cards():
    for seed in range(200):
        g = StandardDouble(1, CFG, random.Random(seed))
        r = g.pick(1)
        assert len(set(r.cards)) == 5
