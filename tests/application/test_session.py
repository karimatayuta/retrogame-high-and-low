"""GameSession: phase transitions, money rules, rejection of invalid commands."""

from __future__ import annotations

import pytest
from session_helpers import (
    FIVE_KIND,
    FOUR_FACES_FIVE_KIND,
    FOUR_KIND,
    JOKER_ANYTHING,
    NOTHING,
    RB_WIN,
    ROYAL,
    STANDARD_WIN,
    THREE_BLACK_FACES,
    THREE_KIND,
    TWO_PAIR,
    FakeRepository,
    ledger_ok,
    make_config,
    make_session,
    play_to_win,
    session_in,
)

from twinjokers.application.events import EventKind
from twinjokers.application.save_data import SaveData, Stats
from twinjokers.application.view import SessionPhase as P
from twinjokers.domain.cards import card
from twinjokers.domain.enums import (
    DoubleDownKind,
    HandRank,
    HighLowGuess,
    PayLine,
)


def kinds(s) -> list[EventKind]:
    return [e.kind for e in s.drain_events()]


# --------------------------------------------------------------------------
# construction, saving, loading
# --------------------------------------------------------------------------


def test_new_session_uses_initial_credits_and_initial_progressive():
    s = make_session()
    v = s.view()
    assert (v.phase, v.credits, v.bet, v.win) == (P.BETTING, 1000, 0, 0)
    assert v.message == "PLACE YOUR BET"
    assert v.progressive[PayLine.FIVE_OF_A_KIND] == 2500
    assert v.cards == (None,) * 5


def test_load_restores_credits_progressive_and_stats():
    repo = FakeRepository(
        SaveData(
            credits=77,
            progressive={PayLine.ROYAL_FLUSH: 1300.5},
            stats=Stats(games_played=9),
        )
    )
    s = make_session(repo=repo)
    v = s.view()
    assert v.credits == 77
    assert v.progressive[PayLine.ROYAL_FLUSH] == 1301  # ceil
    assert s.stats.games_played == 9


def test_save_round_trip_after_a_paid_max_bet_game():
    repo = FakeRepository()
    s = make_session([NOTHING], repo=repo)
    assert s.max_bet()
    assert repo.data is not None
    assert repo.data.credits == 995
    assert repo.data.progressive[PayLine.FOUR_OR_FULL] == pytest.approx(40.24)
    assert repo.data.stats.games_played == 1 and repo.data.stats.total_bet == 5
    again = make_session(repo=repo)
    assert again.view().credits == 995
    assert again.view().progressive[PayLine.FLUSH_OR_STRAIGHT] == 33  # ceil(32.335)


def test_save_failure_does_not_break_the_game():
    repo = FakeRepository(fail=True)
    s = make_session([NOTHING], repo=repo)
    assert s.max_bet()
    assert s.view().credits == 995
    assert repo.saves == 1


def test_works_without_repository():
    s = make_session([NOTHING])
    assert s.max_bet()


def test_saves_after_every_settlement_kind():
    repo = FakeRepository()
    s = make_session([JOKER_ANYTHING], repo=repo)
    play_to_win(s, 4)
    n = repo.saves
    assert s.collect()
    assert repo.saves == n + 1 and repo.data.credits == 1000  # -4 +4
    s.add_medals()
    assert repo.saves == n + 2 and repo.data.credits == 1100


# --------------------------------------------------------------------------
# betting
# --------------------------------------------------------------------------


def test_bet_one_deducts_immediately_up_to_max():
    s = make_session()
    for i in range(1, 6):
        assert s.bet_one()
        assert (s.view().bet, s.view().credits) == (i, 1000 - i)
    assert not s.bet_one()  # already 5
    assert kinds(s).count(EventKind.REJECTED) == 1
    assert s.view().credits == 995


def test_bet_one_rejected_without_credits():
    s = make_session(config=make_config(credits=0))
    assert not s.bet_one()
    assert not s.deal()
    assert not s.max_bet()
    assert kinds(s) == [EventKind.REJECTED] * 3
    assert s.view().message == "NO CREDITS - ADD MEDALS"


