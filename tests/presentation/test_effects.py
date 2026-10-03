from __future__ import annotations

import pytest

from twinjokers.presentation.effects import (
    CoinCounter,
    count_up_frames,
    count_up_value,
    marquee_lit,
    marquee_positions,
)
from twinjokers.presentation.text import blink


def test_count_up_endpoints_and_monotonic() -> None:
    assert count_up_value(100, 500, 0, 60) == 100
    assert count_up_value(100, 500, 60, 60) == 500
    assert count_up_value(100, 500, 999, 60) == 500
    values = [count_up_value(100, 500, f, 60) for f in range(0, 61)]
    assert values == sorted(values)
    assert all(100 <= v <= 500 for v in values)


def test_count_up_down_and_degenerate() -> None:
    values = [count_up_value(500, 100, f, 40) for f in range(41)]
    assert values == sorted(values, reverse=True)
    assert values[0] == 500 and values[-1] == 100
    assert count_up_value(7, 7, 3, 10) == 7
    assert count_up_value(0, 9, 0, 0) == 9
    assert count_up_value(0, 9, -5, 10) == 0
    assert count_up_value(0, 10_000, 1, 3) == 3333


def test_count_up_frames_clamped() -> None:
    assert count_up_frames(0, 0) == 1
    assert count_up_frames(0, 10_000, per_frame=1, max_frames=120) == 120
    assert count_up_frames(0, 50, per_frame=5) == 10


def test_coin_counter_runs_to_target() -> None:
    c = CoinCounter()
    c.start(10, 20, 5)
    assert c.value == 10 and not c.done
    changes = 0
    while not c.done:
        changes += c.tick()
    assert c.value == 20
    assert changes > 0
    assert c.tick() is False
    c.start(0, 100, 50)
    c.finish()
    assert c.value == 100 and c.done
    c.set(3)
    assert c.value == 3 and c.done


def test_blink_pattern() -> None:
    assert [blink(f, 4) for f in range(8)] == [True, True, False, False] * 2
    assert blink(5, 0) is True
    assert blink(0, 10, duty=0.0) is False


@pytest.mark.parametrize(("w", "h"), [(10, 10), (100, 40), (320, 240)])
def test_marquee_positions_unique_and_on_border(w: int, h: int) -> None:
    pts = marquee_positions(w, h, 8)
    assert len(pts) == len(set(pts))
    assert all(x in (0, w - 1) or y in (0, h - 1) for x, y in pts)
    assert all(0 <= x < w and 0 <= y < h for x, y in pts)


def test_marquee_lit_chases() -> None:
    lit0 = [i for i in range(9) if marquee_lit(i, 0)]
    lit1 = [i for i in range(9) if marquee_lit(i, 4)]
    assert lit0 == [0, 3, 6]
    assert lit1 == [1, 4, 7]
