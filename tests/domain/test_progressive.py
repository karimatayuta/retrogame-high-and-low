from __future__ import annotations

import pytest

from twinjokers.domain.config import ProgressiveConfig
from twinjokers.domain.enums import PayLine
from twinjokers.domain.progressive import ProgressivePool

CFG = ProgressiveConfig()
FS = PayLine.FLUSH_OR_STRAIGHT


def test_initial():
    p = ProgressivePool(CFG)
    assert p.snapshot() == {
        PayLine.FIVE_OF_A_KIND: 2500,
        PayLine.ROYAL_FLUSH: 1250,
        PayLine.STRAIGHT_FLUSH: 250,
        PayLine.FOUR_OR_FULL: 40,
        FS: 32,
    }
    assert p.display_value(FS) == 32


def test_ceil_exact_integers_not_bumped_by_float_error():
    p = ProgressivePool(CFG)
    for k in range(1, 2001):
        p.add_max_bet_game()
        # exact value 32 + 0.335k = (6400 + 67k)/200 ; ceil by integer math
        assert p.display_value(FS) == -(-(6400 + 67 * k) // 200), k
        assert p.display_value(PayLine.STRAIGHT_FLUSH) == -(-(250 * 1000 + 35 * k) // 1000)
        assert p.display_value(PayLine.ROYAL_FLUSH) == -(-(1250 * 100 + 3 * k) // 100)


def test_award_resets_only_that_line():
    p = ProgressivePool(CFG)
    for _ in range(10):
        p.add_max_bet_game()
    before = p.snapshot()
    assert p.award(FS) == 36  # 32 + 3.35 -> 35.35 -> 36
    after = p.snapshot()
    assert after[FS] == 32
    for ln in before:
        if ln != FS:
            assert after[ln] == before[ln]


def test_restore_values_and_roundtrip():
    p = ProgressivePool(CFG)
    for _ in range(777):
        p.add_max_bet_game()
    q = ProgressivePool(CFG, p.snapshot())
    for ln in CFG.counters:
        assert q.display_value(ln) == p.display_value(ln)
    q.add_max_bet_game()
    p.add_max_bet_game()
    assert q.snapshot() == p.snapshot()


def test_partial_values_and_clamp():
    p = ProgressivePool(CFG, {FS: 100.5})
    assert p.display_value(FS) == 101
    assert p.display_value(PayLine.FOUR_OR_FULL) == 40
    assert ProgressivePool(CFG, {FS: 1.0}).value(FS) == 32  # below initial: clamped


def test_unknown_line_and_bad_values():
    p = ProgressivePool(CFG)
    for bad in (PayLine.TWO_PAIR, PayLine.JOKER_ANYTHING, PayLine.THREE_OF_A_KIND):
        with pytest.raises(ValueError):
            p.value(bad)
        with pytest.raises(ValueError):
            p.award(bad)
        with pytest.raises(ValueError):
            p.display_value(bad)
        with pytest.raises(ValueError):
            ProgressivePool(CFG, {bad: 5.0})
    with pytest.raises(ValueError):
        ProgressivePool(CFG, {FS: float("nan")})
    with pytest.raises(ValueError):
        ProgressivePool(CFG, {FS: float("inf")})


def test_snapshot_is_a_copy():
    p = ProgressivePool(CFG)
    s = p.snapshot()
    s[FS] = 9999
    assert p.value(FS) == 32
