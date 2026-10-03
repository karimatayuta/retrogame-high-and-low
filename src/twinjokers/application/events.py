"""Events: what happened inside the session, for sounds and animations.

The session advances its state instantly. The presentation layer calls
``GameSession.drain_events()`` once per frame and plays the events over time.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from twinjokers.domain.cards import Card


class EventKind(StrEnum):
    BET = "BET"  # amount = medals just deducted
    DEAL = "DEAL"  # a paid main game was dealt; amount = bet
    HAND = "HAND"  # a hand was evaluated; amount = payout, detail = hand name
    NO_WIN = "NO_WIN"  # a paid game ended without any payout
    PROGRESSIVE_WON = "PROGRESSIVE_WON"  # amount = counter paid, detail = pay line
    FREE_GAME_AWARDED = "FREE_GAME_AWARDED"  # amount = games added, detail = trigger
    FREE_GAME_STEP = "FREE_GAME_STEP"  # one free game was played; amount = its payout
    FREE_GAME_END = "FREE_GAME_END"  # amount = total free game win
    DOUBLE_START = "DOUBLE_START"  # amount = stake at risk, detail = double kind
    HALF_DOUBLE_TOGGLED = "HALF_DOUBLE_TOGGLED"  # detail = "ON" / "OFF"
    DOUBLE_WIN = "DOUBLE_WIN"  # amount = new win; cards = all revealed cards
    DOUBLE_LOSE = "DOUBLE_LOSE"  # cards = all revealed cards (HIGH & LOW: the losing card)
    DOUBLE_DRAW = "DOUBLE_DRAW"  # standard draw; index = picked slot, cards = revealed cards
    HIGH_LOW_STEP = "HIGH_LOW_STEP"  # amount = amount after the guess, detail = HIGH/LOW
    JOKER = "JOKER"  # HIGH & LOW ended by a joker
    HIGH_LOW_BONUS = "HIGH_LOW_BONUS"  # amount = bonus medals, detail = bonus hand
    COLLECT = "COLLECT"  # amount moved to CREDITS by the player
    AUTO_SETTLED = "AUTO_SETTLED"  # amount moved to CREDITS automatically
    CREDITS_ADDED = "CREDITS_ADDED"  # "add medals"; amount = medals
    REJECTED = "REJECTED"  # invalid command (play a buzzer); detail = reason


@dataclass(frozen=True, slots=True)
class Event:
    """One thing that happened. ``index`` is a card slot (or -1), ``cards`` is optional context."""

    kind: EventKind
    amount: int = 0
    detail: str = ""
    index: int = -1
    cards: tuple[Card, ...] = ()
