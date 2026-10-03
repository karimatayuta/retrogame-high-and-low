"""Text helpers on top of Pyxel's built-in 4x6 font (ASCII only).

The built-in font cannot render suit symbols such as the spade character; draw
suits with ``card_sprite.draw_suit`` instead.  Scaled ("big") text is produced by
rasterising the built-in font into a tiny off-screen ``Image`` once per string,
caching the pixel runs and re-plotting them as ``scale``-sized rectangles.
"""

from __future__ import annotations

from functools import lru_cache

import pyxel

from twinjokers.presentation import palette

CHAR_W = pyxel.FONT_WIDTH  # 4
CHAR_H = pyxel.FONT_HEIGHT  # 6


def text_width(s: str, scale: int = 1) -> int:
    """Visible width in pixels (the trailing 1px letter gap is not counted)."""
    if not s:
        return 0
    return (len(s) * CHAR_W - 1) * scale


def blink(frame: int, period: int = 30, duty: float = 0.5) -> bool:
    """True for the first ``duty`` fraction of every ``period`` frames."""
    if period <= 0:
        return True
    return (frame % period) < period * duty


# The built-in "&" is easily mistaken for "8" at this size, so it is drawn by hand (3x6 px).
_AMP_PIXELS = ((1, 0), (0, 1), (2, 1), (1, 2), (0, 3), (2, 3), (0, 4), (2, 4), (1, 5), (2, 5))


def _text(x: float, y: float, s: str, col: int) -> None:
    if "&" not in s:
        pyxel.text(x, y, s, col)
        return
    for i, ch in enumerate(s):
        cx = x + i * CHAR_W
        if ch == "&":
            for px, py in _AMP_PIXELS:
                pyxel.pset(cx + px, y + py, col)
        elif ch != " ":
            pyxel.text(cx, y, ch, col)


def draw_text(x: float, y: float, s: str, col: int) -> None:
    _text(x, y, s, col)


def draw_text_right(x_right: float, y: float, s: str, col: int) -> None:
    """Right-align so the last visible pixel is at ``x_right - 1``."""
    _text(x_right - text_width(s), y, s, col)


def draw_text_center(x_center: float, y: float, s: str, col: int) -> None:
    _text(x_center - text_width(s) / 2, y, s, col)


def draw_shadow_text(
    x: float, y: float, s: str, col: int, shadow: int = palette.BLACK, offset: int = 1
) -> None:
    _text(x + offset, y + offset, s, shadow)
    _text(x, y, s, col)


def draw_shadow_text_center(
    x_center: float, y: float, s: str, col: int, shadow: int = palette.BLACK
) -> None:
    draw_shadow_text(x_center - text_width(s) / 2, y, s, col, shadow)


@lru_cache(maxsize=256)
def _glyph_runs(s: str) -> tuple[tuple[int, int, int], ...]:
    """Horizontal pixel runs ``(x, y, length)`` of ``s`` rendered in the built-in font."""
    width = max(1, len(s) * CHAR_W)
    img = pyxel.Image(width, CHAR_H)
    img.cls(0)
    img.text(0, 0, s, 1)
    for i, ch in enumerate(s):  # hand-drawn "&" (see _AMP_PIXELS)
        if ch == "&":
            for px in range(CHAR_W):
                for py in range(CHAR_H):
                    img.pset(i * CHAR_W + px, py, 0)
            for px, py in _AMP_PIXELS:
                img.pset(i * CHAR_W + px, py, 1)
    runs: list[tuple[int, int, int]] = []
    for y in range(CHAR_H):
        x = 0
        while x < width:
            if img.pget(x, y) == 1:
                start = x
                while x < width and img.pget(x, y) == 1:
                    x += 1
                runs.append((start, y, x - start))
            else:
                x += 1
    return tuple(runs)


def draw_big_text(
    x: float,
    y: float,
    s: str,
    col: int,
    scale: int = 2,
    shadow: int | None = None,
    outline: int | None = None,
) -> None:
    """Scaled pixel text. ``shadow`` adds a drop shadow, ``outline`` a 1px (x scale) outline."""
    runs = _glyph_runs(s)
    if outline is not None:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            _plot(runs, x + dx * scale, y + dy * scale, scale, outline)
    if shadow is not None:
        _plot(runs, x + scale, y + scale, scale, shadow)
    _plot(runs, x, y, scale, col)


def _plot(runs: tuple[tuple[int, int, int], ...], x: float, y: float, scale: int, col: int) -> None:
    for rx, ry, length in runs:
        pyxel.rect(x + rx * scale, y + ry * scale, length * scale, scale, col)


def draw_big_text_center(
    x_center: float,
    y: float,
    s: str,
    col: int,
    scale: int = 2,
    shadow: int | None = None,
    outline: int | None = None,
) -> None:
    draw_big_text(x_center - text_width(s, scale) / 2, y, s, col, scale, shadow, outline)


def draw_big_text_right(
    x_right: float,
    y: float,
    s: str,
    col: int,
    scale: int = 2,
    shadow: int | None = None,
) -> None:
    draw_big_text(x_right - text_width(s, scale), y, s, col, scale, shadow)
