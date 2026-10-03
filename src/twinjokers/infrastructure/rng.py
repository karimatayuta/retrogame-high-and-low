"""Production randomness (OS entropy)."""

from __future__ import annotations

import random


class SystemRandomizer(random.SystemRandom):
    """``random.SystemRandom`` satisfying the domain ``Randomizer`` protocol."""
