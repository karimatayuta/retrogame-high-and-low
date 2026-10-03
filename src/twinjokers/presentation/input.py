"""Input mapping: keyboard keys and on-screen buttons -> :class:`Command`.

The tables below are the single place that defines the controls (spec: ボタン)::

    1-5  HOLD 1-5            B  1 BET            Space/Enter  DEAL / NEXT / DOUBLE
    C    COLLECT             M  MAX BET          Up / Down    HIGH / LOW (HIGH & LOW)
    A    add medals          S  scanlines        N / F1       mute        Esc  quit

The on-screen strip ([BET][MAX][DEAL][1]..[5][COLLECT][+MEDAL]) and the HOLD labels
under the cards are clickable / tappable and map to the same commands.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import pyxel

from twinjokers.presentation import layout


class Action(StrEnum):
    HOLD = "HOLD"  # arg = 1..5
    BET = "BET"
    MAX_BET = "MAX_BET"
    DEAL = "DEAL"  # deal / advance a free game / standard double, by phase
    COLLECT = "COLLECT"
    HIGH = "HIGH"
    LOW = "LOW"
    ADD_MEDALS = "ADD_MEDALS"
    SCANLINES = "SCANLINES"
    MUTE = "MUTE"
    QUIT = "QUIT"


@dataclass(frozen=True, slots=True)
class Command:
    action: Action
    arg: int = 0


# actions that only touch the presentation (allowed any time, never locked)
UI_ACTIONS: frozenset[Action] = frozenset({Action.SCANLINES, Action.MUTE, Action.QUIT})

KEY_BINDINGS: tuple[tuple[int, Command], ...] = (
    (pyxel.KEY_1, Command(Action.HOLD, 1)),
    (pyxel.KEY_2, Command(Action.HOLD, 2)),
    (pyxel.KEY_3, Command(Action.HOLD, 3)),
    (pyxel.KEY_4, Command(Action.HOLD, 4)),
    (pyxel.KEY_5, Command(Action.HOLD, 5)),
    (pyxel.KEY_B, Command(Action.BET)),
    (pyxel.KEY_M, Command(Action.MAX_BET)),
    (pyxel.KEY_SPACE, Command(Action.DEAL)),
    (pyxel.KEY_RETURN, Command(Action.DEAL)),
    (pyxel.KEY_C, Command(Action.COLLECT)),
    (pyxel.KEY_UP, Command(Action.HIGH)),
    (pyxel.KEY_DOWN, Command(Action.LOW)),
    (pyxel.KEY_A, Command(Action.ADD_MEDALS)),
    (pyxel.KEY_S, Command(Action.SCANLINES)),
    (pyxel.KEY_N, Command(Action.MUTE)),
    (pyxel.KEY_F1, Command(Action.MUTE)),
    (pyxel.KEY_ESCAPE, Command(Action.QUIT)),
)


@dataclass(frozen=True, slots=True)
class Button:
    x: int
    y: int
    w: int
    h: int
    label: str
    command: Command

    def contains(self, px: float, py: float) -> bool:
        return self.x <= px < self.x + self.w and self.y <= py < self.y + self.h


def _build_strip() -> tuple[Button, ...]:
    spec: list[tuple[str, int, Command]] = [
        ("BET", 28, Command(Action.BET)),
        ("MAX", 28, Command(Action.MAX_BET)),
        ("DEAL", 36, Command(Action.DEAL)),
        *[(str(n), 18, Command(Action.HOLD, n)) for n in range(1, 6)],
        ("COLLECT", 44, Command(Action.COLLECT)),
        ("+MEDAL", 40, Command(Action.ADD_MEDALS)),
    ]
    gap = 3
    total = sum(w for _, w, _ in spec) + gap * (len(spec) - 1)
    x = (layout.W - total) // 2
    out: list[Button] = []
    for label, w, cmd in spec:
        out.append(Button(x, layout.STRIP_Y, w, layout.STRIP_H, label, cmd))
        x += w + gap
    return tuple(out)


STRIP_BUTTONS: tuple[Button, ...] = _build_strip()

# the HOLD labels under the cards are also HOLD buttons
HOLD_BUTTONS: tuple[Button, ...] = tuple(
    Button(*layout.hold_rect(i), "", Command(Action.HOLD, i + 1)) for i in range(5)
)

ALL_BUTTONS: tuple[Button, ...] = STRIP_BUTTONS + HOLD_BUTTONS


def hit_test(px: float, py: float) -> Button | None:
    for button in ALL_BUTTONS:
        if button.contains(px, py):
            return button
    return None


def poll() -> list[Command]:
    """Commands requested this frame (keys that went down, plus a mouse/touch press)."""
    commands = [cmd for key, cmd in KEY_BINDINGS if pyxel.btnp(key)]
    if pyxel.btnp(pyxel.MOUSE_BUTTON_LEFT):
        button = hit_test(pyxel.mouse_x, pyxel.mouse_y)
        if button is not None:
            commands.append(button.command)
    return commands