def test_max_bet_only_deducts_the_missing_amount_and_deals():
    s = make_session([NOTHING])
    s.bet_one()
    s.bet_one()
    s.drain_events()
    assert s.max_bet()
    assert s.stats.total_bet == 5
    ev = s.drain_events()
    assert [e.amount for e in ev if e.kind is EventKind.BET] == [3]
    assert EventKind.DEAL in [e.kind for e in ev]
    assert s.view().credits == 995
    assert s.phase is P.BETTING  # no win


def test_max_bet_rejected_when_credits_do_not_cover_the_missing_part():
    s = make_session(config=make_config(credits=3))
    assert not s.max_bet()
    assert s.view().credits == 3 and s.view().bet == 0
    s.bet_one()
    s.bet_one()  # bet 2, credits 1 -> missing 3
    assert not s.max_bet()
    assert (s.view().bet, s.view().credits) == (2, 1)


def test_deal_with_no_bet_repeats_last_bet():
    s = make_session([NOTHING, NOTHING])
    play_to_win(s, 3)
    assert s.view().bet == 0 and s.view().last_bet == 3
    assert s.view().credits == 997
    assert s.deal()  # re-bets 3
    assert s.view().credits == 994
    assert s.stats.total_bet == 6


def test_deal_with_no_bet_and_no_history_is_rejected():
    s = make_session()
    assert not s.deal()
    assert s.view().credits == 1000


def test_deal_with_no_bet_and_too_few_credits_is_rejected():
    s = make_session([NOTHING], config=make_config(credits=5))
    s.max_bet()  # credits now 0, last bet 5
    assert not s.deal()
    assert s.view().credits == 0
    assert s.add_medals()
    assert s.deal()


def test_message_follows_bet():
    s = make_session()
    assert s.view().message == "PLACE YOUR BET"
    s.bet_one()
    assert s.view().message == "PRESS DEAL"


# --------------------------------------------------------------------------
# main game
# --------------------------------------------------------------------------


def test_no_win_returns_to_betting_and_keeps_cards_visible():
    s = make_session([NOTHING])
    play_to_win(s, 2)
    v = s.view()
    assert v.phase is P.BETTING and v.win == 0 and v.credits == 998
    assert v.hand_rank is HandRank.NOTHING and v.paid_line is None
    assert v.cards[0] == card("2S") and all(v.face_up)
    assert EventKind.NO_WIN in kinds(s)
    assert v.message == "NO WIN"


@pytest.mark.parametrize(
    ("hand", "bet", "expected", "line"),
    [
        (JOKER_ANYTHING, 1, 1, PayLine.JOKER_ANYTHING),
        (TWO_PAIR, 3, 6, PayLine.TWO_PAIR),
        (THREE_KIND, 4, 12, PayLine.THREE_OF_A_KIND),
        (FOUR_KIND, 2, 20, PayLine.FOUR_OR_FULL),
        (FOUR_KIND, 5, 41, PayLine.FOUR_OR_FULL),  # 40 + counter growth: ceil(40.24) = 41
        (TWO_PAIR, 5, 8, PayLine.TWO_PAIR),
    ],
)
def test_win_goes_to_double_select_with_paytable_payout(hand, bet, expected, line):
    s = make_session([hand])
    play_to_win(s, bet)
    v = s.view()
    assert v.phase is P.DOUBLE_SELECT
    assert v.win == expected and v.paid_line is line
    assert v.credits == 1000 - bet  # nothing is paid until collect
    assert v.message == "DOUBLE UP?"


def test_collect_pays_and_second_collect_is_rejected():
    s = make_session([TWO_PAIR])
    play_to_win(s, 3)
    assert s.collect()
    v = s.view()
    assert v.phase is P.BETTING and v.credits == 1003 and v.win == 0
    assert v.last_payout == 6
    assert not s.collect()
    assert s.view().credits == 1003
    assert s.stats.total_won == 6 and s.stats.biggest_win == 6


def test_royal_flush_at_max_bet_pays_the_progressive_counter_and_resets_it():
    s = make_session([ROYAL])
    s.max_bet()
    v = s.view()
    assert v.win == 1251  # ceil(1250.03)
    assert v.progressive[PayLine.ROYAL_FLUSH] == 1250  # reset
    assert v.progressive[PayLine.FIVE_OF_A_KIND] == 2501  # others kept growing
    ev = s.drain_events()
    assert any(e.kind is EventKind.PROGRESSIVE_WON and e.amount == 1251 for e in ev)


