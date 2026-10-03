"""HIGH & LOW: guess whether the next card is higher or lower, up to 4 times.

Interpretations (documented because the spec is silent or 仮):

* The first card is never a joker.
* A joker as a *revealed* card is an unconditional win but ends the game on the
  spot (forced settle, no bonus). It counts towards ``rounds_won``.
* The final payout is ``cap(amount + bonus)``: the 10000 limit applies to the
  total (the spec says 10000 is the reachable maximum).
* Reaching 4 wins ends the game as COMPLETED (bonus judged); this takes
  precedence over auto-settle. Any earlier win leaving ``amount > 5000`` ends the
  game as AUTO_SETTLED without a bonus.
* ``collect()`` is allowed before the first guess and after any win-and-continue.
"""

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
    must_auto_settle,
)
from twinjokers.domain.enums import HighLowBonus, HighLowDrawMode, HighLowGuess
from twinjokers.domain.hand import evaluate_high_low_bonus
from twinjokers.domain.random_port import Randomizer


class HighLowOutcome(StrEnum):
    WIN_CONTINUE = "WIN_CONTINUE"  # won, may guess again or collect
    LOSE = "LOSE"
    JOKER_END = "JOKER_END"  # joker revealed: win, forced settle, no bonus
    COMPLETED = "COMPLETED"  # all rounds won: x16 + bonus, auto settle
    AUTO_SETTLED = "AUTO_SETTLED"  # amount exceeded the doublable maximum
    COLLECTED = "COLLECTED"  # player collected


@dataclass(frozen=True, slots=True)
class HighLowStep:
    """Result of one ``guess``."""

    guess: HighLowGuess
    card: Card  # the card just revealed
    won: bool
    outcome: HighLowOutcome
    amount: int  # amount after this step (0 on a loss)
    finished: bool
    bonus_hand: HighLowBonus | None  # only set on COMPLETED
    bonus: int
    payout: int | None  # final payout if finished, else None


def _wins(guess: HighLowGuess, base: Card, candidate: Card) -> bool:
    if candidate.rank is None:
        return True
    assert base.rank is not None
    if guess is HighLowGuess.HIGH:
        return candidate.rank > base.rank
    return candidate.rank < base.rank


class HighLowGame:
    def __init__(self, stake: int, main_bet: int, cfg: DoubleDownConfig, rng: Randomizer) -> None:
        check_stake(stake, cfg)
        if main_bet < 1:
            raise DoubleDownError("main_bet must be at least 1")
        self._stake = stake
        self._main_bet = main_bet
        self._cfg = cfg
        self._rng = rng
        deck = standard_deck(cfg.high_low_jokers)
        rng.shuffle(deck)
        first_index = next(i for i, c in enumerate(deck) if not c.is_joker)
        first = deck.pop(first_index)
        self._deck: list[Card] = deck  # index 0 = top of the deck
        self._history: list[Card] = [first]
        self._amount = stake
        self._rounds_won = 0
        self._phase = Phase.AWAITING_GUESS
        self._outcome: HighLowOutcome | None = None
        self._bonus_hand: HighLowBonus | None = None
        self._bonus = 0
        self._payout: int | None = None

    # -- read-only state -------------------------------------------------

    @property
    def phase(self) -> Phase:
        return self._phase

    @property
    def finished(self) -> bool:
        return self._phase is Phase.FINISHED

    @property
    def stake(self) -> int:
        return self._stake

    @property
    def main_bet(self) -> int:
        return self._main_bet

    @property
    def base_card(self) -> Card:
        """The card the next guess is compared with (the last non-joker revealed)."""
        return self._history[-1]

    @property
    def history(self) -> tuple[Card, ...]:
        """Revealed cards so far; index 0 is the first card (up to 5 slots for the UI)."""
        return tuple(self._history)

    @property
    def rounds_won(self) -> int:
        return self._rounds_won

    @property
    def amount(self) -> int:
        """Current amount (0 after a loss)."""
        return self._amount

    @property
    def outcome(self) -> HighLowOutcome | None:
        return self._outcome

    @property
    def bonus_hand(self) -> HighLowBonus | None:
        return self._bonus_hand

    @property
    def bonus(self) -> int:
        return self._bonus

    @property
    def payout(self) -> int | None:
        """Final payout once finished (``cap(amount + bonus)``), else ``None``."""
        return self._payout

    @property
    def can_collect(self) -> bool:
        return self._phase is Phase.AWAITING_GUESS

    # -- actions ---------------------------------------------------------

    def collect(self) -> int:
        """Take the current amount (stake unchanged before the first guess)."""
        if self._phase is not Phase.AWAITING_GUESS:
            raise DoubleDownError(f"cannot collect in phase {self._phase}")
        self._outcome = HighLowOutcome.COLLECTED
        self._finish(self._amount)
        return self._amount

    def guess(self, guess: HighLowGuess) -> HighLowStep:
        if self._phase is not Phase.AWAITING_GUESS:
            raise DoubleDownError(f"cannot guess in phase {self._phase}")
        base = self.base_card
        card = self._draw(guess)
        self._history.append(card)
        won = _wins(guess, base, card)
        if not won:
            self._amount = 0
            self._outcome = HighLowOutcome.LOSE
            self._finish(0)
            return self._step(guess, card, False)
        self._amount = apply_cap(self._amount * 2, self._cfg)
        self._rounds_won += 1
        if card.is_joker:
            self._outcome = HighLowOutcome.JOKER_END
            self._finish(self._amount)
        elif self._rounds_won >= self._cfg.high_low_rounds:
            self._bonus_hand = evaluate_high_low_bonus(self._history)
            self._bonus = self._main_bet * self._cfg.high_low_bonus[self._bonus_hand]
            self._outcome = HighLowOutcome.COMPLETED
            self._finish(apply_cap(self._amount + self._bonus, self._cfg))
        elif must_auto_settle(self._amount, self._cfg):
            self._outcome = HighLowOutcome.AUTO_SETTLED
            self._finish(self._amount)
        else:
            self._outcome = HighLowOutcome.WIN_CONTINUE
        return self._step(guess, card, True)

    # -- internals -------------------------------------------------------

    def _finish(self, payout: int) -> None:
        self._phase = Phase.FINISHED
        self._payout = payout

    def _step(self, guess: HighLowGuess, card: Card, won: bool) -> HighLowStep:
        assert self._outcome is not None
        return HighLowStep(
            guess=guess,
            card=card,
            won=won,
            outcome=self._outcome,
            amount=self._amount,
            finished=self.finished,
            bonus_hand=self._bonus_hand,
            bonus=self._bonus,
            payout=self._payout,
        )

    def _draw(self, guess: HighLowGuess) -> Card:
        if not self._deck:
            raise DoubleDownError("deck is empty")
        if self._cfg.high_low_draw_mode is HighLowDrawMode.FAIR:
            return self._deck.pop(0)
        base = self.base_card
        winners = [c for c in self._deck if _wins(guess, base, c)]
        losers = [c for c in self._deck if not _wins(guess, base, c)]
        want_win = self._rng.random() < self._cfg.high_low_win_probability
        if want_win and not winners:
            want_win = False
        elif not want_win and not losers:
            want_win = True
        picked = self._rng.choice(winners if want_win else losers)
        self._deck.remove(picked)
        return picked
