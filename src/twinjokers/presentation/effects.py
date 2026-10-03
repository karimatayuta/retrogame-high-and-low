"""Small retro effects: scanlines, screen flash, coin count-up, marquee lights.

``count_up_value``, ``marquee_lit`` and ``marquee_positions`` are pure functions
(unit tested); the rest only draw.
"""

from __future__ import annotations

from dataclasses import dataclass

import pyxel

from twinjokers.presentation import palette

# ---------------------------------------------------------------- count-up


def count_up_value(start: int, end: int, frame: int, total_frames: int) -> int:
    """Displayed credit value ``frame`` frames after a count-up began.

    Linear from ``start`` to ``end`` over ``total_frames`` (works for counting down
    too). Always returns ``start`` for frame <= 0 and exactly ``end`` once
    ``frame >= total_frames`` (or when ``total_frames <= 0``); never overshoots.
    """
    if total_frames <= 0 or frame >= total_frames:
        return end
    if frame <= 0:
        return start
    delta = end - start
    step = (abs(delta) * frame) // total_frames
    return start + step if delta >= 0 else start - step


def count_up_frames(start: int, end: int, per_frame: int = 1, max_frames: int = 180) -> int:
    """Suggested duration: ``per_frame`` coins per frame, clamped to ``max_frames`` (>= 1)."""
    steps = abs(end - start) // max(1, per_frame)
    return max(1, min(max_frames, steps))


@dataclass
class CoinCounter:
    """Stateful wrapper around :func:`count_up_value`. Call ``tick()`` once per frame."""

    value: int = 0
    _start: int = 0
    _end: int = 0
    _total: int = 0
    _frame: int = 0

    def start(self, start: int, end: int, frames: int) -> None:
        self._start, self._end, self._total, self._frame = start, end, frames, 0
        self.value = count_up_value(start, end, 0, frames)

    def set(self, value: int) -> None:
        """Jump immediately (no animation)."""
        self.start(value, value, 0)

    @property
    def done(self) -> bool:
        return self._frame >= self._total

    def tick(self) -> bool:
        """Advance one frame. Returns True if the displayed value changed."""
        if self.done:
            return False
        self._frame += 1
        new = count_up_value(self._start, self._end, self._frame, self._total)
        changed = new != self.value
        self.value = new
        return changed

    def finish(self) -> None:
        self._frame = self._total
        self.value = self._end


# ---------------------------------------------------------------- scanlines


class ScanlineOverlay:
    """Every-other-line darkening (CRT look). Draw it last; toggle with ``toggle()``."""

    def __init__(self, enabled: bool = True, strength: float = 0.28) -> None:
        self.enabled = enabled
        self.strength = strength

    def toggle(self) -> bool:
        self.enabled = not self.enabled
        return self.enabled

    def draw(self) -> None:
        if not self.enabled:
            return
        pyxel.dither(self.strength)
        for y in range(1, pyxel.height, 2):
            pyxel.rect(0, y, pyxel.width, 1, palette.BLACK)
        pyxel.dither(1.0)


# ---------------------------------------------------------------- screen flash


class ScreenFlash:
    """Full-screen colour flash that fades out (``trigger()``, then ``update()``/``draw()``)."""

    def __init__(self) -> None:
        self._color = palette.CARD_FACE
        self._frames = 0
        self._left = 0

    def trigger(self, color: int = palette.CARD_FACE, frames: int = 8) -> None:
        self._color, self._frames, self._left = color, max(1, frames), max(1, frames)

    @property
    def active(self) -> bool:
        return self._left > 0

    def update(self) -> None:
        if self._left > 0:
            self._left -= 1

    def draw(self) -> None:
        if self._left <= 0:
            return
        pyxel.dither(self._left / self._frames)
        pyxel.rect(0, 0, pyxel.width, pyxel.height, self._color)
        pyxel.dither(1.0)


# ---------------------------------------------------------------- marquee lights


def marquee_positions(w: int, h: int, spacing: int = 8) -> list[tuple[int, int]]:
    """Bulb positions (relative to the box origin) clockwise around a ``w`` x ``h`` rectangle."""
    spacing = max(1, spacing)
    pts: list[tuple[int, int]] = []
    pts += [(x, 0) for x in range(0, w, spacing)]
    pts += [(w - 1, y) for y in range(0, h, spacing)]
    pts += [(w - 1 - x, h - 1) for x in range(0, w, spacing)]
    pts += [(0, h - 1 - y) for y in range(0, h, spacing)]
    return list(dict.fromkeys(pts))


def marquee_lit(index: int, frame: int, speed: int = 4, gap: int = 3) -> bool:
    """Chase pattern: every ``gap``-th bulb is lit, the pattern crawls every ``speed`` frames."""
    return (index - frame // max(1, speed)) % max(1, gap) == 0


def draw_marquee(
    x: int,
    y: int,
    w: int,
    h: int,
    frame: int,
    spacing: int = 8,
    speed: int = 4,
    lit: int = palette.GOLD,
    unlit: int = palette.ORANGE,
    off: int = palette.GREY_DARK,
    blinking: bool = True,
) -> None:
    """Draw a chasing-light border. With ``blinking=False`` all bulbs are static ``unlit``."""
    for i, (px, py) in enumerate(marquee_positions(w, h, spacing)):
        if blinking and marquee_lit(i, frame, speed):
            pyxel.rect(x + px - 1, y + py - 1, 3, 3, lit)
        else:
            pyxel.rect(x + px, y + py, 1, 1, unlit if not blinking else off)
