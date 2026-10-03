"""Playing cards drawn entirely in code (no image files).

Every distinct card face / back is rendered once into a small off-screen
``pyxel.Image`` (lazily, on first use, so ``pyxel.init`` must have run) and then
blitted. The images use palette index ``BG`` as the transparent colour (rounded
corners), so card art never uses ``BG``.

``card is None`` is treated as "unknown card" and draws the card back.
"""

from __future__ import annotations

from typing import Any, Final

import pyxel

from twinjokers.domain.cards import Card, Rank, Suit
from twinjokers.presentation import palette as pal

CARD_W: Final = 44
CARD_H: Final = 62
CARD_GAP: Final = 8  # suggested horizontal gap between cards

# ------------------------------------------------------------------ pixel glyphs

SUIT_GLYPHS: Final[dict[Suit, tuple[str, ...]]] = {
    Suit.SPADES: (
        "...##...",
        "..####..",
        ".######.",
        "########",
        "########",
        "########",
        "...##...",
        "..####..",
    ),
    Suit.HEARTS: (
        ".##..##.",
        "########",
        "########",
        "########",
        ".######.",
        "..####..",
        "...##...",
        "........",
    ),
    Suit.DIAMONDS: (
        "...##...",
        "..####..",
        ".######.",
        "########",
        ".######.",
        "..####..",
        "...##...",
        "........",
    ),
    Suit.CLUBS: (
        "..####..",
        "..####..",
        "...##...",
        "##.##.##",
        "########",
        "########",
        "...##...",
        "..####..",
    ),
}

PIP_GLYPHS: Final[dict[Suit, tuple[str, ...]]] = {
    Suit.SPADES: (
        "...#...",
        "..###..",
        ".#####.",
        "#######",
        "#######",
        "..###..",
        "...#...",
    ),
    Suit.HEARTS: (
        ".##.##.",
        "#######",
        "#######",
        "#######",
        ".#####.",
        "..###..",
        "...#...",
    ),
    Suit.DIAMONDS: (
        "...#...",
        "..###..",
        ".#####.",
        "#######",
        ".#####.",
        "..###..",
        "...#...",
    ),
    Suit.CLUBS: (
        "..###..",
        "..###..",
        "#..#..#",
        "#######",
        "#######",
        "..###..",
        "...#...",
    ),
}

SMALL_GLYPHS: Final[dict[Suit, tuple[str, ...]]] = {
    Suit.SPADES: ("..#..", ".###.", "#####", "#####", "..#.."),
    Suit.HEARTS: (".#.#.", "#####", "#####", ".###.", "..#.."),
    Suit.DIAMONDS: ("..#..", ".###.", "#####", ".###.", "..#.."),
    Suit.CLUBS: (".###.", ".###.", "#####", "#####", "..#.."),
}

# Multi-colour sprites: g=gold o=orange k=black r=red b=blue w=card face
_CROWN_K: Final = (
    "k...k...k...k",
    "kg..kg.gk..gk",
    "kgg.kggkk.ggk",
    "kgggkgggkgggk",
    "kggggggggggok",
    "korogorogorok",
    "kkkkkkkkkkkkk",
)
_CROWN_Q: Final = (
    ".k.k.k.k.k.k.",
    "kgkgkgkgkgkgk",
    "kggggggggggok",
    "kgrggbgggrggk",
    "kggggggggggok",
    "kkkkkkkkkkkkk",
)
_CAP_J: Final = (
    "......kkkk...",
    ".....kbbbbk..",
    "....kbbbbbbk.",
    "...kbbbbbbbbk",
    "..kbbbbbbbbbk",
    ".kooooooooook",
    "kkkkkkkkkkkkk",
)
_SPRITE_COLORS: Final = {
    "g": pal.GOLD,
    "o": pal.ORANGE,
    "k": pal.BLACK,
    "r": pal.CARD_RED,
    "b": pal.BLUE,
    "w": pal.CARD_FACE,
}


