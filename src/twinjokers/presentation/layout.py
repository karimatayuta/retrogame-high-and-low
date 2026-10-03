"""Screen geometry shared by drawing and mouse hit-testing (320x240 logical pixels)."""

from __future__ import annotations

from typing import Final

from twinjokers.presentation.card_sprite import CARD_GAP, CARD_H, CARD_W

W: Final = 320
H: Final = 240

# five card slots, centred
CARDS_X0: Final = (W - (5 * CARD_W + 4 * CARD_GAP)) // 2
CARDS_Y: Final = 94

# HOLD labels right under the cards (also clickable)
HOLD_Y: Final = CARDS_Y + CARD_H + 5
HOLD_H: Final = 11

# bottom button strip
STRIP_Y: Final = 221
STRIP_H: Final = 14


def slot_x(i: int) -> int:
    return CARDS_X0 + i * (CARD_W + CARD_GAP)


def hold_rect(i: int) -> tuple[int, int, int, int]:
    return (slot_x(i), HOLD_Y, CARD_W, HOLD_H)
