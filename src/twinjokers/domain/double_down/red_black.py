"""RED & BLACK: pick a card of the same colour as the dealer's card."""

from __future__ import annotations

from dataclasses import dataclass

from twinjokers.domain.cards import Card, standard_deck
from twinjokers.domain.config import DoubleDownConfig
from twinjokers.domain.double_down.common import (
    DoubleDownError,
    Phase,
    apply_cap,
    check_stake,
)
from twinjokers.domain.random_port import Randomizer

HAND_SIZE = 5


@dataclass(frozen=True, slots=True)
class RedBlackResult:
    won: bool
    picked_index: int
    cards: tuple[Card, ...]  # all 5 cards, index 0 = dealer; everything is revealed
    flush: bool  # all 5 cards share one suit
    payout: int  # 0 on a loss; else cap(stake x 2 + flush bonus), cap applies to the total


class RedBlackDouble:
    def __init__(self, stake: int, cfg: DoubleDownConfig, rng: Randomizer) -> None:
        check_stake(stake, cfg)
        self._stake = stake
        self._cfg = cfg
        deck = standard_deck(cfg.red_black_jokers)
        rng.shuffle(deck)
        self._cards = tuple(deck[:HAND_SIZE])
        self._phase = Phase.AWAITING_PICK
        self._result: RedBlackResult | None = None

    @property
    def stake(self) -> int:
        return self._stake

    @property
    def phase(self) -> Phase:
        return self._phase

    @property
    def dealer_card(self) -> Card:
        return self._cards[0]

    @property
    def result(self) -> RedBlackResult | None:
        return self._result

    def pick(self, index: int) -> RedBlackResult:
        if self._phase is not Phase.AWAITING_PICK:
            raise DoubleDownError(f"cannot pick in phase {self._phase}")
        if not 1 <= index < HAND_SIZE:
            raise DoubleDownError("pick index must be 1..4")
        suits = {c.suit for c in self._cards}
        flush = len(suits) == 1 and None not in suits
        won = self._cards[index].color == self._cards[0].color
        payout = 0
        if won:
            total = self._stake * 2
            if flush:
                total += self._stake * self._cfg.red_black_flush_bonus_multiplier
            payout = apply_cap(total, self._cfg)
        self._result = RedBlackResult(won, index, self._cards, flush, payout)
        self._phase = Phase.FINISHED
        return self._result