def test_progressive_grows_only_for_paid_max_bet_games():
    s = make_session([NOTHING, NOTHING, NOTHING])
    play_to_win(s, 4)
    assert s.view().progressive[PayLine.FIVE_OF_A_KIND] == 2500
    s.max_bet()
    assert s.view().progressive[PayLine.FIVE_OF_A_KIND] == 2501


def test_paytable_view_is_priced_for_current_bet():
    s = make_session()
    rows = {r.line: r for r in s.view().paytable}
    assert rows[PayLine.JOKER_ANYTHING].payout == 1  # nothing bet yet: shows 1 BET
    s.bet_one()
    s.bet_one()
    s.bet_one()
    rows = {r.line: r for r in s.view().paytable}
    assert rows[PayLine.TWO_PAIR].payout == 6
    assert not rows[PayLine.ROYAL_FLUSH].progressive
    for _ in range(2):
        s.bet_one()
    rows = {r.line: r for r in s.view().paytable}
    assert rows[PayLine.ROYAL_FLUSH].progressive and rows[PayLine.ROYAL_FLUSH].payout == 1250
    assert rows[PayLine.THREE_OF_A_KIND].payout == 12 and not rows[PayLine.TWO_PAIR].progressive
    assert len(rows) == len(PayLine)


def test_view_cards_are_real_card_objects():
    s = make_session([TWO_PAIR])
    play_to_win(s, 1)
    assert s.view().cards == tuple(card(t) for t in TWO_PAIR.split())


# --------------------------------------------------------------------------
# auto settlement and cap
# --------------------------------------------------------------------------


def test_win_over_5000_is_settled_automatically():
    s = make_session([FIVE_KIND], config=make_config(five_progressive=5000))
    s.max_bet()
    v = s.view()
    assert v.phase is P.BETTING and v.credits == 995 + 5001
    assert v.last_payout == 5001 and v.message == "YOU WIN"
    assert EventKind.AUTO_SETTLED in kinds(s)


def test_win_of_exactly_5000_can_still_be_doubled():
    s = make_session(
        [FIVE_KIND], config=make_config(five_progressive=4999.0)
    )  # counter 4999.05 -> 5000
    s.max_bet()
    assert s.view().win == 5000 and s.phase is P.DOUBLE_SELECT


def test_menu_flags_reflect_can_double():
    s = session_in(P.DOUBLE_SELECT)
    items = {m.item.value: m for m in s.view().menu}
    assert all(m.enabled for m in items.values())  # win = 4
    s = make_session([JOKER_ANYTHING])
    play_to_win(s, 1)  # win 1: half double impossible
    items = {m.item.value: m for m in s.view().menu}
    assert not items["HALF DOUBLE"].enabled
    assert items["STANDARD"].enabled and items["TAKE SCORE"].enabled
    assert [m.label for m in s.view().menu] == [
        "HALF DOUBLE",
        "STANDARD",
        "HIGH & LOW",
        "RED & BLACK",
        "TAKE SCORE",
    ]
    assert s.view().hold_labels == tuple(m.label for m in s.view().menu)


# --------------------------------------------------------------------------
# free game
# --------------------------------------------------------------------------


def test_free_game_runs_to_the_end_and_costs_nothing():
    s = make_session([THREE_BLACK_FACES])
    play_to_win(s, 2)
    v = s.view()
    assert v.phase is P.FREE_GAME and v.in_free_game
    assert (v.free_games_left, v.free_game_total, v.free_games_played) == (5, 5, 0)
    assert v.free_game_trigger == "3 R/B FACES"
    assert v.message == "FREE GAME 0/5"
    assert v.credits == 998
    assert [(a.label, a.games) for a in v.free_game_awards][-1] == ("3 R/B FACES", 5)
    # avoid triggers/retriggers: play and observe
    total = 0
    while s.phase is P.FREE_GAME:
        before = s.view().free_games_played
        assert s.advance()
        assert s.view().credits == 998 or s.phase is not P.FREE_GAME  # FG never costs
        total += 1
        assert before + 1 == s.view().free_games_played
        assert total < 1000
    assert s.stats.free_games_played == total
    assert s.stats.games_played == 1
    # each free game pays at least the bet (2): total >= 2 * games
    assert s.stats.total_won == 0  # nothing credited yet
    v = s.view()
    assert v.phase in (P.DOUBLE_SELECT, P.BETTING)
    assert v.win >= 2 * total or v.phase is P.BETTING


