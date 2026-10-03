from __future__ import annotations

from itertools import pairwise

import pyxel

from twinjokers.presentation import layout
from twinjokers.presentation.input import (
    ALL_BUTTONS,
    KEY_BINDINGS,
    STRIP_BUTTONS,
    Action,
    hit_test,
)


def test_each_key_is_bound_once() -> None:
    keys = [k for k, _ in KEY_BINDINGS]
    assert len(keys) == len(set(keys))
    bound = {cmd.action for _, cmd in KEY_BINDINGS}
    assert bound == set(Action)
    holds = {cmd.arg for _, cmd in KEY_BINDINGS if cmd.action is Action.HOLD}
    assert holds == {1, 2, 3, 4, 5}
    assert (pyxel.KEY_M, Action.MAX_BET) in {(k, c.action) for k, c in KEY_BINDINGS}


def test_strip_fits_the_screen_without_overlap() -> None:
    xs = sorted((b.x, b.x + b.w) for b in STRIP_BUTTONS)
    assert xs[0][0] >= 0 and xs[-1][1] <= layout.W
    assert all(a[1] <= b[0] for a, b in pairwise(xs))
    assert all(b.y + b.h <= layout.H for b in STRIP_BUTTONS)


def test_hit_test_finds_buttons() -> None:
    for b in ALL_BUTTONS:
        assert hit_test(b.x + b.w // 2, b.y + b.h // 2) is not None
    assert hit_test(0, 0) is None
