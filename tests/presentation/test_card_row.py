from __future__ import annotations

from twinjokers.domain.cards import card
from twinjokers.presentation.card_row import EMPTY, FAST, NORMAL, SlotVis, plan
from twinjokers.presentation.sound import Sfx


def _up(text: str) -> SlotVis:
    return SlotVis(card(text), True, True)


def test_deal_appears_one_by_one_then_flips() -> None:
    targets = tuple(_up(c) for c in ("AS", "KS", "QS", "JS", "10S"))
    anims, sounds, end = plan([EMPTY] * 5, targets, 100, NORMAL)
    appear = [a.appear_at for a in anims if a]
    assert appear == [100 + i * NORMAL.step for i in range(5)]
    flips = [a.flip_at for a in anims if a]
    assert all(f is not None and f > appear[-1] for f in flips)
    assert [s for _, s in sounds].count(Sfx.DEAL) == 5
    assert [s for _, s in sounds].count(Sfx.FLIP) == 5
    assert end == max(f for f in flips if f is not None) + NORMAL.flip


def test_unchanged_row_has_no_animation() -> None:
    vis = [_up("AS")] * 5
    anims, sounds, end = plan(vis, tuple(vis), 10, NORMAL)
    assert anims == [None] * 5 and sounds == [] and end == 10


def test_face_down_card_is_revealed_in_place() -> None:
    back = SlotVis(None, False, True)
    vis = [_up("AS"), back, back, back, back]
    targets = (_up("AS"), _up("2C"), _up("3C"), _up("4C"), _up("5C"))
    anims, sounds, _ = plan(vis, targets, 0, FAST)
    assert anims[0] is None
    assert all(a is not None and a.flip_at is not None for a in anims[1:])
    assert [s for _, s in sounds] == [Sfx.FLIP] * 4  # no DEAL ticks for cards already there
