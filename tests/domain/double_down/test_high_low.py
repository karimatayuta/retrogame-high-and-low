import random

import pytest

from twinjokers.domain.cards import card, cards
from twinjokers.domain.config import DoubleDownConfig
from twinjokers.domain.double_down.common import DoubleDownError, Phase
from twinjokers.domain.double_down.high_low import HighLowGame, HighLowOutcome
from twinjokers.domain.enums import HighLowBonus, HighLowDrawMode, HighLowGuess

HIGH, LOW = HighLowGuess.HIGH, HighLowGuess.LOW
ARCADE = DoubleDownConfig()
FAIR = DoubleDownConfig(high_low_draw_mode=HighLowDrawMode.FAIR)


def fair_game(front, stake=10, main_bet=1, cfg=FAIR, scripted=None):
    return HighLowGame(stake, main_bet, cfg, scripted(front))


def test_first_card_never_joker():
    cfg = FAIR
    for seed in range(300):
        assert not HighLowGame(1, 1, cfg, random.Random(seed)).base_card.is_joker


def test_first_card_skips_scripted_top_joker(scripted):
    g = HighLowGame(10, 1, FAIR, scripted("JKR 7S 9H"))
    assert g.base_card == card("7S")
    s = g.guess(HIGH)
    assert s.card.is_joker  # the skipped joker stays on top of the remaining deck


def test_fair_win_continue_and_base_moves(scripted):
    g = fair_game("7S 9H 4D", scripted=scripted)
    s = g.guess(HIGH)
    assert s.won and s.outcome is HighLowOutcome.WIN_CONTINUE
    assert g.amount == 20 and g.rounds_won == 1
    assert g.base_card == card("9H")
    assert g.phase is Phase.AWAITING_GUESS
    assert g.can_collect
    s = g.guess(LOW)
    assert s.won and g.amount == 40 and g.base_card == card("4D")
    assert g.history == tuple(cards("7S 9H 4D"))


def test_loss(scripted):
    g = fair_game("7S 4H", scripted=scripted)
    s = g.guess(HIGH)
    assert not s.won and s.outcome is HighLowOutcome.LOSE
    assert g.amount == 0 and g.payout == 0 and g.finished and g.rounds_won == 0
    assert s.payout == 0


def test_equal_rank_loses_both_directions(scripted):
    for guess in (HIGH, LOW):
        g = fair_game("7S 7H", scripted=scripted)
        assert g.guess(guess).outcome is HighLowOutcome.LOSE


def test_collect_before_first_guess(scripted):
    g = fair_game("7S 9H", stake=13, scripted=scripted)
    assert g.collect() == 13
    assert g.payout == 13 and g.outcome is HighLowOutcome.COLLECTED
    assert g.history == (card("7S"),)


def test_collect_after_win(scripted):
    g = fair_game("7S 9H", stake=13, scripted=scripted)
    g.guess(HIGH)
    assert g.collect() == 26 and g.payout == 26


def test_actions_after_finish_raise(scripted):
    g = fair_game("7S 4H", scripted=scripted)
    g.guess(HIGH)
    with pytest.raises(DoubleDownError):
        g.guess(HIGH)
    with pytest.raises(DoubleDownError):
        g.collect()
    assert not g.can_collect
    g = fair_game("7S 9H", scripted=scripted)
    g.collect()
    with pytest.raises(DoubleDownError):
        g.guess(LOW)
    with pytest.raises(DoubleDownError):
        g.collect()


def test_payout_none_until_finished(scripted):
    g = fair_game("7S 9H", scripted=scripted)
    assert g.payout is None
    g.guess(HIGH)
    assert g.payout is None and g.outcome is HighLowOutcome.WIN_CONTINUE


def test_joker_wins_but_forces_end_without_bonus(scripted):
    g = fair_game("7S JKR", stake=10, main_bet=5, scripted=scripted)
    s = g.guess(LOW)
    assert s.won and s.outcome is HighLowOutcome.JOKER_END
    assert g.finished and g.amount == 20 and g.payout == 20 and g.bonus == 0
    assert g.bonus_hand is None
    with pytest.raises(DoubleDownError):
        g.guess(HIGH)


