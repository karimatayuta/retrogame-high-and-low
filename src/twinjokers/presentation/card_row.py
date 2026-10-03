"""The five-card row and its animations (deal ticks, flips, reveals).

The game session changes state instantly; this class owns what is *shown*.
``start()`` receives the final slot contents and schedules, per slot, when a card
appears (back side) and when it flips. ``update()`` plays the matching sounds and
reports when the row has settled. Scheduling is pure (testable without Pyxel).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from twinjokers.domain.cards import Card
from twinjokers.presentation import palette as pal
from twinjokers.presentation.card_sprite import (
    CARD_GAP,
    CARD_W,
    draw_card,
    draw_card_flip,
    draw_card_slot,
    draw_highlight,
)
from twinjokers.presentation.sound import Sfx

SLOTS = 5


@dataclass(frozen=True, slots=True)
class SlotVis:
    """What one slot shows once settled."""

    card: Card | None = None
    up: bool = False
    present: bool = False  # False: empty dashed slot


EMPTY = SlotVis()


@dataclass(frozen=True, slots=True)
class Timing:
    step: int  # frames between card appearances (deal)
    gap: int  # pause between the last appearance and the first flip
    stagger: int  # frames between flips
    flip: int  # flip duration


NORMAL = Timing(step=5, gap=8, stagger=6, flip=10)
FAST = Timing(step=2, gap=3, stagger=2, flip=6)


@dataclass(slots=True)
class _Anim:
    prev: SlotVis
    target: SlotVis
    appear_at: int
    flip_at: int | None


def plan(
    vis: list[SlotVis], targets: tuple[SlotVis, ...], frame: int, timing: Timing
) -> tuple[list[_Anim | None], list[tuple[int, Sfx]], int]:
    """Schedule animations from ``vis`` to ``targets`` starting at ``frame``.

    Returns (per-slot animations, [(frame, sfx)], end frame).
    """
    anims: list[_Anim | None] = [None] * SLOTS
    sounds: list[tuple[int, Sfx]] = []
    reveals = [i for i in range(SLOTS) if _is_reveal(vis[i], targets[i])]
    appears = [
        i for i in range(SLOTS) if targets[i] != vis[i] and i not in reveals and targets[i].present
    ]
    end = frame
    for n, i in enumerate(appears):
        at = frame + n * timing.step
        anims[i] = _Anim(vis[i], targets[i], at, None)
        sounds.append((at, Sfx.DEAL))
        end = max(end, at)
    first_flip = frame + (len(appears) * timing.step + timing.gap if appears else 4)
    flips = [i for i in sorted(set(reveals) | set(appears)) if targets[i].up]
    for j, i in enumerate(flips):
        at = first_flip + j * timing.stagger
        if i in reveals:
            anims[i] = _Anim(vis[i], targets[i], frame - 1, at)
        else:
            a = anims[i]
            assert a is not None
            a.flip_at = at
        sounds.append((at, Sfx.FLIP))
        end = max(end, at + timing.flip)
    for i in range(SLOTS):
        if anims[i] is None and targets[i] != vis[i]:  # removed card: clear at once
            anims[i] = _Anim(vis[i], targets[i], frame, None)
    sounds.sort(key=lambda s: s[0])
    return anims, sounds, end


def _is_reveal(prev: SlotVis, target: SlotVis) -> bool:
    """A face-down card that simply turns over."""
    return prev.present and not prev.up and target.present and target.up


class CardRow:
    def __init__(self) -> None:
        self.vis: list[SlotVis] = [EMPTY] * SLOTS
        self.highlight: int | None = None
        self._anims: list[_Anim | None] = [None] * SLOTS
        self._sounds: list[tuple[int, Sfx]] = []
        self._end = 0
        self._busy = False
        self._targets: tuple[SlotVis, ...] = tuple(self.vis)
        self._timing = NORMAL
        self._pending_highlight: int | None = None

    @property
    def busy(self) -> bool:
        return self._busy

    @property
    def has_cards(self) -> bool:
        return any(v.present for v in self.vis)

    def start(
        self,
        targets: tuple[SlotVis, ...],
        highlight: int | None,
        frame: int,
        *,
        fast: bool = False,
    ) -> None:
        """Begin animating towards ``targets`` (finishes any running animation first)."""
        self.finish()
        self._timing = FAST if fast else NORMAL
        self._targets = targets
        self._anims, self._sounds, self._end = plan(self.vis, targets, frame, self._timing)
        self._pending_highlight = highlight
        self.highlight = None
        self._busy = any(a is not None for a in self._anims)
        if not self._busy:
            self.vis = list(targets)
            self.highlight = highlight

    def finish(self) -> None:
        """Jump to the settled state."""
        if self._busy or self._anims != [None] * SLOTS:
            self.vis = list(self._targets)
            self.highlight = self._pending_highlight
        self._anims = [None] * SLOTS
        self._sounds = []
        self._busy = False

    def update(self, frame: int, play: Callable[[Sfx], None]) -> None:
        while self._sounds and self._sounds[0][0] <= frame:
            play(self._sounds.pop(0)[1])
        if self._busy and frame >= self._end:
            self.finish()

    def draw(self, frame: int, x0: int, y: int) -> None:
        for i in range(SLOTS):
            x = x0 + i * (CARD_W + CARD_GAP)
            anim = self._anims[i]
            if anim is None:
                self._draw_vis(x, y, self.vis[i], self.highlight == i)
                continue
            if frame < anim.appear_at:
                self._draw_vis(x, y, anim.prev, False)
            elif not anim.target.present:
                draw_card_slot(x, y)
            elif anim.flip_at is None or frame < anim.flip_at:
                draw_card(x, y, None, face_up=False)
            else:
                t = (frame - anim.flip_at) / self._timing.flip
                draw_card_flip(x, y, anim.target.card, t)

    @staticmethod
    def _draw_vis(x: int, y: int, vis: SlotVis, highlight: bool) -> None:
        if not vis.present:
            draw_card_slot(x, y, pal.FELT_LIGHT)
            return
        draw_card(x, y, vis.card, face_up=vis.up, highlight=False)
        if highlight:
            draw_highlight(x, y)
