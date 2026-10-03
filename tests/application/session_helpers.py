"""Shared test helpers for the GameSession tests (scripted decks, fake repository)."""

from __future__ import annotations

import random
from collections.abc import MutableSequence, Sequence
from typing import Any, TypeVar

from twinjokers.application.save_data import SaveData
from twinjokers.application.session import GameSession
from twinjokers.application.view import SessionPhase, SessionView
from twinjokers.domain.cards import Card, card
from twinjokers.domain.config import (
    DEFAULT_CONFIG,
    DoubleDownConfig,
    EconomyConfig,
    GameConfig,
    ProgressiveConfig,
    ProgressiveCounterConfig,
)
from twinjokers.domain.enums import HighLowDrawMode, PayLine

T = TypeVar("T")

# Hands (54-card main deck). The names are the hand ranks they evaluate to.
NOTHING = "2S 5H 9D JC KS"
JOKER_ANYTHING = "JKR 2S 5H 9D 4C"
TWO_PAIR = "2S 2H 5D 5C 9S"
THREE_KIND = "7S 7H 7D 2C 9S"
FOUR_KIND = "9S 9H 9D 9C 2S"
ROYAL = "10S JS QS KS AS"
THREE_BLACK_FACES = "JS QS KC 2H 5D"  # free game: 5 games
FIVE_KIND = "9S 9H 9D 9C JKR"  # no faces: no free game
FOUR_FACES_FIVE_KIND = "KS KC KH KD JKR"  # 4 faces (10 games) AND five of a kind

STANDARD_WIN = "5S 9H 3D 5C 2H"  # HOLD 2 (9H) wins, HOLD 4 (5C) draws, HOLD 5 (2H) loses
RB_WIN = "5S 9C 3D 5H 2S"  # HOLD 2 (9C black) wins, HOLD 3 (3D red) loses


class ScriptedRng:
    """Randomizer: each ``shuffle`` call consumes one scripted "front" (cards put on top).

    When the script is exhausted (or a front is ""), the deck is just shuffled with a
    seeded ``random.Random``. Everything else (``random``/``choice``) is seeded too.
    """

    def __init__(self, decks: Sequence[str] = (), seed: int = 0) -> None:
        self.decks = list(decks)
        self.inner = random.Random(seed)

    def random(self) -> float:
        return self.inner.random()

    def randrange(self, start: int, stop: int | None = None, step: int = 1) -> int:
        return self.inner.randrange(start, stop, step)

    def choice(self, seq: Sequence[T]) -> T:
        return self.inner.choice(seq)

    def shuffle(self, x: MutableSequence[Any]) -> None:
        self.inner.shuffle(x)
        front: list[Card] = [card(t) for t in self.decks.pop(0).split()] if self.decks else []
        for c in reversed(front):
            x.remove(c)
            x.insert(0, c)


class FakeRepository:
    """In-memory SaveRepository."""

    def __init__(self, data: SaveData | None = None, fail: bool = False) -> None:
        self.data = data
        self.fail = fail
        self.saves = 0

    def load(self) -> SaveData | None:
        return self.data

    def save(self, data: SaveData) -> bool:
        self.saves += 1
        if self.fail:
            return False
        self.data = data.model_copy(deep=True)
        return True


def make_config(
    *,
    five_progressive: float | None = None,
    half_in_high_low: bool = False,
    credits: int = 1000,
    progressive_in_free_game: bool = False,
) -> GameConfig:
    """Default config, HIGH & LOW in FAIR mode (cards come off the scripted deck)."""
    counters = dict(DEFAULT_CONFIG.progressive.counters)
    if five_progressive is not None:
        counters[PayLine.FIVE_OF_A_KIND] = ProgressiveCounterConfig(
            initial=five_progressive, increment=0.05
        )
    return GameConfig(
        progressive=ProgressiveConfig(
            counters=counters, increment_in_free_game=progressive_in_free_game
        ),
        double_down=DoubleDownConfig(
            high_low_draw_mode=HighLowDrawMode.FAIR,
            half_double_allowed_in_high_low=half_in_high_low,
        ),
        economy=EconomyConfig(initial_credits=credits),
    )


def make_session(
    decks: Sequence[str] = (),
    *,
    config: GameConfig | None = None,
    repo: FakeRepository | None = None,
    seed: int = 0,
) -> GameSession:
    return GameSession(config or make_config(), ScriptedRng(decks, seed), repo)


def play_to_win(s: GameSession, bet: int = 4) -> None:
    """Bet ``bet`` and deal (the scripted deck decides the hand)."""
    for _ in range(bet):
        assert s.bet_one()
    assert s.deal()


def session_in(phase: SessionPhase, extra: str = STANDARD_WIN) -> GameSession:
    """A session sitting in ``phase``. ``extra`` is the deck of the double game."""
    if phase is SessionPhase.BETTING:
        return make_session()
    if phase is SessionPhase.FREE_GAME:
        s = make_session([THREE_BLACK_FACES])
        play_to_win(s, 1)
        return s
    s = make_session([JOKER_ANYTHING, extra])
    play_to_win(s, 4)  # JOKER ANYTHING pays 4
    assert s.phase is SessionPhase.DOUBLE_SELECT
    if phase is SessionPhase.DOUBLE_SELECT:
        return s
    hold = {
        SessionPhase.STANDARD_PICK: 2,
        SessionPhase.HIGH_LOW_GUESS: 3,
        SessionPhase.RED_BLACK_PICK: 4,
    }[phase]
    assert s.hold(hold)
    assert s.phase is phase
    return s


def ledger_ok(s: GameSession, initial: int, medals: int = 0) -> bool:
    """credits == initial + medals - bets paid + medals won (undealt bet counts as paid)."""
    v: SessionView = s.view()
    st = s.stats
    undealt = v.bet if v.phase is SessionPhase.BETTING else 0
    return v.credits == initial + medals - st.total_bet - undealt + st.total_won
