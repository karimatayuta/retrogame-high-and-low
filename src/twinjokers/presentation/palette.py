"""Custom 16-colour palette for the green arcade cabinet look.

Callers must use the named constants (palette *indices*), never raw numbers.
Call :func:`apply_palette` once after ``pyxel.init``.
"""

from __future__ import annotations

from typing import Final

import pyxel

# index -> 0xRRGGBB. Order matters: BG is index 0 and is also the "transparent"
# colour (colkey) of the cached card images, so never draw card art with BG.
PALETTE_RGB: Final[tuple[int, ...]] = (
    0x04140A,  # 0  BG           near-black green (screen background)
    0x0A3D1F,  # 1  FELT_DARK    deep felt green
    0x136B35,  # 2  FELT         felt green
    0x1F9B4D,  # 3  FELT_LIGHT   lit felt / panel highlight
    0x4CFF7A,  # 4  TEXT         bright phosphor green
    0xF6F2DC,  # 5  CARD_FACE    warm white (cards, white text)
    0x000000,  # 6  BLACK        pure black (black suits, outlines)
    0xD81E1E,  # 7  CARD_RED     red suits
    0xFFD21F,  # 8  GOLD         WIN / progressive / highlight
    0xFF8A00,  # 9  ORANGE       warm accent, flames, warnings
    0x2EE6E6,  # 10 CYAN         UI accent
    0x2A5BD7,  # 11 BLUE         UI accent, card back
    0x10205A,  # 12 NAVY         card back base, UI panels
    0xB8C0B8,  # 13 GREY_LIGHT
    0x6A746C,  # 14 GREY
    0x2C332E,  # 15 GREY_DARK    shadows / disabled
)

BG: Final = 0
FELT_DARK: Final = 1
FELT: Final = 2
FELT_LIGHT: Final = 3
TEXT: Final = 4
CARD_FACE: Final = 5
WHITE: Final = CARD_FACE
BLACK: Final = 6
CARD_BLACK: Final = BLACK
CARD_RED: Final = 7
GOLD: Final = 8
ORANGE: Final = 9
CYAN: Final = 10
BLUE: Final = 11
NAVY: Final = 12
CARD_BACK: Final = BLUE
GREY_LIGHT: Final = 13
GREY: Final = 14
GREY_DARK: Final = 15

NUM_COLORS: Final = len(PALETTE_RGB)


def apply_palette() -> None:
    """Install the palette into ``pyxel.colors`` (call once after ``pyxel.init``)."""
    pyxel.colors[:] = list(PALETTE_RGB)
