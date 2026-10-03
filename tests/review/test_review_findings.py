"""Tests that prove defects found in the T4.1 adversarial review."""

from __future__ import annotations

import random

import pytest

from twinjokers.application.save_data import SaveData
from twinjokers.application.session import GameSession
from twinjokers.domain.config import DEFAULT_CONFIG
from twinjokers.domain.enums import PayLine


class FakeRepository:
    def __init__(self, data: SaveData) -> None:
        self.data = data

    def load(self) -> SaveData | None:
        return self.data

    def save(self, data: SaveData) -> bool:
        return True


@pytest.mark.parametrize(
    "bad",
    [
        {PayLine.THREE_OF_A_KIND: 3.0},  # a line without a counter
        {PayLine.FIVE_OF_A_KIND: float("nan")},
        {PayLine.FIVE_OF_A_KIND: float("inf")},
    ],
)
def test_corrupt_progressive_in_save_does_not_crash_startup(bad: dict[PayLine, float]) -> None:
    repo = FakeRepository(SaveData(credits=500, progressive=bad))
    s = GameSession(DEFAULT_CONFIG, random.Random(0), repo)
    v = s.view()
    assert v.credits == 500
    assert v.progressive[PayLine.FIVE_OF_A_KIND] == 2500


def test_valid_counters_survive_next_to_corrupt_ones() -> None:
    repo = FakeRepository(
        SaveData(
            credits=1,
            progressive={PayLine.ROYAL_FLUSH: 1300.5, PayLine.TWO_PAIR: 9.0},
        )
    )
    s = GameSession(DEFAULT_CONFIG, random.Random(0), repo)
    assert s.view().progressive[PayLine.ROYAL_FLUSH] == 1301