def test_joker_after_three_wins_has_no_bonus(scripted):
    g = fair_game("5S 9H 5D 9C JKR", stake=10, main_bet=5, scripted=scripted)
    g.guess(HIGH)
    g.guess(LOW)
    g.guess(HIGH)
    s = g.guess(HIGH)
    assert s.outcome is HighLowOutcome.JOKER_END
    assert g.payout == 160 and g.bonus == 0


def test_four_wins_x16_plus_bonus_spec_example(scripted):
    g = fair_game("5S 9H 5D 9C KS", stake=12, main_bet=5, scripted=scripted)
    for guess in (HIGH, LOW, HIGH):
        assert g.guess(guess).outcome is HighLowOutcome.WIN_CONTINUE
    s = g.guess(HIGH)
    assert s.outcome is HighLowOutcome.COMPLETED and s.finished
    assert g.amount == 192
    assert g.bonus_hand is HighLowBonus.TWO_PAIR
    assert g.bonus == 100
    assert g.payout == 292 and s.payout == 292
    assert g.rounds_won == 4


def test_four_wins_no_bonus_hand(scripted):
    g = fair_game("2S 4H 6D 8C 10S", stake=10, main_bet=5, scripted=scripted)
    for _ in range(4):
        s = g.guess(HIGH)
    assert s.outcome is HighLowOutcome.COMPLETED
    assert g.bonus_hand is HighLowBonus.NONE
    assert g.bonus == 0 and g.payout == 160


def test_auto_settle_above_5000(scripted):
    g = fair_game("7S 9H 2D", stake=3000, scripted=scripted)
    s = g.guess(HIGH)
    assert s.outcome is HighLowOutcome.AUTO_SETTLED
    assert g.amount == 6000 and g.payout == 6000 and g.finished and g.bonus == 0


def test_no_auto_settle_at_exactly_5000(scripted):
    g = fair_game("7S 9H 2D", stake=2500, scripted=scripted)
    s = g.guess(HIGH)
    assert s.outcome is HighLowOutcome.WIN_CONTINUE and g.amount == 5000
    s = g.guess(LOW)
    assert s.outcome is HighLowOutcome.AUTO_SETTLED and g.payout == 10000


def test_stake_5000_one_win_is_cap_10000(scripted):
    g = fair_game("7S 9H", stake=5000, scripted=scripted)
    assert g.guess(HIGH).outcome is HighLowOutcome.AUTO_SETTLED
    assert g.payout == 10000


def test_cap_applies_to_amount_plus_bonus(scripted):
    # raise max_amount_to_double so the game can reach 4 wins with a large stake
    cfg = FAIR.model_copy(update={"max_amount_to_double": 20000})
    g = HighLowGame(500, 5, cfg, scripted("5S 9H 5D 9C KS"))
    for guess in (HIGH, LOW, HIGH, HIGH):
        g.guess(guess)
    assert g.amount == 8000
    assert g.bonus == 100
    assert g.payout == 8100
    g = HighLowGame(600, 50, cfg, scripted("5S 9H 5D 9C KS"))
    for guess in (HIGH, LOW, HIGH, HIGH):
        g.guess(guess)
    assert g.amount == 9600 and g.bonus == 1000
    assert g.payout == 10000  # total capped


def test_cap_on_doubling_amount(scripted):
    cfg = FAIR.model_copy(update={"max_amount_to_double": 20000})
    g = HighLowGame(6000, 1, cfg, scripted("5S 9H"))
    g.guess(HIGH)
    assert g.amount == 10000


def test_illegal_construction(scripted):
    for stake in (0, -1, 5001):
        with pytest.raises(DoubleDownError):
            HighLowGame(stake, 1, FAIR, scripted())
    with pytest.raises(DoubleDownError):
        HighLowGame(10, 0, FAIR, scripted())
    HighLowGame(1, 1, FAIR, scripted())
    HighLowGame(5000, 1, FAIR, scripted())


def test_fair_deck_never_repeats_cards():
    for seed in range(100):
        g = HighLowGame(1, 1, FAIR, random.Random(seed))
        while not g.finished:
            g.guess(HIGH)
        assert len(set(g.history)) == len(g.history)