def test_free_game_trigger_game_payout_and_free_games_accumulate():
    # Trigger game: four of a kind + 4 faces? Use FOUR_FACES_FIVE_KIND at bet 1: 500.
    s = make_session([FOUR_FACES_FIVE_KIND, NOTHING, NOTHING, NOTHING])
    play_to_win(s, 1)
    v = s.view()
    assert v.phase is P.FREE_GAME and v.win == 500
    assert v.free_games_left == 10  # ANY 4 FACES (K K K K: 2 red 2 black)
    s.advance()
    # NOTHING hand: paid min payout = bet (1)
    assert s.view().win == 501 and s.view().free_games_left == 9
    ev = s.drain_events()
    assert [e.amount for e in ev if e.kind is EventKind.FREE_GAME_STEP] == [1]


def test_free_game_retrigger_adds_games():
    s = make_session([THREE_BLACK_FACES, NOTHING, THREE_BLACK_FACES], seed=3)
    play_to_win(s, 1)
    s.advance()  # NOTHING hand
    assert (s.view().free_games_left, s.view().free_game_total) == (4, 5)
    s.advance()  # retrigger: +5
    v = s.view()
    assert (v.free_games_left, v.free_game_total, v.free_games_played) == (8, 10, 2)
    assert any(e.kind is EventKind.FREE_GAME_AWARDED and e.amount == 5 for e in s.drain_events())
    assert v.message == "FREE GAME 2/10"


def test_free_game_payout_is_doubled_with_minimum_bet():
    s = make_session([THREE_BLACK_FACES, TWO_PAIR, NOTHING])
    play_to_win(s, 3)
    assert s.view().win == 0
    s.advance()
    assert s.view().win == 12  # two pair 3x2=6, doubled
    s.advance()
    assert s.view().win == 15  # min payout = bet 3


def test_free_game_does_not_increment_progressive_by_default():
    s = make_session([THREE_BLACK_FACES, NOTHING])
    s.max_bet()
    base = s.view().progressive[PayLine.FIVE_OF_A_KIND]
    s.advance()
    s.advance()
    assert s.view().progressive[PayLine.FIVE_OF_A_KIND] == base


def test_free_game_increments_progressive_when_configured():
    s = make_session(
        [THREE_BLACK_FACES, NOTHING], config=make_config(progressive_in_free_game=True)
    )
    s.max_bet()
    s.advance()
    assert s.view().progressive[PayLine.FLUSH_OR_STRAIGHT] == 33  # 32 + 2*.335 = 32.67 -> 33
    assert s.view().progressive[PayLine.FIVE_OF_A_KIND] == 2501


def test_free_game_win_is_capped_at_10000_then_auto_settled():
    five = FOUR_FACES_FIVE_KIND
    s = make_session([five, five, five], seed=1)
    s.max_bet()  # trigger game pays the counter (2501), 10 games
    assert s.view().win == 2501
    s.advance()  # 2 x 2500 -> 7501 (counter reset to 2500 after the first win)
    assert s.view().win == 7501
    s.advance()  # +5000 -> capped
    assert s.view().win == 10000
    s.drain_events()
    n = 0
    while s.phase is P.FREE_GAME:
        s.advance()
        n += 1
        assert n < 2000
    assert s.view().credits == 995 + 10000 and s.view().phase is P.BETTING
    ev = s.drain_events()
    assert [e.amount for e in ev if e.kind is EventKind.AUTO_SETTLED] == [10000]
    assert ledger_ok(s, 1000)


def test_free_game_over_5000_total_auto_settles_without_double():
    s = make_session([THREE_BLACK_FACES], seed=5)
    s.max_bet()
    while s.phase is P.FREE_GAME:
        s.advance()
    # either doubled-menu (<=5000) or settled; never a win > 5000 pending
    assert s.view().win <= 5000
    assert ledger_ok(s, 1000)


# --------------------------------------------------------------------------
# double down menu & half double
# --------------------------------------------------------------------------


