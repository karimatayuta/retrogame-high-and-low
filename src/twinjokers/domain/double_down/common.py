"""Helpers shared by the three double down games."""

from __future__ import annotations

from enum import StrEnum

from twinjokers.domain.config import DoubleDownConfig


class DoubleDownError(Exception):
    """Raised when a double down object is used illegally (wrong phase, bad index...)."""


class Phase(StrEnum):
    """Explicit phases of a double down game."""

    AWAITING_PICK = "AWAITING_PICK"  # standard / red & black: choose one of the 4 face-down cards
    AWAITING_GUESS = "AWAITING_GUESS"  # high & low: choose HIGH or LOW (or collect)
    NEEDS_REDEAL = "NEEDS_REDEAL"  # standard only: drawn, must be dealt again, cannot collect
    FINISHED = "FINISHED"


def can_double(amount: int, cfg: DoubleDownConfig) -> bool:
    """A payout can be doubled when ``1 <= amount <= max_amount_to_double`` (5000)."""
    return 1 <= amount <= cfg.max_amount_to_double


def must_auto_settle(amount: int, cfg: DoubleDownConfig) -> bool:
    """5001+ cannot be doubled: it is settled automatically."""
    return amount > cfg.max_amount_to_double


def apply_cap(amount: int, cfg: DoubleDownConfig) -> int:
    """Clamp to the 振り切り limit (10000)."""
    return min(amount, cfg.payout_cap)


def split_half(amount: int) -> tuple[int, int]:
    """Half double split ``(kept, stake)``. The odd extra medal goes to ``kept`` (仮).

    ``split_half(7) == (4, 3)``; ``split_half(1) == (1, 0)`` (not playable, see
    :func:`can_half_double`).
    """
    if amount < 0:
        raise ValueError("amount must not be negative")
    stake = amount // 2
    return amount - stake, stake


def can_half_double(amount: int, cfg: DoubleDownConfig | None = None) -> bool:
    """Half double needs a stake of at least 1 (so ``amount >= 2``).

    When ``cfg`` is given the amount must also be doublable (<= 5000).
    """
    if amount < 2:
        return False
    return cfg is None or can_double(amount, cfg)


def check_stake(stake: int, cfg: DoubleDownConfig) -> None:
    if not can_double(stake, cfg):
        raise DoubleDownError(f"stake {stake} cannot be doubled")
