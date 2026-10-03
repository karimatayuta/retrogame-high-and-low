"""Randomness port.

The domain never imports ``random`` directly for game decisions. It receives
an object satisfying :class:`Randomizer`. ``random.Random`` (seeded, for tests)
and ``random.SystemRandom`` (production, see infrastructure.rng) both satisfy
this protocol structurally.
"""

from __future__ import annotations

from collections.abc import MutableSequence, Sequence
from typing import Any, Protocol, TypeVar

T = TypeVar("T")


class Randomizer(Protocol):
    def random(self) -> float:
        """Uniform float in [0.0, 1.0)."""
        ...

    def randrange(self, start: int, stop: int | None = None, step: int = 1) -> int: ...

    def shuffle(self, x: MutableSequence[Any]) -> None:
        """In-place Fisher–Yates shuffle."""
        ...

    def choice(self, seq: Sequence[T]) -> T: ...
