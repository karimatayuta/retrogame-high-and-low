"""GameSession: the state machine that runs one player's game.

The presentation layer only does three things: send a command, draw ``view()``,
and play ``drain_events()``. Commands never raise: an invalid command emits a
``REJECTED`` event and leaves the state untouched (every command returns True when it
was accepted, False when rejected).

Phases (see ``.specs/session-design.md``)::

    BETTING --deal--> BETTING (no win) | FREE_GAME | DOUBLE_SELECT | BETTING (auto settle)
    FREE_GAME --advance x N--> DOUBLE_SELECT | BETTING (auto settle)
    DOUBLE_SELECT --hold/double--> STANDARD_PICK | RED_BLACK_PICK | HIGH_LOW_GUESS
    DOUBLE_SELECT --collect/TAKE SCORE--> BETTING
    STANDARD_PICK / RED_BLACK_PICK --pick--> DOUBLE_SELECT (win) | BETTING (lose)
    STANDARD_PICK --pick--> STANDARD_PICK (draw: new hand, must pick again)
    HIGH_LOW_GUESS --guess--> HIGH_LOW_GUESS (win) | BETTING (lose / finished)

Money rules in one place:
* ``bet_one`` / ``max_bet`` take medals from CREDITS at once.
* Free games cost nothing.
* Wins wait in ``win`` until ``collect`` / auto settlement moves them to CREDITS.
* Half double moves the kept half to CREDITS the moment the double game starts.
"""

from __future__ import annotations

import math
from collections import deque

from twinjokers.application.events import Event, EventKind
from twinjokers.application.save_data import SaveData, SaveRepository, Stats
from twinjokers.application.view import (
    CARD_SLOTS,
    BonusRowView,
    FreeGameAwardView,
    HighLowView,
    MenuItemView,
    PaytableRowView,
    SessionPhase,
    SessionView,
)
from twinjokers.domain.cards import Card, standard_deck
from twinjokers.domain.config import GameConfig
from twinjokers.domain.double_down.common import (
    apply_cap,
    can_double,
    can_half_double,
    must_auto_settle,
    split_half,
)
from twinjokers.domain.double_down.high_low import HighLowGame, HighLowOutcome, HighLowStep
from twinjokers.domain.double_down.red_black import RedBlackDouble
from twinjokers.domain.double_down.standard import StandardDouble, StandardOutcome
from twinjokers.domain.enums import (
    PROGRESSIVE_LINES,
    DoubleDownKind,
    DoubleDownMenuItem,
    FreeGameTrigger,
    HandRank,
    HighLowBonus,
    HighLowGuess,
    PayLine,
)
from twinjokers.domain.free_game import detect_free_game
from twinjokers.domain.hand import evaluate_hand
from twinjokers.domain.payout import Payout, settle_main_game
from twinjokers.domain.progressive import ProgressivePool
from twinjokers.domain.random_port import Randomizer

_MAX_QUEUED_EVENTS = 512  # a presentation that never drains must not leak memory


