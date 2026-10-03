import random
from collections.abc import MutableSequence, Sequence
from typing import Any, TypeVar

import pytest

from twinjokers.domain.cards import Card, card

T = TypeVar("T")


class ScriptedRng:
    """Randomizer whose shuffle puts the ``front`` cards on top (in order).

    The rest of the deck is shuffled with a seeded ``random.Random``.
    ``randoms`` feeds ``random()``; ``choices`` feeds ``choice()`` (cards, checked to be
    among the candidates). When a queue is exhausted, ``random()`` uses the seeded
    generator and ``choice()`` falls back to it too.
    """

    def __init__(
        self,
        front: str = "",
        randoms: Sequence[float] = (),
        choices: str = "",
        seed: int = 0,
    ) -> None:
        self.front: list[Card] = [card(t) for t in front.split()]
        self.randoms = list(randoms)
        self.choices = [card(t) for t in choices.split()]
        self.inner = random.Random(seed)

    def random(self) -> float:
        return self.randoms.pop(0) if self.randoms else self.inner.random()

    def randrange(self, start: int, stop: int | None = None, step: int = 1) -> int:
        return self.inner.randrange(start, stop, step)

    def shuffle(self, x: MutableSequence[Any]) -> None:
        self.inner.shuffle(x)
        for c in reversed(self.front):
            x.remove(c)
            x.insert(0, c)

    def choice(self, seq: Sequence[T]) -> T:
        if self.choices:
            c = self.choices.pop(0)
            assert c in seq, f"scripted choice {c} not among candidates"
            return c  # type: ignore[return-value]
        return self.inner.choice(seq)


@pytest.fixture
def scripted():
    return ScriptedRng