def test_half_double_odd_amount_keeps_the_extra_medal_and_pays_at_once():
    s = make_session([THREE_KIND, STANDARD_WIN])
    play_to_win(s, 1)  # win 3
    assert s.view().credits == 999
    assert s.hold(1)  # HALF DOUBLE toggles
    assert s.view().half_double and s.view().menu[0].selected
    assert s.view().credits == 999  # not paid yet
    assert s.double()  # starts STANDARD with the stake
    v = s.view()
    assert v.credits == 999 + 2  # kept (2) goes to credits immediately
    assert v.win == 1 and v.phase is P.STANDARD_PICK and not v.half_double
    assert s.hold(2)  # win: stake 1 x 2
    assert s.view().win == 2 and s.view().phase is P.DOUBLE_SELECT
    assert s.collect()
    assert s.view().credits == 1003
    assert ledger_ok(s, 1000)


def test_half_double_loss_keeps_the_half():
    s = make_session([THREE_KIND, STANDARD_WIN])
    play_to_win(s, 1)
    s.hold(1)
    s.hold(2)  # STANDARD, half on
    assert s.hold(5)  # lose (2H < 5S)
    v = s.view()
    assert v.phase is P.BETTING and v.credits == 1001 and v.win == 0
    assert ledger_ok(s, 1000)


def test_half_double_toggle_twice_and_event():
    s = session_in(P.DOUBLE_SELECT)
    s.drain_events()
    s.hold(1)
    s.hold(1)
    ev = s.drain_events()
    assert [(e.kind, e.detail) for e in ev] == [
        (EventKind.HALF_DOUBLE_TOGGLED, "ON"),
        (EventKind.HALF_DOUBLE_TOGGLED, "OFF"),
    ]
    assert not s.view().half_double


def test_half_double_unavailable_for_a_win_of_one():
    s = make_session([JOKER_ANYTHING])
    play_to_win(s, 1)
    assert not s.hold(1)
    assert not s.view().half_double
    assert kinds(s)[-1] is EventKind.REJECTED


def test_half_double_disables_high_low_by_config():
    s = session_in(P.DOUBLE_SELECT)
    s.hold(1)
    menu = {m.item.value: m for m in s.view().menu}
    assert not menu["HIGH & LOW"].enabled and menu["STANDARD"].enabled
    assert not s.hold(3)
    assert s.phase is P.DOUBLE_SELECT
    s.hold(1)  # off again
    assert s.hold(3) and s.phase is P.HIGH_LOW_GUESS


def test_half_double_in_high_low_when_config_allows():
    s = make_session([JOKER_ANYTHING, "8S 9H 3D 4C 5C"], config=make_config(half_in_high_low=True))
    play_to_win(s, 4)
    s.hold(1)
    assert s.hold(3)
    assert s.view().credits == 996 + 2 and s.view().win == 2


def test_take_score_item_collects():
    s = session_in(P.DOUBLE_SELECT)
    assert s.hold(5)
    assert s.view().credits == 1000 and s.phase is P.BETTING


def test_half_double_on_then_take_score_pays_the_whole_amount():
    s = session_in(P.DOUBLE_SELECT)
    s.hold(1)
    s.hold(5)
    assert s.view().credits == 1000 and not s.view().half_double


# --------------------------------------------------------------------------
# STANDARD
# --------------------------------------------------------------------------


def test_standard_cards_hidden_until_pick_then_revealed():
    s = session_in(P.STANDARD_PICK)
    v = s.view()
    assert v.double_kind is DoubleDownKind.STANDARD
    assert v.cards == (card("5S"), None, None, None, None)
    assert v.face_up == (True, False, False, False, False)
    assert v.message == "PICK A CARD" and v.win == 4
    assert v.hold_labels == ("", "PICK", "PICK", "PICK", "PICK")
    assert v.can_collect


def test_standard_win_returns_to_double_select_with_doubled_amount():
    s = session_in(P.STANDARD_PICK)
    assert s.hold(2)
    v = s.view()
    assert v.phase is P.DOUBLE_SELECT and v.win == 8
    assert all(v.face_up) and v.highlight == 1
    assert v.cards == tuple(card(t) for t in STANDARD_WIN.split())
    assert s.collect() and s.view().credits == 1004
    assert ledger_ok(s, 1000)