class GameSession:
    def __init__(
        self,
        config: GameConfig,
        rng: Randomizer,
        repository: SaveRepository | None = None,
    ) -> None:
        self._config = config
        self._rng = rng
        self._repository = repository
        self._events: deque[Event] = deque(maxlen=_MAX_QUEUED_EVENTS)

        saved = repository.load() if repository is not None else None
        if saved is not None:
            self._credits = saved.credits
            # tampered / hand-edited save data must never crash the start-up:
            # keep only valid counters (a progressive line, a finite number)
            usable = {
                line: value
                for line, value in saved.progressive.items()
                if line in PROGRESSIVE_LINES and math.isfinite(value)
            }
            self._pool = ProgressivePool(config.progressive, usable)
            self._stats = saved.stats.model_copy()
        else:
            self._credits = config.economy.initial_credits
            self._pool = ProgressivePool(config.progressive)
            self._stats = Stats()

        self._phase = SessionPhase.BETTING
        self._bet = 0  # pending bet (BETTING) or the bet of the running game
        self._last_bet = 0
        self._win = 0  # pending win; during a double game: the amount at risk
        self._last_payout = 0
        self._notice = ""  # short message that overrides the default one

        # what is drawn
        self._slots: list[Card | None] = [None] * CARD_SLOTS
        self._face_up: list[bool] = [False] * CARD_SLOTS
        self._highlight: int | None = None
        self._hand_rank: HandRank | None = None
        self._paid_line: PayLine | None = None
        self._game_payout = 0

        # free game
        self._fg_trigger: FreeGameTrigger | None = None
        self._fg_left = 0
        self._fg_played = 0
        self._fg_total = 0
        self._current_hand: tuple[Card, ...] = ()

        # double down
        self._half_double = False
        self._standard: StandardDouble | None = None
        self._red_black: RedBlackDouble | None = None
        self._high_low: HighLowGame | None = None
        self._draw_pending = False  # standard draw: collecting is not allowed

    # ------------------------------------------------------------------
    # queries
    # ------------------------------------------------------------------

    @property
    def phase(self) -> SessionPhase:
        return self._phase

    @property
    def stats(self) -> Stats:
        return self._stats.model_copy()

    def drain_events(self) -> list[Event]:
        """Return and clear everything that happened since the last call."""
        events = list(self._events)
        self._events.clear()
        return events

    # ------------------------------------------------------------------
    # commands
    # ------------------------------------------------------------------

    def bet_one(self) -> bool:
        """1 BET: take one more medal from CREDITS (BETTING only, up to MAX BET)."""
        if self._phase is not SessionPhase.BETTING:
            return self._reject("bet_one", "not betting")
        if self._bet >= self._config.bet.max_bet:
            return self._reject("bet_one", "already at max bet")
        if self._credits < 1:
            return self._reject("bet_one", "not enough credits")
        self._notice = ""
        self._take_bet(1)
        return True

    def max_bet(self) -> bool:
        """MAX BET: raise the bet to 5 (paying only what is missing) and deal at once."""
        if self._phase is not SessionPhase.BETTING:
            return self._reject("max_bet", "not betting")
        missing = self._config.bet.max_bet - self._bet
        if missing > self._credits:
            return self._reject("max_bet", "not enough credits")
        self._notice = ""
        if missing > 0:
            self._take_bet(missing)
        return self._start_main_game()

    def deal(self) -> bool:
        """DEAL: start a paid game. With no bet, bet the previous amount again if affordable."""
        if self._phase is not SessionPhase.BETTING:
            return self._reject("deal", "not betting")
        if self._bet == 0:
            if self._last_bet < 1 or self._last_bet > self._credits:
                return self._reject("deal", "no bet and cannot repeat the last bet")
            self._take_bet(self._last_bet)
        self._notice = ""
        return self._start_main_game()

    def advance(self) -> bool:
        """Play the next free game (FREE_GAME only; the presentation calls this on a timer)."""
        if self._phase is not SessionPhase.FREE_GAME:
            return self._reject("advance", "not in a free game")
        self._play_free_game()
        return True

    def hold(self, n: int) -> bool:
        """HOLD 1..5. Meaning depends on the phase (menu item / card pick / LOW-HIGH)."""
        if isinstance(n, bool) or not isinstance(n, int) or not 1 <= n <= 5:
            return self._reject("hold", f"no such HOLD button: {n!r}")
        if self._phase is SessionPhase.DOUBLE_SELECT:
            return self._select_menu_item(self._config.double_down.menu[n - 1])
        if self._phase in (SessionPhase.STANDARD_PICK, SessionPhase.RED_BLACK_PICK):
            return self._pick_card(n - 1)
        if self._phase is SessionPhase.HIGH_LOW_GUESS:
            dd = self._config.double_down
            if n == dd.high_low_low_hold:
                return self.guess(HighLowGuess.LOW)
            if n == dd.high_low_high_hold:
                return self.guess(HighLowGuess.HIGH)
            return self._reject("hold", "HOLD button unused in HIGH & LOW")
        return self._reject("hold", f"HOLD does nothing in {self._phase}")

    def double(self) -> bool:
        """DOUBLE: start the STANDARD double (DOUBLE_SELECT only)."""
        if self._phase is not SessionPhase.DOUBLE_SELECT:
            return self._reject("double", "nothing to double")
        return self._select_menu_item(DoubleDownMenuItem.STANDARD)

    def collect(self) -> bool:
        """COLLECT: move the pending win to CREDITS.

        Allowed in DOUBLE_SELECT, before the pick in STANDARD / RED & BLACK (not right
        after a standard DRAW: spec "ダブルダウン共通/スタンダード"), and in HIGH & LOW.
        """
        if self._phase is SessionPhase.DOUBLE_SELECT:
            return self._collect_pending()
        if self._phase in (SessionPhase.STANDARD_PICK, SessionPhase.RED_BLACK_PICK):
            if self._draw_pending:
                return self._reject("collect", "cannot collect after a draw")
            return self._collect_pending()
        if self._phase is SessionPhase.HIGH_LOW_GUESS:
            game = self._require_high_low()
            self._win = game.collect()
            return self._collect_pending()
        return self._reject("collect", f"nothing to collect in {self._phase}")

    def guess(self, guess: HighLowGuess) -> bool:
        """HIGH or LOW (HIGH_LOW_GUESS only)."""
        if self._phase is not SessionPhase.HIGH_LOW_GUESS:
            return self._reject("guess", "not in HIGH & LOW")
        if not isinstance(guess, HighLowGuess):
            return self._reject("guess", "unknown guess")
        game = self._require_high_low()
        step = game.guess(guess)
        self._after_high_low_step(game, step)
        return True

    def add_medals(self) -> bool:
        """Add the configured number of medals (BETTING only; replaces the coin slot)."""
        if self._phase is not SessionPhase.BETTING:
            return self._reject("add_medals", "not betting")
        amount = self._config.economy.add_medals_amount
        self._credits += amount
        self._emit(EventKind.CREDITS_ADDED, amount)
        self._save()
        return True

    # ------------------------------------------------------------------
    # betting and the paid main game
    # ------------------------------------------------------------------

    def _take_bet(self, amount: int) -> None:
        self._credits -= amount
        self._bet += amount
        self._emit(EventKind.BET, amount)

    def _start_main_game(self) -> bool:
        """Deal five cards for a paid game and evaluate them (spec: メインゲーム)."""
        bet = self._bet
        self._stats.games_played += 1
        self._stats.total_bet += bet
        self._emit(EventKind.DEAL, bet)
        self._high_low = None  # forget the previous HIGH & LOW result on screen
        if bet == self._config.bet.max_bet:
            # Counters grow before evaluation, so a win pays the value including this game.
            self._pool.add_max_bet_game()
        payout = self._deal_and_evaluate(free_game=False)

        trigger = detect_free_game(self._current_hand, self._config.free_game)
        self._win = payout.amount
        if trigger is not None:
            games = self._config.free_game.awards[trigger]
            self._fg_trigger = trigger
            self._fg_left = games
            self._fg_total = games
            self._fg_played = 0
            self._phase = SessionPhase.FREE_GAME
            self._emit(EventKind.FREE_GAME_AWARDED, games, trigger.value)
            return True
        self._fg_trigger = None
        self._fg_left = self._fg_total = self._fg_played = 0
        if payout.amount > 0:
            self._enter_win()
        else:
            self._emit(EventKind.NO_WIN)
            self._notice = "NO WIN"
            self._finish_game()
        return True

    def _deal_and_evaluate(self, *, free_game: bool) -> Payout:
        deck = standard_deck(self._config.main_deck_jokers)
        self._rng.shuffle(deck)
        hand = tuple(deck[:CARD_SLOTS])
        self._current_hand = hand
        self._slots = list(hand)
        self._face_up = [True] * CARD_SLOTS
        self._highlight = None
        rank = evaluate_hand(hand)
        payout = settle_main_game(rank, self._bet, self._pool, self._config, free_game=free_game)
        self._hand_rank = rank
        self._paid_line = payout.line
        self._game_payout = payout.amount
        self._emit(EventKind.HAND, payout.amount, rank.value)
        if payout.progressive_line is not None:
            self._emit(EventKind.PROGRESSIVE_WON, payout.amount, payout.progressive_line.value)
        return payout

    # ------------------------------------------------------------------
    # free game (spec: フリーゲーム)
    # ------------------------------------------------------------------

    def _play_free_game(self) -> None:
        """One free game: no bet, payout x2 (min BET), added to the pending win."""
        if self._config.progressive.increment_in_free_game and (
            self._bet == self._config.bet.max_bet
        ):
            self._pool.add_max_bet_game()
        payout = self._deal_and_evaluate(free_game=True)
        self._fg_left -= 1
        self._fg_played += 1
        self._stats.free_games_played += 1
        self._win = apply_cap(self._win + payout.amount, self._config.double_down)
        self._emit(EventKind.FREE_GAME_STEP, payout.amount)
        trigger = detect_free_game(self._current_hand, self._config.free_game)
        if trigger is not None:  # retrigger: games are added
            games = self._config.free_game.awards[trigger]
            self._fg_left += games
            self._fg_total += games
            self._emit(EventKind.FREE_GAME_AWARDED, games, trigger.value)
        if self._fg_left > 0:
            return
        self._emit(EventKind.FREE_GAME_END, self._win)
        if self._win > 0:
            self._enter_win()
        else:  # only possible if the min-payout rule is switched off in the config
            self._finish_game()

    # ------------------------------------------------------------------
    # pending win -> double down menu / settlement
    # ------------------------------------------------------------------

    def _enter_win(self) -> None:
        """A win exists: cap it, auto settle above 5000, else open the double down menu."""
        self._win = apply_cap(self._win, self._config.double_down)
        self._half_double = False
        self._standard = None
        self._red_black = None
        self._draw_pending = False
        if must_auto_settle(self._win, self._config.double_down):
            self._settle(self._win, EventKind.AUTO_SETTLED)
        else:
            self._phase = SessionPhase.DOUBLE_SELECT

    def _collect_pending(self) -> bool:
        self._settle(self._win, EventKind.COLLECT)
        return True

    def _settle(self, amount: int, kind: EventKind) -> None:
        """Move ``amount`` to CREDITS, record it, save and go back to BETTING."""
        self._credit(amount)
        self._last_payout = amount
        self._emit(kind, amount)
        self._notice = "YOU WIN"
        self._finish_game()

    def _credit(self, amount: int) -> None:
        self._credits += amount
        self._stats.total_won += amount
        self._stats.biggest_win = max(self._stats.biggest_win, amount)

    def _finish_game(self) -> None:
        """Back to BETTING: the game's bet is spent, the pending win is gone."""
        self._last_bet = self._bet or self._last_bet
        self._bet = 0
        self._win = 0
        self._half_double = False
        self._draw_pending = False
        self._standard = None
        self._red_black = None
        # the HIGH & LOW object stays so the screen can show its bonus result
        self._phase = SessionPhase.BETTING
        self._save()

    def _lose(self) -> None:
        self._last_payout = 0
        self._notice = "YOU LOSE"
        self._finish_game()

    def _clear_double_games(self) -> None:
        self._standard = None
        self._red_black = None
        self._high_low = None
        self._draw_pending = False

    # ------------------------------------------------------------------
    # double down menu
    # ------------------------------------------------------------------

    def _item_enabled(self, item: DoubleDownMenuItem) -> bool:
        dd = self._config.double_down
        if item is DoubleDownMenuItem.TAKE_SCORE:
            return True
        if item is DoubleDownMenuItem.HALF_DOUBLE:
            return can_half_double(self._win, dd)
        if not can_double(self._win, dd):
            return False
        if item is DoubleDownMenuItem.HIGH_LOW:
            return not self._half_double or dd.half_double_allowed_in_high_low
        return True

    def _select_menu_item(self, item: DoubleDownMenuItem) -> bool:
        if not self._item_enabled(item):
            return self._reject("hold", f"{item.value} is not available")
        if item is DoubleDownMenuItem.TAKE_SCORE:
            return self._collect_pending()
        if item is DoubleDownMenuItem.HALF_DOUBLE:
            self._half_double = not self._half_double
            self._emit(EventKind.HALF_DOUBLE_TOGGLED, 0, "ON" if self._half_double else "OFF")
            return True
        stake = self._begin_stake()
        dd = self._config.double_down
        if item is DoubleDownMenuItem.STANDARD:
            self._standard = StandardDouble(stake, dd, self._rng)
            self._phase = SessionPhase.STANDARD_PICK
            self._show_dealer(self._standard.dealer_card)
            kind = DoubleDownKind.STANDARD
        elif item is DoubleDownMenuItem.RED_BLACK:
            self._red_black = RedBlackDouble(stake, dd, self._rng)
            self._phase = SessionPhase.RED_BLACK_PICK
            self._show_dealer(self._red_black.dealer_card)
            kind = DoubleDownKind.RED_BLACK
        else:
            self._high_low = HighLowGame(stake, self._bet, dd, self._rng)
            self._phase = SessionPhase.HIGH_LOW_GUESS
            self._show_high_low(self._high_low)
            kind = DoubleDownKind.HIGH_LOW
        self._emit(EventKind.DOUBLE_START, stake, kind.value)
        return True

    def _begin_stake(self) -> int:
        """Half double: the kept half goes to CREDITS now; the rest is the stake."""
        stake = self._win
        if self._half_double:
            kept, stake = split_half(self._win)
            self._credit(kept)
            self._save()
        self._win = stake
        self._half_double = False
        self._clear_double_games()
        self._notice = ""
        self._highlight = None
        return stake

    def _show_dealer(self, dealer: Card) -> None:
        self._slots = [dealer, None, None, None, None]
        self._face_up = [True, False, False, False, False]

    # ------------------------------------------------------------------
    # STANDARD / RED & BLACK
    # ------------------------------------------------------------------

    def _pick_card(self, index: int) -> bool:
        if index < 1:
            return self._reject("hold", "HOLD 1 is the dealer card")
        if self._phase is SessionPhase.STANDARD_PICK:
            assert self._standard is not None
            return self._pick_standard(self._standard, index)
        assert self._red_black is not None
        return self._pick_red_black(self._red_black, index)

    def _reveal(self, cards: tuple[Card, ...], index: int) -> None:
        self._slots = list(cards)
        self._face_up = [True] * CARD_SLOTS
        self._highlight = index

    def _pick_standard(self, game: StandardDouble, index: int) -> bool:
        """Beat the dealer. DRAW: redeal and pick again, no collect (spec: スタンダード)."""
        result = game.pick(index)
        self._reveal(result.cards, index)
        self._notice = ""
        if result.outcome is StandardOutcome.DRAW:
            game.redeal()
            self._draw_pending = True
            self._emit(EventKind.DOUBLE_DRAW, 0, "", index, result.cards)
            # the revealed draw stays in the event; the view shows the fresh hand
            self._show_dealer(game.dealer_card)
            self._highlight = None
            self._notice = "DRAW - PICK AGAIN"
        elif result.outcome is StandardOutcome.WIN:
            self._double_won(result.payout, result.cards)
        else:
            self._double_lost(result.cards)
        return True

    def _pick_red_black(self, game: RedBlackDouble, index: int) -> bool:
        result = game.pick(index)
        self._reveal(result.cards, index)
        self._notice = ""
        if result.won:
            self._double_won(result.payout, result.cards)
        else:
            self._double_lost(result.cards)
        return True

    def _double_won(self, payout: int, cards: tuple[Card, ...]) -> None:
        self._win = payout
        self._emit(EventKind.DOUBLE_WIN, payout, "", -1, cards)
        self._enter_win()

    def _double_lost(self, cards: tuple[Card, ...]) -> None:
        self._emit(EventKind.DOUBLE_LOSE, 0, "", -1, cards)
        self._lose()

    # ------------------------------------------------------------------
    # HIGH & LOW (spec: HIGH & LOW)
    # ------------------------------------------------------------------

    def _require_high_low(self) -> HighLowGame:
        assert self._high_low is not None
        return self._high_low

    def _show_high_low(self, game: HighLowGame) -> None:
        history = game.history
        self._slots = [*history, *([None] * (CARD_SLOTS - len(history)))]
        self._face_up = [i < len(history) for i in range(CARD_SLOTS)]
        self._highlight = len(history) - 1

    def _after_high_low_step(self, game: HighLowGame, step: HighLowStep) -> None:
        self._show_high_low(game)
        self._notice = ""
        self._emit(
            EventKind.HIGH_LOW_STEP,
            step.amount,
            step.guess.value,
            len(game.history) - 1,
            (step.card,),
        )
        outcome = step.outcome
        if outcome is HighLowOutcome.LOSE:
            self._win = 0
            self._emit(EventKind.DOUBLE_LOSE, 0, "", len(game.history) - 1, (step.card,))
            self._lose()
            return
        if not step.finished:
            self._win = step.amount
            self._emit(EventKind.DOUBLE_WIN, step.amount)
            return
        # finished by a win: pay automatically
        assert step.payout is not None
        if outcome is HighLowOutcome.JOKER_END:
            self._emit(EventKind.JOKER)
        elif outcome is HighLowOutcome.COMPLETED:
            assert step.bonus_hand is not None
            self._emit(EventKind.HIGH_LOW_BONUS, step.bonus, step.bonus_hand.value)
        self._settle(step.payout, EventKind.AUTO_SETTLED)
        if outcome is HighLowOutcome.JOKER_END:
            self._notice = "JOKER!"

    # ------------------------------------------------------------------
    # events, saving, rejection
    # ------------------------------------------------------------------

    def _emit(
        self,
        kind: EventKind,
        amount: int = 0,
        detail: str = "",
        index: int = -1,
        cards: tuple[Card, ...] = (),
    ) -> None:
        self._events.append(Event(kind, amount, detail, index, cards))

    def _reject(self, command: str, reason: str) -> bool:
        self._emit(EventKind.REJECTED, 0, f"{command}: {reason}")
        return False

    def _save(self) -> None:
        if self._repository is None:
            return
        data = SaveData(
            credits=self._credits,
            progressive=self._pool.snapshot(),
            stats=self._stats.model_copy(),
        )
        self._repository.save(data)  # False (failure) is ignored: the game runs without saving

    # ------------------------------------------------------------------
    # view
    # ------------------------------------------------------------------

    def view(self) -> SessionView:
        """A snapshot with everything the screen needs to draw."""
        in_fg = self._phase is SessionPhase.FREE_GAME
        return SessionView(
            phase=self._phase,
            message=self._message(),
            credits=self._credits,
            bet=self._bet,
            last_bet=self._last_bet,
            max_bet=self._config.bet.max_bet,
            win=self._win,
            last_payout=self._last_payout,
            cards=tuple(self._slots),
            face_up=tuple(self._face_up),
            highlight=self._highlight,
            hand_rank=self._hand_rank,
            paid_line=self._paid_line,
            game_payout=self._game_payout,
            in_free_game=in_fg,
            free_game_trigger=self._fg_trigger.value if self._fg_trigger else None,
            free_games_left=self._fg_left,
            free_games_played=self._fg_played,
            free_game_total=self._fg_total,
            free_game_win=self._win if in_fg else 0,
            paytable=self._paytable_rows(in_fg),
            progressive=self._progressive_display(),
            free_game_awards=tuple(
                FreeGameAwardView(label=t.value, games=n)
                for t, n in self._config.free_game.awards.items()
            ),
            double_kind=self._double_kind(),
            half_double=self._half_double,
            menu=self._menu_view(),
            high_low=self._high_low_view(),
            hold_labels=self._hold_labels(),
            can_collect=self._can_collect(),
        )

    def _message(self) -> str:
        phase = self._phase
        if phase is SessionPhase.FREE_GAME:
            return f"FREE GAME {self._fg_played}/{self._fg_total}"
        if phase is SessionPhase.DOUBLE_SELECT:
            return "DOUBLE UP?"
        if phase in (SessionPhase.STANDARD_PICK, SessionPhase.RED_BLACK_PICK):
            return self._notice or "PICK A CARD"
        if phase is SessionPhase.HIGH_LOW_GUESS:
            return self._notice or "HIGH OR LOW?"
        if self._notice:
            return self._notice
        if self._bet > 0:
            return "PRESS DEAL"
        if self._credits < 1:
            return "NO CREDITS - ADD MEDALS"
        return "PLACE YOUR BET"

    def _can_collect(self) -> bool:
        if self._phase in (SessionPhase.DOUBLE_SELECT, SessionPhase.HIGH_LOW_GUESS):
            return True
        if self._phase in (SessionPhase.STANDARD_PICK, SessionPhase.RED_BLACK_PICK):
            return not self._draw_pending
        return False

    def _double_kind(self) -> DoubleDownKind | None:
        return {
            SessionPhase.STANDARD_PICK: DoubleDownKind.STANDARD,
            SessionPhase.RED_BLACK_PICK: DoubleDownKind.RED_BLACK,
            SessionPhase.HIGH_LOW_GUESS: DoubleDownKind.HIGH_LOW,
        }.get(self._phase)

    def _menu_view(self) -> tuple[MenuItemView, ...]:
        if self._phase is not SessionPhase.DOUBLE_SELECT:
            return ()
        return tuple(
            MenuItemView(
                item=item,
                label=item.value,
                enabled=self._item_enabled(item),
                selected=item is DoubleDownMenuItem.HALF_DOUBLE and self._half_double,
            )
            for item in self._config.double_down.menu
        )

    def _hold_labels(self) -> tuple[str, ...]:
        dd = self._config.double_down
        if self._phase is SessionPhase.DOUBLE_SELECT:
            return tuple(item.value for item in dd.menu)
        if self._phase in (SessionPhase.STANDARD_PICK, SessionPhase.RED_BLACK_PICK):
            return ("", "PICK", "PICK", "PICK", "PICK")
        if self._phase is SessionPhase.HIGH_LOW_GUESS:
            labels = [""] * 5
            labels[dd.high_low_low_hold - 1] = "LOW"
            labels[dd.high_low_high_hold - 1] = "HIGH"
            return tuple(labels)
        return ("",) * 5

    def _progressive_display(self) -> dict[PayLine, int]:
        return {line: self._pool.display_value(line) for line in PROGRESSIVE_LINES}

    def _paytable_rows(self, in_free_game: bool) -> tuple[PaytableRowView, ...]:
        """Pay table priced for the bet on screen (x2 during free games)."""
        cfg = self._config
        bet = self._bet or self._last_bet or cfg.bet.min_bet
        at_max = bet == cfg.bet.max_bet
        factor = cfg.free_game.payout_multiplier if in_free_game else 1
        rows: list[PaytableRowView] = []
        for line in PayLine:
            progressive = at_max and line in PROGRESSIVE_LINES
            if progressive:
                payout = self._pool.display_value(line)
            elif at_max:
                payout = cfg.paytable.max_bet_payouts[line]
            else:
                payout = bet * cfg.paytable.multipliers[line]
            rows.append(
                PaytableRowView(
                    line=line,
                    label=line.value,
                    payout=payout * factor,
                    progressive=progressive,
                    hit=line is self._paid_line,
                )
            )
        return tuple(rows)

    def _high_low_view(self) -> HighLowView | None:
        game = self._high_low
        if game is None:
            return None
        dd = self._config.double_down
        rows = tuple(
            BonusRowView(label=hand.value, multiplier=mult, amount=game.main_bet * mult)
            for hand, mult in dd.high_low_bonus.items()
            if hand is not HighLowBonus.NONE
        )
        return HighLowView(
            active=self._phase is SessionPhase.HIGH_LOW_GUESS,
            rounds_won=game.rounds_won,
            rounds_total=dd.high_low_rounds,
            current_amount=game.amount,
            next_amount=apply_cap(game.amount * 2, dd),
            bonus_rows=rows,
            bonus_hand=game.bonus_hand.value if game.bonus_hand else None,
            bonus_amount=game.bonus,
            outcome=game.outcome.value if game.outcome else None,
        )
