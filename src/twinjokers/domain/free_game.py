"""Free game trigger detection (spec: フリーゲーム)."""

from __future__ import annotations

from collections.abc import Sequence

from twinjokers.domain.cards import Card, Color
from twinjokers.domain.config import FreeGameConfig
from twinjokers.domain.enums import FreeGameTrigger


def matching_triggers(hand: Sequence[Card]) -> list[FreeGameTrigger]:
    """Every trigger condition the hand satisfies (not yet reduced to one)."""
    faces = [c for c in hand if c.is_face]  # jokers are never faces
    n = len(faces)
    red = sum(1 for c in faces if c.suit is not None and c.suit.color is Color.RED)
    same_color = max(red, n - red)
    found: list[FreeGameTrigger] = []
    if same_color >= 5:
        found.append(FreeGameTrigger.FIVE_SAME_COLOR)
    if n >= 5:
        found.append(FreeGameTrigger.ANY_FIVE)
    if same_color >= 4:
        found.append(FreeGameTrigger.FOUR_SAME_COLOR)
    if n >= 4:
        found.append(FreeGameTrigger.ANY_FOUR)
    if same_color >= 3:
        found.append(FreeGameTrigger.THREE_SAME_COLOR)
    return found


def detect_free_game(hand: Sequence[Card], config: FreeGameConfig) -> FreeGameTrigger | None:
    """Return the matching trigger that awards the most games, or None.

    The choice follows ``config.awards`` (not enum order), so a changed setting
    such as ANY 5 FACES = 50 vs. 5 R/B FACES = 40 still picks the larger award.
    Ties go to the stronger (earlier) condition.
    """
    found = matching_triggers(hand)
    if not found:
        return None
    return max(found, key=lambda t: config.awards[t])  # max() keeps the first of equal keys
