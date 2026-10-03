"""Settlement of one main/free game."""

from __future__ import annotations

from dataclasses import dataclass

from twinjokers.domain.config import GameConfig
from twinjokers.domain.enums import HAND_TO_PAYLINE, PROGRESSIVE_LINES, HandRank, PayLine
from twinjokers.domain.progressive import ProgressivePool


@dataclass(frozen=True, slots=True)
class Payout:
    """Result of one game. ``progressive_line`` is set when a counter was paid."""

    hand: HandRank
    line: PayLine | None
    amount: int
    progressive_line: PayLine | None = None


def settle_main_game(
    hand: HandRank, bet: int, pool: ProgressivePool, config: GameConfig, *, free_game: bool
) -> Payout:
    """Compute the payout of one game.

    * bet < max_bet: ``bet x multiplier``; bet == max_bet: fixed max-bet payout,
      or the progressive counter (``pool.award``, which resets that counter)
      for the five progressive lines.
    * NOTHING pays 0.
    * free game: amount x ``payout_multiplier`` (progressive included); if the
      result is below ``bet`` it is raised to ``bet`` (``min_payout_is_bet``).

    Ordering contract: the counter increment is NOT done here. The session
    calls ``pool.add_max_bet_game()`` once at deal time for a paid MAX BET
    game (and in free games only if ``config.progressive.increment_in_free_game``),
    BEFORE settling, so a win pays the counter including this game's increment.
    """
    if not config.bet.min_bet <= bet <= config.bet.max_bet:
        raise ValueError(f"bet out of range: {bet}")
    line = HAND_TO_PAYLINE.get(hand)
    progressive_line: PayLine | None = None
    if line is None:
        amount = 0
    elif bet == config.bet.max_bet:
        if line in PROGRESSIVE_LINES:
            amount = pool.award(line)
            progressive_line = line
        else:
            amount = config.paytable.max_bet_payouts[line]
    else:
        amount = bet * config.paytable.multipliers[line]
    if free_game:
        amount *= config.free_game.payout_multiplier
        if config.free_game.min_payout_is_bet:
            amount = max(amount, bet)
    return Payout(hand=hand, line=line, amount=amount, progressive_line=progressive_line)