def test_standard_chain_of_wins():
    s = make_session([JOKER_ANYTHING, STANDARD_WIN, STANDARD_WIN])
    play_to_win(s, 4)
    s.double()
    s.hold(2)
    s.double()
    s.hold(2)
    assert s.view().win == 16
    s.collect()
    assert s.view().credits == 1012


def test_standard_lose_goes_to_betting_with_cards_visible():
    s = session_in(P.STANDARD_PICK)
    assert s.hold(5)
    v = s.view()
    assert v.phase is P.BETTING and v.win == 0 and v.credits == 996
    assert v.message == "YOU LOSE" and all(v.face_up)
    assert v.cards[4] == card("2H")
    ev = s.drain_events()
    assert EventKind.DOUBLE_LOSE in [e.kind for e in ev]
    assert ledger_ok(s, 1000)


def test_standard_draw_redeals_and_cannot_collect():
    s = make_session([JOKER_ANYTHING, STANDARD_WIN, "7S 2D 9C 8H 3C"])
    play_to_win(s, 4)
    s.double()
    s.drain_events()
    assert s.hold(4)  # 5C == 5S: draw
    v = s.view()
    assert v.phase is P.STANDARD_PICK and v.message == "DRAW - PICK AGAIN"
    assert v.cards == (card("7S"), None, None, None, None)
    assert not v.can_collect
    ev = s.drain_events()
    draw = next(e for e in ev if e.kind is EventKind.DOUBLE_DRAW)
    assert draw.index == 3 and draw.cards == tuple(card(t) for t in STANDARD_WIN.split())
    assert not s.collect()
    assert s.view().win == 4 and s.phase is P.STANDARD_PICK
    assert s.hold(2)  # 2D < 7S: lose
    assert s.phase is P.BETTING


def test_standard_draw_then_win_allows_collect_again():
    s = make_session([JOKER_ANYTHING, STANDARD_WIN, "5S 6H 3D 4C 2H"])
    play_to_win(s, 4)
    s.double()
    assert s.hold(4)  # draw
    assert not s.view().can_collect
    assert s.hold(2)  # 6H beats 5S
    assert s.view().win == 8 and s.view().can_collect
    assert s.collect() and s.view().credits == 1004


def test_standard_collect_before_picking_returns_the_stake():
    s = session_in(P.STANDARD_PICK)
    assert s.collect()
    assert s.view().credits == 1000 and s.phase is P.BETTING


def test_standard_hold_1_is_rejected_dealer_card():
    s = session_in(P.STANDARD_PICK)
    assert not s.hold(1)
    assert s.phase is P.STANDARD_PICK


def test_standard_win_above_5000_auto_settles():
    # stake 3001 x 2 = 6002 > 5000
    s = make_session([FIVE_KIND, STANDARD_WIN], config=make_config(five_progressive=3000))
    s.max_bet()
    assert s.view().win == 3001
    s.double()
    s.hold(2)
    v = s.view()
    assert v.phase is P.BETTING and v.credits == 995 + 6002 and v.last_payout == 6002
    assert ledger_ok(s, 1000)


def test_standard_win_is_capped_at_10000():
    s = make_session([FIVE_KIND, STANDARD_WIN], config=make_config(five_progressive=4999.95))
    s.max_bet()  # win 5001? 4999.95 + .05 = 5000 -> 5000
    assert s.view().win == 5000
    s.double()
    s.hold(2)
    assert s.view().credits == 995 + 10000
    assert ledger_ok(s, 1000)


# --------------------------------------------------------------------------
# RED & BLACK
# --------------------------------------------------------------------------


def test_red_black_win_and_lose():
    s = session_in(P.RED_BLACK_PICK, RB_WIN)
    v = s.view()
    assert v.double_kind is DoubleDownKind.RED_BLACK and v.cards[0] == card("5S")
    assert s.hold(2)  # 9C is black like 5S
    assert s.view().win == 8 and s.phase is P.DOUBLE_SELECT
    s2 = session_in(P.RED_BLACK_PICK, RB_WIN)
    assert s2.hold(3)  # 3D red
    assert s2.phase is P.BETTING and s2.view().win == 0 and s2.view().message == "YOU LOSE"