def _blit_glyph(
    g: Any,
    x: int,
    y: int,
    rows: tuple[str, ...],
    col: int | None = None,
    *,
    scale: int = 1,
    flip_v: bool = False,
) -> None:
    """Draw a '#'-style (single colour ``col``) or multi-colour (letters) sprite."""
    ordered = rows[::-1] if flip_v else rows
    for j, row in enumerate(ordered):
        i = 0
        while i < len(row):
            ch = row[i]
            c = col if ch == "#" else _SPRITE_COLORS.get(ch)
            if ch == "." or c is None:
                i += 1
                continue
            start = i
            while i < len(row) and row[i] == ch:
                i += 1
            g.rect(x + start * scale, y + j * scale, (i - start) * scale, scale, c)


def draw_suit(x: int, y: int, suit: Suit, size: int = 8, *, flip_v: bool = False) -> None:
    """Draw an 8x8 pixel suit glyph on the screen (``size`` 16 = doubled)."""
    _draw_suit_on(pyxel, x, y, suit, size // 8, flip_v)


def _suit_color(suit: Suit) -> int:
    return pal.CARD_RED if suit.color.value == "RED" else pal.CARD_BLACK


def _draw_suit_on(g: Any, x: int, y: int, suit: Suit, scale: int = 1, flip_v: bool = False) -> None:
    _blit_glyph(g, x, y, SUIT_GLYPHS[suit], _suit_color(suit), scale=scale, flip_v=flip_v)


# ------------------------------------------------------------------ rendering

_PIP_L: Final = 14
_PIP_C: Final = 22
_PIP_R: Final = 30
# pip centres (column x, row y) for each rank, in a 44x62 card
_SIDE3: Final = tuple((cx, cy) for cy in (17, 31, 45) for cx in (_PIP_L, _PIP_R))
_SIDE4: Final = tuple((cx, cy) for cy in (15, 26, 36, 47) for cx in (_PIP_L, _PIP_R))
_PIPS: Final[dict[int, tuple[tuple[int, int], ...]]] = {
    2: ((_PIP_C, 17), (_PIP_C, 45)),
    3: ((_PIP_C, 17), (_PIP_C, 31), (_PIP_C, 45)),
    4: ((_PIP_L, 17), (_PIP_R, 17), (_PIP_L, 45), (_PIP_R, 45)),
    5: ((_PIP_L, 17), (_PIP_R, 17), (_PIP_C, 31), (_PIP_L, 45), (_PIP_R, 45)),
    6: _SIDE3,
    7: (*_SIDE3, (_PIP_C, 24)),
    8: (*_SIDE3, (_PIP_C, 24), (_PIP_C, 38)),
    9: (*_SIDE4, (_PIP_C, 31)),
    10: (*_SIDE4, (_PIP_C, 21), (_PIP_C, 41)),
}


def _text_on(g: Any, x: int, y: int, s: str, col: int) -> None:
    g.text(x, y, s, col)


def _body(g: Any, face: int, edge: int) -> None:
    """Rounded card silhouette: 1px ``edge`` outline, ``face`` fill, BG corners."""
    w, h = CARD_W, CARD_H
    g.cls(pal.BG)
    g.rect(1, 0, w - 2, h, edge)
    g.rect(0, 1, w, h - 2, edge)
    g.rect(2, 1, w - 4, h - 2, face)
    g.rect(1, 2, w - 2, h - 4, face)


def _corner_index(g: Any, card: Card) -> None:
    assert card.rank is not None and card.suit is not None
    col = _suit_color(card.suit)
    label = card.rank.label
    small = SMALL_GLYPHS[card.suit]
    tx = 3 if len(label) == 1 else 2
    # top-left: rank over suit; bottom-right: suit over rank (like a rotated card)
    _text_on(g, tx, 3, label, col)
    _blit_glyph(g, 3, 10, small, col)
    _blit_glyph(g, CARD_W - 8, CARD_H - 15, small, col, flip_v=True)
    _text_on(g, CARD_W - 3 - len(label) * 4 + 1, CARD_H - 9, label, col)


def _face_card_art(g: Any, card: Card) -> None:
    assert card.rank is not None and card.suit is not None
    col = _suit_color(card.suit)
    # framed court panel
    g.rect(11, 11, 22, 40, pal.GOLD)
    g.rectb(11, 11, 22, 40, col)
    g.rectb(12, 12, 20, 38, pal.BLACK)
    g.rect(13, 13, 18, 36, pal.CARD_FACE)
    sprite = {Rank.KING: _CROWN_K, Rank.QUEEN: _CROWN_Q, Rank.JACK: _CAP_J}[card.rank]
    _blit_glyph(g, 16, 16, sprite)
    letter = card.rank.label
    _letter2x(g, 19, 27, letter, col)
    _draw_suit_on(g, 18, 39, card.suit)


def _letter2x(g: Any, x: int, y: int, ch: str, col: int) -> None:
    from twinjokers.presentation.text import _glyph_runs

    for rx, ry, length in _glyph_runs(ch):
        g.rect(x + rx * 2, y + ry * 2, length * 2, 2, col)


def _render_pips(g: Any, card: Card) -> None:
    assert card.rank is not None and card.suit is not None
    if card.rank == Rank.ACE:
        _draw_suit_on(g, 14, 23, card.suit, 2)
        return
    for cx, cy in _PIPS[card.rank.value]:
        _blit_glyph(
            g, cx - 3, cy - 3, PIP_GLYPHS[card.suit], _suit_color(card.suit), flip_v=cy > 31
        )


def _render_joker(g: Any, card: Card) -> None:
    accent = pal.CARD_RED if card.joker_id % 2 == 1 else pal.BLUE
    g.rectb(3, 3, CARD_W - 6, CARD_H - 6, accent)
    g.rect(5, 5, CARD_W - 10, 8, accent)
    g.text(CARD_W // 2 - 9, 6, "JOKER", pal.CARD_FACE)
    # hat: three points with gold bells
    g.tri(8, 26, 12, 16, 18, 26, accent)
    g.tri(17, 26, 22, 14, 27, 26, pal.BLACK)
    g.tri(26, 26, 32, 16, 36, 26, accent)
    for bx, by in ((12, 15), (22, 13), (32, 15)):
        g.rect(bx - 1, by - 1, 3, 3, pal.GOLD)
    g.rect(8, 25, 28, 3, pal.GOLD)
    g.rectb(8, 25, 28, 3, pal.BLACK)
    # face
    g.circ(22, 36, 9, pal.CARD_FACE)
    g.circb(22, 36, 9, pal.BLACK)
    g.rect(18, 33, 2, 2, pal.BLACK)
    g.rect(24, 33, 2, 2, pal.BLACK)
    g.rect(21, 36, 2, 2, pal.ORANGE)
    for sx, sy in ((18, 40), (19, 41), (20, 41), (21, 41), (22, 41), (23, 41), (24, 41), (25, 40)):
        g.pset(sx, sy, pal.CARD_RED)
    # collar
    for i in range(6):
        g.tri(10 + i * 4, 53, 12 + i * 4, 46, 14 + i * 4, 53, accent if i % 2 == 0 else pal.GOLD)
    g.rect(10, 53, 24, 1, pal.BLACK)
    # star pips in the corners
    g.text(5, 15, "*", pal.GOLD)
    g.text(CARD_W - 9, CARD_H - 21, "*", pal.GOLD)


def _render_face(card: Card) -> Any:
    img = pyxel.Image(CARD_W, CARD_H)
    _body(img, pal.CARD_FACE, pal.BLACK)
    if card.rank is None or card.suit is None:
        _render_joker(img, card)
        return img
    _corner_index(img, card)
    if card.rank.is_face:
        _face_card_art(img, card)
    else:
        _render_pips(img, card)
    return img


def _render_back() -> Any:
    img = pyxel.Image(CARD_W, CARD_H)
    _body(img, pal.CARD_FACE, pal.BLACK)  # white margin
    img.rect(3, 3, CARD_W - 6, CARD_H - 6, pal.NAVY)
    # diamond lattice
    for y in range(4, CARD_H - 4):
        for x in range(4, CARD_W - 4):
            if (x + y) % 8 == 0 or (x - y) % 8 == 0:
                img.pset(x, y, pal.BLUE)
    img.rectb(3, 3, CARD_W - 6, CARD_H - 6, pal.BLUE)
    img.rectb(5, 5, CARD_W - 10, CARD_H - 10, pal.CYAN)
    # central gold diamond medallion
    cx, cy = CARD_W // 2, CARD_H // 2
    img.tri(cx, cy - 12, cx - 9, cy, cx + 9, cy, pal.GOLD)
    img.tri(cx, cy + 12, cx - 9, cy, cx + 9, cy, pal.GOLD)
    img.tri(cx, cy - 7, cx - 5, cy, cx + 5, cy, pal.NAVY)
    img.tri(cx, cy + 7, cx - 5, cy, cx + 5, cy, pal.NAVY)
    img.pset(cx, cy, pal.GOLD)
    return img


_cache: dict[str, Any] = {}


def _face_image(card: Card) -> Any:
    key = str(card) if not card.is_joker else f"JKR{card.joker_id % 2}"
    img = _cache.get(key)
    if img is None:
        img = _cache[key] = _render_face(card)
    return img


def _back_image() -> Any:
    img = _cache.get("back")
    if img is None:
        img = _cache["back"] = _render_back()
    return img


def clear_cache() -> None:
    """Drop cached card images (e.g. after ``pyxel.reset``)."""
    _cache.clear()


# ------------------------------------------------------------------ public API


def draw_card(
    x: int,
    y: int,
    card: Card | None,
    face_up: bool = True,
    highlight: bool = False,
    shadow: bool = False,
) -> None:
    """Draw a card with its top-left at ``(x, y)``. ``None`` or ``face_up=False`` -> back."""
    if shadow:
        pyxel.rect(x + 2, y + 3, CARD_W, CARD_H, pal.BG)
    img = _face_image(card) if (card is not None and face_up) else _back_image()
    pyxel.blt(x, y, img, 0, 0, CARD_W, CARD_H, pal.BG)
    if highlight:
        draw_highlight(x, y)


def draw_card_back(x: int, y: int) -> None:
    draw_card(x, y, None, face_up=False)


def draw_joker(x: int, y: int, joker_id: int = 1, highlight: bool = False) -> None:
    from twinjokers.domain.cards import joker

    draw_card(x, y, joker(joker_id), True, highlight)


def draw_highlight(x: int, y: int, col: int = pal.GOLD) -> None:
    """Two-pixel outline just outside the card (needs 2px free around it)."""
    pyxel.rectb(x - 2, y - 2, CARD_W + 4, CARD_H + 4, col)
    pyxel.rectb(x - 1, y - 1, CARD_W + 2, CARD_H + 2, col)


def draw_card_slot(x: int, y: int, col: int = pal.FELT_LIGHT) -> None:
    """Empty card position marker (dashed outline)."""
    for i in range(0, CARD_W, 4):
        pyxel.rect(x + i, y, 2, 1, col)
        pyxel.rect(x + i, y + CARD_H - 1, 2, 1, col)
    for j in range(0, CARD_H, 4):
        pyxel.rect(x, y + j, 1, 2, col)
        pyxel.rect(x + CARD_W - 1, y + j, 1, 2, col)


def draw_card_flip(x: int, y: int, card: Card | None, t: float, highlight: bool = False) -> None:
    """Flip animation, ``t`` 0..1: back squashes to an edge (0..0.5), face expands (0.5..1)."""
    t = min(1.0, max(0.0, t))
    if t <= 0.0:
        draw_card(x, y, card, face_up=False)
        return
    if t >= 1.0:
        draw_card(x, y, card, face_up=True, highlight=highlight)
        return
    showing_face = t >= 0.5 and card is not None
    img = _face_image(card) if showing_face and card is not None else _back_image()
    frac = abs(1.0 - 2.0 * t)  # 1 -> 0 -> 1
    nw = max(2, round(CARD_W * frac))
    off = (CARD_W - nw) // 2
    for dx in range(nw):
        sx = min(CARD_W - 1, int((dx + 0.5) * CARD_W / nw))
        pyxel.blt(x + off + dx, y, img, sx, 0, 1, CARD_H, pal.BG)
