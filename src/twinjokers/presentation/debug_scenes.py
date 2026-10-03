"""Debug scenes for visual QA: scripted cards + scripted button presses + screenshots.

Enabled only via ``TWINJOKERS_DEBUG_SCENE=<name>`` (see ``__main__``); never used in normal play.
Shots are named ``<scene>_<shot>.png`` in ``TWINJOKERS_SHOT_DIR`` (default ``.qa``).
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Any

from twinjokers.application.view import SessionPhase as P
from twinjokers.domain.cards import Card, cards
from twinjokers.presentation.autoplay import (
    ScriptDriver,
    Step,
    act,
    idle,
    shot,
    until,
    wait,
)
from twinjokers.presentation.input import Action as A


class ScriptedRandomizer(random.Random):
    """``random.Random`` whose first shuffles / choices follow a script (QA only)."""

    def __init__(
        self,
        shuffles: Sequence[str] = (),
        choices: Sequence[str] = (),
        win_always: bool = False,
        seed: int = 7,
    ) -> None:
        super().__init__(seed)
        self._shuffles = [cards(s) for s in shuffles]
        self._choices = [cards(c)[0] for c in choices]
        self._win_always = win_always

    def shuffle(self, x: Any) -> None:
        super().shuffle(x)
        if self._shuffles:
            top = self._shuffles.pop(0)
            rest = [c for c in x if c not in top]
            x[:] = [*top, *rest]

    def choice(self, seq: Any) -> Any:
        if self._choices:
            wanted: Card = self._choices.pop(0)
            if wanted in seq:
                return wanted
        return super().choice(seq)

    def random(self) -> float:
        return 0.0 if self._win_always else super().random()


def _rep(step: Step, n: int) -> list[Step]:
    return [step] * n


def _scene_betting() -> tuple[ScriptedRandomizer, list[Step]]:
    return ScriptedRandomizer(), [
        wait(20),
        shot("idle"),
        wait(50),
        act(A.BET),
        act(A.BET),
        act(A.BET),
        wait(10),
        shot("bet3"),
    ]


def _scene_win() -> tuple[ScriptedRandomizer, list[Step]]:
    # max bet, two pair; then the double down menu; toggle half double
    rng = ScriptedRandomizer(["7S 7H 3D 3C 9S"])
    return rng, [
        act(A.MAX_BET),
        wait(20),
        shot("deal_start"),
        wait(34),
        shot("dealing"),
        wait(30),
        shot("win_dealt"),
        idle(),
        until(P.DOUBLE_SELECT),
        wait(30),
        shot("double_select"),
        act(A.HOLD, 1),
        wait(8),
        shot("half_double"),
    ]


def _scene_standard() -> tuple[ScriptedRandomizer, list[Step]]:
    rng = ScriptedRandomizer(["7S 7H 3D 3C 9S", "9H 4S 5D KC JKR"])
    return rng, [
        act(A.MAX_BET),
        idle(),
        act(A.DEAL),
        idle(),
        wait(10),
        shot("pick"),
        act(A.HOLD, 5),
        wait(40),
        shot("flip"),
        idle(),
        wait(10),
        shot("result"),
    ]


def _scene_redblack() -> tuple[ScriptedRandomizer, list[Step]]:
    rng = ScriptedRandomizer(["7S 7H 3D 3C 9S", "9S 4S 5S KS 3S"])
    return rng, [
        act(A.MAX_BET),
        idle(),
        act(A.HOLD, 4),
        idle(),
        wait(10),
        shot("pick"),
        act(A.HOLD, 3),
        idle(),
        wait(20),
        shot("flush_win"),
    ]


def _scene_highlow() -> tuple[ScriptedRandomizer, list[Step]]:
    rng = ScriptedRandomizer(
        ["7S 7H 3D 3C 9S", "7C 2D 3D 4D 5D"],
        choices=["2H", "7D", "2C", "KS"],
        win_always=True,
    )
    return rng, [
        act(A.MAX_BET),
        idle(),
        act(A.HOLD, 3),
        idle(),
        wait(10),
        shot("start"),
        act(A.LOW),
        idle(),
        wait(10),
        shot("round1"),
        act(A.HIGH),
        idle(),
        act(A.LOW),
        idle(),
        wait(10),
        shot("round3"),
        act(A.HIGH),
        wait(50),
        shot("bonus_banner"),
        idle(),
        wait(60),
        shot("after"),
    ]


def _scene_joker() -> tuple[ScriptedRandomizer, list[Step]]:
    rng = ScriptedRandomizer(["7S 7H 3D 3C 9S", "7C 2D 3D 4D 5D"], choices=["JKR"], win_always=True)
    return rng, [
        act(A.MAX_BET),
        idle(),
        act(A.HOLD, 3),
        idle(),
        act(A.HIGH),
        wait(50),
        shot("banner"),
        idle(),
        wait(30),
        shot("after"),
    ]


def _scene_freegame() -> tuple[ScriptedRandomizer, list[Step]]:
    rng = ScriptedRandomizer(["KS QS JC 2D 3H"])
    return rng, [
        act(A.MAX_BET),
        wait(110),
        shot("award"),
        wait(150),
        shot("running"),
        wait(300),
        shot("running2"),
        until(P.DOUBLE_SELECT),
        wait(120),
        shot("end"),
    ]


def _scene_jackpot() -> tuple[ScriptedRandomizer, list[Step]]:
    rng = ScriptedRandomizer(["10S JS QS KS AS"])
    return rng, [
        act(A.MAX_BET),
        wait(110),
        shot("jackpot"),
        idle(),
        wait(30),
        shot("after"),
    ]


SCENES = {
    "betting": _scene_betting,
    "win": _scene_win,
    "standard": _scene_standard,
    "redblack": _scene_redblack,
    "highlow": _scene_highlow,
    "joker": _scene_joker,
    "freegame": _scene_freegame,
    "jackpot": _scene_jackpot,
}


def build_scene(name: str) -> tuple[ScriptedRandomizer, ScriptDriver]:
    try:
        factory = SCENES[name]
    except KeyError:
        raise SystemExit(f"unknown debug scene {name!r}; choose from {sorted(SCENES)}") from None
    rng, steps = factory()
    return rng, ScriptDriver([*steps, Step("quit")])