def test_red_black_flush_bonus():
    s = make_session([JOKER_ANYTHING, "2S 4S 6S 8S 10S"])
    play_to_win(s, 4)
    s.hold(4)
    s.hold(2)
    assert s.view().win == 4 * 2 + 4 * 8
    assert s.collect() and s.view().credits == 1036
    assert ledger_ok(s, 1000)


# --------------------------------------------------------------------------
# HIGH & LOW
# --------------------------------------------------------------------------


def test_high_low_entry_view():
    s = session_in(P.HIGH_LOW_GUESS, "8S 9H 3D QC 2S")
    v = s.view()
    assert v.double_kind is DoubleDownKind.HIGH_LOW
    assert v.cards == (card("8S"), None, None, None, None)
    assert v.face_up == (True, False, False, False, False)
    assert v.message == "HIGH OR LOW?" and v.hold_labels == ("", "LOW", "", "HIGH", "")
    hl = v.high_low
    assert hl is not None and hl.active and hl.rounds_won == 0 and hl.rounds_total == 4
    assert hl.current_amount == 4 and hl.next_amount == 8
    assert hl.bonus_rows[0].label == "ROYAL FLUSH" and hl.bonus_rows[0].amount == 4 * 1000
    assert "NONE" not in [r.label for r in hl.bonus_rows]


def test_high_low_collect_before_first_guess():
    s = session_in(P.HIGH_LOW_GUESS, "8S 9H 3D QC 2S")
    assert s.collect()
    assert s.view().credits == 1000 and s.phase is P.BETTING


def test_high_low_lose():
    s = session_in(P.HIGH_LOW_GUESS, "8S 9H 3D QC 2S")
    assert s.hold(2)  # LOW: 9H is higher -> lose
    v = s.view()
    assert v.phase is P.BETTING and v.credits == 996 and v.win == 0
    assert v.message == "YOU LOSE" and v.cards[1] == card("9H")
    assert s.view().high_low.outcome == "LOSE"
    assert ledger_ok(s, 1000)


def test_high_low_win_continue_then_collect():
    s = session_in(P.HIGH_LOW_GUESS, "8S 9H 3D QC 2S")
    assert s.hold(4)  # HIGH: 9H > 8S
    v = s.view()
    assert v.phase is P.HIGH_LOW_GUESS and v.win == 8 and v.high_low.rounds_won == 1
    assert v.cards[:2] == (card("8S"), card("9H")) and v.face_up == (
        True,
        True,
        False,
        False,
        False,
    )
    assert v.highlight == 1
    assert s.guess(HighLowGuess.LOW)  # 3D < 9H: win
    assert s.view().win == 16
    assert s.collect()
    assert s.view().credits == 996 + 16 and s.phase is P.BETTING
    assert ledger_ok(s, 1000)


def test_high_low_four_wins_pays_16x_plus_bonus_automatically():
    s = session_in(P.HIGH_LOW_GUESS, "8S 9H 10D JC QS")  # straight (mixed suits): x50
    for _ in range(4):
        assert s.hold(4)
    v = s.view()
    assert v.phase is P.BETTING
    assert v.credits == 996 + 64 + 4 * 50
    assert v.high_low.bonus_hand == "STRAIGHT" and v.high_low.bonus_amount == 200
    assert v.high_low.outcome == "COMPLETED" and v.last_payout == 264
    ev = s.drain_events()
    assert any(e.kind is EventKind.HIGH_LOW_BONUS and e.amount == 200 for e in ev)
    assert any(e.kind is EventKind.AUTO_SETTLED and e.amount == 264 for e in ev)
    assert ledger_ok(s, 1000)


def test_high_low_joker_ends_game_with_win():
    s = session_in(P.HIGH_LOW_GUESS, "8S JKR 3D QC 2S")
    assert s.hold(2)  # LOW; joker always wins
    v = s.view()
    assert v.phase is P.BETTING and v.credits == 996 + 8 and v.message == "JOKER!"
    assert EventKind.JOKER in kinds(s)
    assert ledger_ok(s, 1000)


def test_high_low_win_above_5000_settles_automatically():
    s = make_session([FIVE_KIND, "8S 9H 3D QC 2S"], config=make_config(five_progressive=3000))
    s.max_bet()
    assert s.view().win == 3001
    s.hold(3)
    s.hold(4)
    v = s.view()
    assert v.phase is P.BETTING and v.credits == 995 + 6002
    assert v.high_low.outcome == "AUTO_SETTLED"
    assert ledger_ok(s, 1000)


