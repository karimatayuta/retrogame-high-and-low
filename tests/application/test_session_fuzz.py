"""Fuzz: random commands from random phases must never break the session."""

from __future__ import annotations

import random

import pytest
from session_helpers import FakeRepository, ScriptedRng, ledger_ok, make_config

from twinjokers.application.session import GameSession
from twinjokers.application.view import SessionPhase as P
from twinjokers.domain.enums import HighLowGuess


def random_command(s: GameSession, r: random.Random) -> None:
    pick = r.randrange(14)
    if pick == 0:
        s.bet_one()
    elif pick == 1:
        s.max_bet()
    elif pick in (2, 3):
        s.deal()
    elif pick in (4, 5):
        s.advance()
    elif pick in (6, 7, 8):
        s.hold(r.choice([-1, 0, 1, 2, 3, 4, 5, 6]))
    elif pick == 9:
        s.double()
    elif pick == 10:
        s.collect()
    elif pick == 11:
        s.guess(r.choice(list(HighLowGuess)))
    elif pick == 12:
        if r.random() < 0.3:
            s.add_medals()
    else:
        s.hold(r.randint(1, 5))


def escape_to_betting(s: GameSession) -> None:
    """Whatever the phase, a sane player can always get back to BETTING."""
    for _ in range(5000):
        phase = s.phase
        if phase is P.BETTING:
            return
        if phase is P.FREE_GAME:
            assert s.advance()
        elif phase is P.DOUBLE_SELECT or phase is P.HIGH_LOW_GUESS or s.view().can_collect:
            assert s.collect()
        else:
            assert s.hold(2)  # standard draw: pick again
    raise AssertionError(f"stuck in {s.phase}")


@pytest.mark.parametrize("seed", [1, 2, 3, 4])
def test_20000_random_commands_keep_invariants(seed):
    r = random.Random(seed)
    initial = 40  # small bankroll: exercises insufficient credits and medals
    repo = FakeRepository()
    s = GameSession(make_config(credits=initial), ScriptedRng(seed=seed), repo)
    medals = 0
    seen_phases: set[P] = set()
    for step in range(20_000):
        before = s.stats.total_bet
        random_command(s, r)
        for e in s.drain_events():
            if e.kind.value == "CREDITS_ADDED":
                medals += e.amount
        v = s.view()
        seen_phases.add(v.phase)
        assert v.credits >= 0 and v.win >= 0 and 0 <= v.bet <= 5
        assert v.win <= 10000
        assert len(v.cards) == 5 and len(v.face_up) == 5
        assert ledger_ok(s, initial, medals), (step, v.phase)
        assert s.stats.total_bet >= before
        if step % 250 == 249:
            escape_to_betting(s)
            assert s.phase is P.BETTING
    assert repo.data is not None and repo.data.credits >= 0
    assert seen_phases == set(P)  # the fuzz really visited every phase


def test_high_volume_autoplay_without_exceptions():
    """Play 3000 full games with a sensible strategy; the economy stays consistent."""
    r = random.Random(7)
    initial = 1000
    s = GameSession(make_config(credits=initial), ScriptedRng(seed=7))
    medals = 0
    for _ in range(3000):
        if s.view().credits < 5:
            s.add_medals()
            medals += 100
        s.max_bet()
        while s.phase is not P.BETTING:
            if s.phase is P.FREE_GAME:
                s.advance()
            elif s.phase is P.DOUBLE_SELECT:
                if r.random() < 0.5:
                    s.hold(r.choice([2, 3, 4]))
                else:
                    s.collect()
            elif s.phase is P.HIGH_LOW_GUESS:
                if r.random() < 0.7:
                    s.hold(r.choice([2, 4]))
                else:
                    s.collect()
            elif s.view().can_collect and r.random() < 0.3:
                s.collect()
            else:
                s.hold(r.randint(2, 5))
        assert ledger_ok(s, initial, medals)
