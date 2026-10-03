"""View models: everything the screen needs, so presentation never calls domain logic."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from twinjokers.domain.cards import Card
from twinjokers.domain.enums import (
    DoubleDownKind,
    DoubleDownMenuItem,
    HandRank,
    PayLine,
)

CARD_SLOTS = 5


class SessionPhase(StrEnum):
    BETTING = "BETTING"
    FREE_GAME = "FREE_GAME"
    DOUBLE_SELECT = "DOUBLE_SELECT"
    STANDARD_PICK = "STANDARD_PICK"
    RED_BLACK_PICK = "RED_BLACK_PICK"
    HIGH_LOW_GUESS = "HIGH_LOW_GUESS"


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True)


class PaytableRowView(_Frozen):
    """One pay table row, already priced for the current bet."""

    line: PayLine
    label: str
    payout: int
    progressive: bool  # payout is the live progressive counter (5 BET only)
    hit: bool  # this row paid in the last evaluated game


class FreeGameAwardView(_Frozen):
    label: str  # e.g. "3 R/B FACES"
    games: int


class MenuItemView(_Frozen):
    """One double down menu item (HOLD 1..5 after a win)."""

    item: DoubleDownMenuItem
    label: str
    enabled: bool
    selected: bool = False  # HALF DOUBLE toggled on


class BonusRowView(_Frozen):
    label: str
    multiplier: int
    amount: int  # main game BET x multiplier


class HighLowView(_Frozen):
    active: bool  # waiting for HIGH / LOW
    rounds_won: int
    rounds_total: int
    current_amount: int
    next_amount: int  # amount if the next guess wins (capped)
    bonus_rows: tuple[BonusRowView, ...]
    bonus_hand: str | None = None  # set when all rounds were won
    bonus_amount: int = 0
    outcome: str | None = None  # HighLowOutcome value once finished


class SessionView(_Frozen):
    phase: SessionPhase
    message: str
    credits: int
    bet: int  # pending bet in BETTING, the game's bet otherwise
    last_bet: int
    max_bet: int
    win: int  # pending win (amount at risk during a double game)
    last_payout: int  # medals moved to CREDITS by the last settlement
    # five card slots
    cards: tuple[Card | None, ...] = Field(min_length=CARD_SLOTS, max_length=CARD_SLOTS)
    face_up: tuple[bool, ...] = Field(min_length=CARD_SLOTS, max_length=CARD_SLOTS)
    highlight: int | None  # slot to emphasise (picked card / last revealed)
    # last evaluated game
    hand_rank: HandRank | None
    paid_line: PayLine | None
    game_payout: int
    # free game
    in_free_game: bool
    free_game_trigger: str | None
    free_games_left: int
    free_games_played: int
    free_game_total: int  # awarded so far, retriggers included
    free_game_win: int  # accumulated win of the free game session
    # tables
    paytable: tuple[PaytableRowView, ...]
    progressive: dict[PayLine, int]
    free_game_awards: tuple[FreeGameAwardView, ...]
    # double down
    double_kind: DoubleDownKind | None
    half_double: bool
    menu: tuple[MenuItemView, ...]  # 5 items in DOUBLE_SELECT, otherwise empty
    high_low: HighLowView | None
    hold_labels: tuple[str, ...] = Field(min_length=5, max_length=5)
    can_collect: bool
