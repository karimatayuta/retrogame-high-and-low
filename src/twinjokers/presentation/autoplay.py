"""Scripted "players" that press buttons for smoke tests, QA screenshots and demos.

A driver is polled once per frame by the app and returns the commands to press. It goes
through exactly the same path as the keyboard, so animation locks are exercised too.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Protocol

from twinjokers.application.view import SessionPhase, SessionView
from twinjokers.presentation.input import Action, Command


class Driver(Protocol):
    done: bool
    shot_requests: list[str]

    def poll(self, view: SessionView, busy: bool, frame: int) -> list[Command]: ...


class AutoPlayer:
    """A polite bot: bet, deal, sometimes double (all three kinds), pick, collect."""

    def __init__(self, seed: int | None = None, pause: int = 18) -> None:
        self._rng = random.Random(seed)
        self._pause = pause
        self._next = 30
        self.done = False
        self.shot_requests: list[str] = []

    def poll(self, view: SessionView, busy: bool, frame: int) -> list[Command]:
        if busy or frame < self._next:
            return []
        self._next = frame + self._rng.randint(self._pause // 2, self._pause * 2)
        r = self._rng
        phase = view.phase
        if phase is SessionPhase.BETTING:
            if view.credits < 5 and view.bet == 0:
                return [Command(Action.ADD_MEDALS)]
            roll = r.random()
            if roll < 0.5:
                return [Command(Action.MAX_BET)]
            if roll < 0.8 or view.bet > 0:
                return (
                    [Command(Action.DEAL)]
                    if view.bet or r.random() < 0.5
                    else [Command(Action.BET)]
                )
            return [Command(Action.BET)]
        if phase is SessionPhase.FREE_GAME:
            return [Command(Action.DEAL)] if r.random() < 0.8 else []
        if phase is SessionPhase.DOUBLE_SELECT:
            roll = r.random()
            if roll < 0.35:
                return [Command(Action.COLLECT)]
            if roll < 0.5:
                return [Command(Action.DEAL)]  # standard double
            if roll < 0.62:
                return [Command(Action.HOLD, 3)]  # HIGH & LOW
            if roll < 0.74:
                return [Command(Action.HOLD, 4)]  # RED & BLACK
            if roll < 0.82:
                return [Command(Action.HOLD, 1)]  # toggle HALF DOUBLE
            return [Command(Action.HOLD, 5)]  # TAKE SCORE
        if phase in (SessionPhase.STANDARD_PICK, SessionPhase.RED_BLACK_PICK):
            if view.can_collect and r.random() < 0.15:
                return [Command(Action.COLLECT)]
            return [Command(Action.HOLD, r.randint(2, 5))]
        if phase is SessionPhase.HIGH_LOW_GUESS:
            if r.random() < 0.2:
                return [Command(Action.COLLECT)]
            return [Command(Action.HIGH if r.random() < 0.5 else Action.LOW)]
        return []


class ChaosPlayer:
    """Mashes random keys every few frames, busy or not (adversarial testing)."""

    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)
        self.done = False
        self.shot_requests: list[str] = []
        self._actions = [a for a in Action if a not in (Action.QUIT,)]

    def poll(self, view: SessionView, busy: bool, frame: int) -> list[Command]:
        if self._rng.random() > 0.35:
            return []
        action = self._rng.choice(self._actions)
        return [Command(action, self._rng.randint(1, 5) if action is Action.HOLD else 0)]


@dataclass(frozen=True, slots=True)
class Step:
    kind: str  # act | wait | idle | until | shot | quit
    action: Action | None = None
    arg: int = 0
    n: int = 0
    text: str = ""


def act(action: Action, arg: int = 0) -> Step:
    return Step("act", action, arg)


def wait(n: int) -> Step:
    return Step("wait", n=n)


def idle() -> Step:
    return Step("idle")


def until(phase: SessionPhase) -> Step:
    return Step("until", text=phase.value)


def shot(name: str) -> Step:
    return Step("shot", text=name)


class ScriptDriver:
    """Plays a fixed list of steps (used by the debug scenes)."""

    def __init__(self, steps: list[Step]) -> None:
        self._steps = list(steps)
        self._i = 0
        self._wait_until = 0
        self.done = False
        self.shot_requests: list[str] = []
        self.quit_requested = False

    def poll(self, view: SessionView, busy: bool, frame: int) -> list[Command]:
        if frame < self._wait_until:
            return []
        while self._i < len(self._steps):
            step = self._steps[self._i]
            if step.kind == "act":
                if busy:
                    return []
                self._i += 1
                assert step.action is not None
                return [Command(step.action, step.arg)]
            if step.kind == "wait":
                self._i += 1
                self._wait_until = frame + step.n
                return []
            if step.kind == "idle":
                if busy:
                    return []
                self._i += 1
                continue
            if step.kind == "until":
                if view.phase.value != step.text or busy:
                    return []
                self._i += 1
                continue
            if step.kind == "shot":
                self._i += 1
                self.shot_requests.append(step.text)
                return []
            if step.kind == "quit":
                self._i += 1
                self.quit_requested = True
                return []
        self.done = True
        return []
