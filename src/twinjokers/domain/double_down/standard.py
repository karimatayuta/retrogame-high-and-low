"""Standard double: beat the dealer's card (2 < ... < K < A < JOKER)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from twinjokers.domain.cards import Card, standard_deck
from twinjokers.domain.config import DoubleDownConfig
from twinjokers.domain.double_down.common import (
    DoubleDownError,
    Phase,
    apply_cap,
    check_stake,
)
from twinjokers.domain.random_port import Randomizer

JOKER_STRENGTH = 15
HAND_SIZE = 5


class StandardOutcome(StrEnum):
    WIN = "WIN"
    LOSE = "LOSE"
    DRAW = "DRAW"


def standard_strength(card: Card) -> int:
    """2..14 for normal cards (A = 14), 15 for a joker."""
    return JOKER_STRENGTH if card.rank is None else int(card.rank)


@dataclass(frozen=True, slots=True)
class StandardResult:
    outcome: StandardOutcome
    picked_index: int
    cards: tuple[Card, ...]  # all 5 cards, index 0 = dealer; everything is revealed
    payout: int  # WIN: capped stake x 2; LOSE: 0; DRAW: 0 (not collectable, redeal required)

    @property
    def can_collect(self) -> bool:
        """A draw must be replayed; the player cannot collect at that moment."""
        return self.outcome is not StandardOutcome.DRAW


class StandardDouble:
    """One standard double. ``stake`` is the amount at risk (full amount, or the half)."""

    def __init__(self, stake: int, cfg: DoubleDownConfig, rng: Randomizer) -> None:
        check_stake(stake, cfg)
        self._stake = stake
        self._cfg = cfg
        self._rng = rng
        self._cards: tuple[Card, ...] = ()
        self._phase = Phase.AWAITING_PICK
        self._result: StandardResult | None = None
        self._deal()

    def _deal(self) -> None:
        deck = standard_deck(self._cfg.standard_jokers)
        self._rng.shuffle(deck)
        self._cards = tuple(deck[:HAND_SIZE])

    @property
    def stake(self) -> int:
        return self._stake

    @property
    def phase(self) -> Phase:
        return self._phase

    @property
    def dealer_card(self) -> Card:
        """Index 0, the only face-up card before a pick."""
        return self._cards[0]

    @property
    def result(self) -> StandardResult | None:
        return self._result

    @property
    def can_collect(self) -> bool:
        """Collecting is only legal when finished with a WIN (the caller keeps the payout)."""
        return (
            self._result is not None
            and self._result.can_collect
            and (self._result.outcome is StandardOutcome.WIN)
        )

    def pick(self, index: int) -> StandardResult:
        if self._phase is not Phase.AWAITING_PICK:
            raise DoubleDownError(f"cannot pick in phase {self._phase}")
        if not 1 <= index < HAND_SIZE:
            raise DoubleDownError("pick index must be 1..4")
        dealer = standard_strength(self._cards[0])
        picked = standard_strength(self._cards[index])
        if picked > dealer:
            outcome, payout = StandardOutcome.WIN, apply_cap(self._stake * 2, self._cfg)
        elif picked < dealer:
            outcome, payout = StandardOutcome.LOSE, 0
        else:
            outcome, payout = StandardOutcome.DRAW, 0
        self._result = StandardResult(outcome, index, self._cards, payout)
        self._phase = Phase.NEEDS_REDEAL if outcome is StandardOutcome.DRAW else Phase.FINISHED
        return self._result

    def redeal(self) -> None:
        """After a DRAW: shuffle and deal again (same stake). The player must pick again."""
        if self._phase is not Phase.NEEDS_REDEAL:
            raise DoubleDownError("redeal is only allowed after a draw")
        self._deal()
        self._result = None
        self._phase = Phase.AWAITING_PICK