def test_high_low_unused_hold_buttons_are_rejected():
    s = session_in(P.HIGH_LOW_GUESS)
    for n in (1, 3, 5):
        assert not s.hold(n)
    assert s.phase is P.HIGH_LOW_GUESS


def test_high_low_bonus_rows_use_the_main_game_bet():
    s = make_session([TWO_PAIR, "8S 9H 3D QC 2S"])
    play_to_win(s, 2)  # win 4
    s.hold(3)
    rows = {r.label: r for r in s.view().high_low.bonus_rows}
    assert rows["FULL HOUSE"].amount == 200


def test_new_deal_clears_the_previous_high_low_result():
    s = session_in(P.HIGH_LOW_GUESS, "8S 9H 3D QC 2S")
    s.hold(2)
    assert s.view().high_low is not None
    s.deal()
    assert s.view().high_low is None


# --------------------------------------------------------------------------
# rejection of invalid commands (never raises, state unchanged)
# --------------------------------------------------------------------------

ALL_COMMANDS = {
    "bet_one": lambda s: s.bet_one(),
    "max_bet": lambda s: s.max_bet(),
    "deal": lambda s: s.deal(),
    "advance": lambda s: s.advance(),
    "double": lambda s: s.double(),
    "collect": lambda s: s.collect(),
    "guess": lambda s: s.guess(HighLowGuess.HIGH),
    "add_medals": lambda s: s.add_medals(),
    "hold0": lambda s: s.hold(0),
    "hold6": lambda s: s.hold(6),
    "hold-1": lambda s: s.hold(-1),
    "hold_none": lambda s: s.hold(None),
    "hold_float": lambda s: s.hold(2.0),
    "hold_true": lambda s: s.hold(True),
    "hold1": lambda s: s.hold(1),
    "hold2": lambda s: s.hold(2),
    "hold3": lambda s: s.hold(3),
    "hold4": lambda s: s.hold(4),
    "hold5": lambda s: s.hold(5),
}

ACCEPTED = {
    P.BETTING: {"bet_one", "max_bet", "add_medals"},  # deal rejected: no bet and no history
    P.FREE_GAME: {"advance"},
    P.DOUBLE_SELECT: {"double", "collect", "hold1", "hold2", "hold3", "hold4", "hold5"},
    P.STANDARD_PICK: {"collect", "hold2", "hold3", "hold4", "hold5"},
    P.RED_BLACK_PICK: {"collect", "hold2", "hold3", "hold4", "hold5"},
    P.HIGH_LOW_GUESS: {"collect", "guess", "hold2", "hold4"},
}


@pytest.mark.parametrize("phase", list(P))
@pytest.mark.parametrize("command", list(ALL_COMMANDS))
def test_every_command_in_every_phase(phase, command):
    s = session_in(phase)
    before = s.view()
    s.drain_events()
    result = ALL_COMMANDS[command](s)  # must never raise
    ev = s.drain_events()
    if command in ACCEPTED[phase]:
        assert result is True
        assert EventKind.REJECTED not in [e.kind for e in ev]
    else:
        assert result is False
        assert [e.kind for e in ev] == [EventKind.REJECTED]
        assert s.view() == before


def test_rejection_event_has_a_reason():
    s = make_session()
    s.collect()
    (e,) = s.drain_events()
    assert e.kind is EventKind.REJECTED and "collect" in e.detail


def test_add_medals_adds_configured_amount():
    s = make_session()
    assert s.add_medals()
    assert s.view().credits == 1100
    assert kinds(s) == [EventKind.CREDITS_ADDED]
    assert ledger_ok(s, 1000, medals=100)


def test_bet_during_free_game_and_double_is_rejected_and_costs_nothing():
    for phase in (P.FREE_GAME, P.DOUBLE_SELECT, P.STANDARD_PICK):
        s = session_in(phase)
        c = s.view().credits
        assert not s.bet_one() and not s.max_bet() and not s.deal()
        assert s.view().credits == c


def test_event_queue_is_bounded_and_drain_clears():
    s = make_session()
    for _ in range(2000):
        s.collect()
    assert len(s.drain_events()) <= 512
    assert s.drain_events() == []
