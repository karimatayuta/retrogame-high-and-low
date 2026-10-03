"""Progressive counters (spec: プログレッシブ).

Values are held internally as exact ``Fraction``s built from the decimal text
of each float (``0.335`` -> 67/200). Plain float accumulation drifts (e.g.
``32 + 0.335 * 100`` can land a hair above or below 65.5) and ``ceil`` would
then flip a whole medal. With exact decimals the displayed/paid value is
always the true ceil. ``value()`` and ``snapshot()`` expose plain floats.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from fractions import Fraction

from twinjokers.domain.config import ProgressiveConfig
from twinjokers.domain.enums import PROGRESSIVE_LINES, PayLine


def _exact(x: float) -> Fraction:
    return Fraction(repr(float(x)))


class ProgressivePool:
    """Mutable entity holding the five progressive counters."""

    def __init__(
        self, config: ProgressiveConfig, values: Mapping[PayLine, float] | None = None
    ) -> None:
        self._config = config
        self._initial = {ln: _exact(c.initial) for ln, c in config.counters.items()}
        self._step = {ln: _exact(c.increment) for ln, c in config.counters.items()}
        self._values: dict[PayLine, Fraction] = dict(self._initial)
        for line, v in (values or {}).items():
            self._check(line)
            if not math.isfinite(v):
                raise ValueError(f"invalid progressive value for {line}: {v}")
            # a counter never sits below its initial value (tampered/old save data)
            self._values[line] = max(_exact(v), self._initial[line])

    @staticmethod
    def _check(line: PayLine) -> None:
        if line not in PROGRESSIVE_LINES:
            raise ValueError(f"{line!r} has no progressive counter")

    def value(self, line: PayLine) -> float:
        self._check(line)
        return float(self._values[line])

    def display_value(self, line: PayLine) -> int:
        self._check(line)
        return math.ceil(self._values[line])

    def add_max_bet_game(self) -> None:
        """Advance all counters by one MAX BET game."""
        for line, step in self._step.items():
            self._values[line] += step

    def award(self, line: PayLine) -> int:
        """Pay out ``ceil(value)`` and reset only that line to its initial value."""
        paid = self.display_value(line)
        self._values[line] = self._initial[line]
        return paid

    def snapshot(self) -> dict[PayLine, float]:
        return {ln: float(v) for ln, v in self._values.items()}
