"""Every tunable rule value lives here (spec: 「仮の値はすべて設定に置く」).

Values marked 仮 / 推定 in the spec are commented. To change a rule, change
the value here (or load a JSON override with ``GameConfig.model_validate_json``)
— no game logic should hard-code these numbers.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from twinjokers.domain.enums import (
    PROGRESSIVE_LINES,
    DoubleDownMenuItem,
    FreeGameTrigger,
    HighLowBonus,
    HighLowDrawMode,
    PayLine,
)


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class BetConfig(_Frozen):
    min_bet: int = 1
    max_bet: int = 5  # MAX BET (confirmed). Progressive only at this bet.


class PaytableConfig(_Frozen):
    # 1..4 BET: payout = BET x multiplier (confirmed)
    multipliers: dict[PayLine, int] = {
        PayLine.FIVE_OF_A_KIND: 500,
        PayLine.ROYAL_FLUSH: 250,
        PayLine.STRAIGHT_FLUSH: 50,
        PayLine.FOUR_OR_FULL: 10,
        PayLine.FLUSH_OR_STRAIGHT: 8,
        PayLine.THREE_OF_A_KIND: 3,
        PayLine.TWO_PAIR: 2,
        PayLine.JOKER_ANYTHING: 1,
    }
    # MAX BET: fixed payout (lines with a progressive counter pay the counter instead)
    max_bet_payouts: dict[PayLine, int] = {
        PayLine.FIVE_OF_A_KIND: 2500,
        PayLine.ROYAL_FLUSH: 1250,
        PayLine.STRAIGHT_FLUSH: 250,
        PayLine.FOUR_OR_FULL: 40,
        PayLine.FLUSH_OR_STRAIGHT: 32,
        PayLine.THREE_OF_A_KIND: 12,
        PayLine.TWO_PAIR: 8,
        PayLine.JOKER_ANYTHING: 4,
    }

    @model_validator(mode="after")
    def _complete(self) -> PaytableConfig:
        for table in (self.multipliers, self.max_bet_payouts):
            if set(table) != set(PayLine):
                raise ValueError("pay table must define every PayLine")
        return self


class ProgressiveCounterConfig(_Frozen):
    initial: float
    increment: float  # added per MAX BET game (not in free games: 仮)


class ProgressiveConfig(_Frozen):
    counters: dict[PayLine, ProgressiveCounterConfig] = {
        PayLine.FIVE_OF_A_KIND: ProgressiveCounterConfig(initial=2500, increment=0.05),
        PayLine.ROYAL_FLUSH: ProgressiveCounterConfig(initial=1250, increment=0.03),
        PayLine.STRAIGHT_FLUSH: ProgressiveCounterConfig(initial=250, increment=0.035),
        PayLine.FOUR_OR_FULL: ProgressiveCounterConfig(initial=40, increment=0.24),
        PayLine.FLUSH_OR_STRAIGHT: ProgressiveCounterConfig(initial=32, increment=0.335),
    }
    increment_in_free_game: bool = False  # 仮

    @model_validator(mode="after")
    def _complete(self) -> ProgressiveConfig:
        if set(self.counters) != set(PROGRESSIVE_LINES):
            raise ValueError("progressive counters must match PROGRESSIVE_LINES")
        return self


class FreeGameConfig(_Frozen):
    # number of free games awarded (standard setting; spec gives the allowed range)
    awards: dict[FreeGameTrigger, int] = {
        FreeGameTrigger.FIVE_SAME_COLOR: 100,
        FreeGameTrigger.ANY_FIVE: 40,  # setting range 35..50
        FreeGameTrigger.FOUR_SAME_COLOR: 25,
        FreeGameTrigger.ANY_FOUR: 10,  # setting range 8..12
        FreeGameTrigger.THREE_SAME_COLOR: 5,  # setting range 4..5
    }
    payout_multiplier: int = 2  # all payouts (incl. progressive) doubled in free games
    min_payout_is_bet: bool = True  # even without a hand, BET medals are paid each free game

    @model_validator(mode="after")
    def _complete(self) -> FreeGameConfig:
        if set(self.awards) != set(FreeGameTrigger):
            raise ValueError("free game awards must define every trigger")
        return self


class DoubleDownConfig(_Frozen):
    max_amount_to_double: int = 5000  # 5,001+ cannot be doubled and is settled automatically
    payout_cap: int = 10000  # 振り切り
    menu: tuple[DoubleDownMenuItem, ...] = (  # HOLD 1..5 (仮 except the centre)
        DoubleDownMenuItem.HALF_DOUBLE,
        DoubleDownMenuItem.STANDARD,
        DoubleDownMenuItem.HIGH_LOW,
        DoubleDownMenuItem.RED_BLACK,
        DoubleDownMenuItem.TAKE_SCORE,
    )
    standard_jokers: int = Field(default=2, ge=0, le=2)  # 仮
    red_black_jokers: int = Field(default=0, ge=0, le=0)  # 仮 (colour game: no jokers)
    red_black_flush_bonus_multiplier: int = 8  # + stake x 8 on a flush (x10 total)
    half_double_allowed_in_high_low: bool = False  # 仮
    # HIGH & LOW
    high_low_rounds: int = 4
    high_low_jokers: int = Field(default=1, ge=0, le=2)  # 仮
    high_low_draw_mode: HighLowDrawMode = HighLowDrawMode.ARCADE  # 仮 default
    high_low_win_probability: float = Field(default=62 / 128, gt=0, lt=1)  # 仮 (unconfirmed)
    high_low_low_hold: int = 2  # HOLD 2 = LOW (仮)
    high_low_high_hold: int = 4  # HOLD 4 = HIGH (仮)
    # bonus = main game BET x multiplier
    high_low_bonus: dict[HighLowBonus, int] = {
        HighLowBonus.ROYAL_FLUSH: 1000,  # 仮
        HighLowBonus.STRAIGHT_FLUSH: 500,  # 仮
        HighLowBonus.FULL_HOUSE: 100,
        HighLowBonus.FLUSH: 70,  # 仮
        HighLowBonus.STRAIGHT: 50,  # 推定
        HighLowBonus.THREE_OF_A_KIND: 30,
        HighLowBonus.TWO_PAIR: 20,
        HighLowBonus.JACKS_OR_BETTER: 10,
        HighLowBonus.NONE: 0,
    }

    @model_validator(mode="after")
    def _check(self) -> DoubleDownConfig:
        if sorted(self.menu) != sorted(DoubleDownMenuItem) or len(self.menu) != 5:
            raise ValueError("menu must list each DoubleDownMenuItem exactly once")
        if set(self.high_low_bonus) != set(HighLowBonus):
            raise ValueError("high_low_bonus must define every HighLowBonus")
        return self


class EconomyConfig(_Frozen):
    initial_credits: int = 1000  # 仮
    add_medals_amount: int = 100  # 「メダルを追加」 (仮)


class GameConfig(_Frozen):
    bet: BetConfig = BetConfig()
    paytable: PaytableConfig = PaytableConfig()
    progressive: ProgressiveConfig = ProgressiveConfig()
    free_game: FreeGameConfig = FreeGameConfig()
    double_down: DoubleDownConfig = DoubleDownConfig()
    economy: EconomyConfig = EconomyConfig()
    main_deck_jokers: int = Field(default=2, ge=0, le=2)


DEFAULT_CONFIG = GameConfig()