# --- ARCADE ----------------------------------------------------------------


def test_arcade_ace_high_impossible_except_joker(scripted):
    # roll says win, but nothing beats an ace and the joker is the only winner
    g = HighLowGame(10, 1, ARCADE, scripted("AS", randoms=[0.0], choices="JKR"))
    s = g.guess(HIGH)
    assert s.outcome is HighLowOutcome.JOKER_END
    # joker removed from the deck: win roll must become a loss
    cfg = ARCADE.model_copy(update={"high_low_jokers": 0})
    g = HighLowGame(10, 1, cfg, scripted("AS", randoms=[0.0]))
    s = g.guess(HIGH)
    assert not s.won
    assert s.card.rank is not None and s.card.rank <= card("AS").rank


def test_arcade_two_low_impossible_without_joker(scripted):
    cfg = ARCADE.model_copy(update={"high_low_jokers": 0})
    g = HighLowGame(10, 1, cfg, scripted("2S", randoms=[0.0]))
    assert not g.guess(LOW).won


def test_arcade_forced_win_when_no_losers(scripted):
    # shrink the deck to nothing losing: base 2 HIGH after an lose roll with 2s..: construct via
    # deck of one joker: drawing 'lose' must become a win.
    cfg = ARCADE.model_copy(update={"high_low_jokers": 1})
    g = HighLowGame(10, 1, cfg, scripted("2S"))
    g._deck[:] = [card("JKR")]  # white-box: only a joker is left
    s = g.guess(HIGH)
    assert s.won and s.outcome is HighLowOutcome.JOKER_END


def test_arcade_win_roll_picks_only_winners(scripted):
    for seed in range(100):
        g = HighLowGame(10, 1, ARCADE, scripted("7S", randoms=[0.1], seed=seed))
        s = g.guess(HIGH)
        assert s.won
        assert s.card.is_joker or s.card.rank > card("7S").rank


def test_arcade_lose_roll_picks_only_losers(scripted):
    seen_equal = False
    for seed in range(200):
        g = HighLowGame(10, 1, ARCADE, scripted("7S", randoms=[0.9], seed=seed))
        s = g.guess(HIGH)
        assert not s.won
        assert s.card.rank <= card("7S").rank
        seen_equal |= s.card.rank == card("7S").rank
    assert seen_equal


def test_arcade_drawn_cards_removed_from_deck():
    for seed in range(100):
        g = HighLowGame(1, 1, ARCADE, random.Random(seed))
        while not g.finished:
            g.guess(LOW if g.base_card.rank and g.base_card.rank > 8 else HIGH)
        assert len(set(g.history)) == len(g.history)


def test_arcade_win_rate_mid_rank(scripted):
    n = 20000
    wins = 0
    rng = random.Random(42)
    for _ in range(n):
        g = HighLowGame(1, 1, ARCADE, _Front(rng, "7S"))
        wins += g.guess(HIGH).won
    assert abs(wins / n - 62 / 128) < 0.02
    wins = 0
    for _ in range(n):
        g = HighLowGame(1, 1, ARCADE, _Front(rng, "9D"))
        wins += g.guess(LOW).won
    assert abs(wins / n - 62 / 128) < 0.02


def test_fair_win_rate_base_7_high():
    # remaining deck: 53 cards. Winners: 8..A (7 ranks x 4 = 28) + 1 joker = 29.
    exact = 29 / 53
    n = 20000
    rng = random.Random(7)
    wins = sum(HighLowGame(1, 1, FAIR, _Front(rng, "7S")).guess(HIGH).won for _ in range(n))
    assert abs(wins / n - exact) < 0.02


class _Front:
    """Seeded shared rng that forces the given first card."""

    def __init__(self, rng: random.Random, first: str) -> None:
        self._rng = rng
        self._first = card(first)

    def random(self):
        return self._rng.random()

    def randrange(self, start, stop=None, step=1):
        return self._rng.randrange(start, stop, step)

    def choice(self, seq):
        return self._rng.choice(seq)

    def shuffle(self, x):
        self._rng.shuffle(x)
        x.remove(self._first)
        x.insert(0, self._first)
