"""GameApp: the Pyxel application (input -> session commands -> animated drawing).

Responsibilities: send commands to :class:`GameSession`, draw ``view()``, and play the
session's events as timed animations/sounds. The session itself is instantaneous, so this
class keeps *display state* (card row animation, coin counters, banners) separate and locks
game commands while a sequence plays (a Space / click press skips the animation instead).
"""

from __future__ import annotations

import atexit
from collections import deque
from pathlib import Path

import pyxel

from twinjokers.application.events import Event, EventKind
from twinjokers.application.session import GameSession
from twinjokers.application.view import SessionPhase, SessionView
from twinjokers.domain.enums import HighLowGuess
from twinjokers.presentation import effects, layout, panels, sound
from twinjokers.presentation import palette as pal
from twinjokers.presentation.autoplay import Driver, ScriptDriver
from twinjokers.presentation.capture import save_screen_png
from twinjokers.presentation.card_row import CardRow
from twinjokers.presentation.input import (
    ALL_BUTTONS,
    UI_ACTIONS,
    Action,
    Button,
    Command,
    hit_test,
    poll,
)
from twinjokers.presentation.stages import (
    FREE_GAME_PAUSE,
    Stage,
    is_sequence,
    plan_stages,
    targets_from_view,
)

TITLE = "FREE DEAL TWIN JOKERS"
FPS = 60
CELEBRATE_FRAMES = 150


class GameApp:
    def __init__(
        self,
        session: GameSession,
        *,
        driver: Driver | None = None,
        autoquit_frames: int = 0,
        screenshot: str | None = None,
        shot_dir: str | None = None,
        headless: bool = False,
        scanlines: bool = True,
        muted: bool = False,
    ) -> None:
        # resolve now: pyxel may change the working directory
        self.screenshot = str(Path(screenshot).resolve()) if screenshot else None
        self.shot_dir = Path(shot_dir or ".qa").resolve()
        pyxel.init(
            layout.W,
            layout.H,
            title=TITLE,
            fps=FPS,
            quit_key=pyxel.KEY_NONE,  # Esc is handled here so a pending win is collected
            headless=headless,
        )
        pal.apply_palette()
        pyxel.mouse(True)
        sound.setup_sounds()
        sound.set_muted(muted)
        sound.start_bgm()

        self.session = session
        self.driver = driver
        self.headless = headless
        self.autoquit_frames = autoquit_frames
        self.scene_name = ""
        self.scanlines = effects.ScanlineOverlay(enabled=scanlines)
        self.flash = effects.ScreenFlash()

        self.frame = 0
        self.view: SessionView = session.view()
        self.row = CardRow()
        self.row.start(targets_from_view(self.view), self.view.highlight, 0)
        self.row.finish()
        self.credits = effects.CoinCounter()
        self.credits.set(self.view.credits)
        self.win = effects.CoinCounter()
        self.win.set(self.view.win)
        self._credits_target = self.view.credits
        self._win_target = self.view.win

        self.stages: deque[Stage] = deque()
        self.cur: Stage | None = None
        self._cur_state = ""  # "cards" | "hold"
        self._hold_until = 0
        self._banner_start = 0
        self._pending_reveal = 0
        self.fg_ready_at: int | None = None
        self.celebrate_until = 0
        self.pressed: Button | None = None
        self.press_frames = 0
        self.last_input_frame = 0
        self._pending_shot: str | None = None
        self._quit_requested = False
        self._closed = False
        atexit.register(self.settle_pending_win)

    # ------------------------------------------------------------------ run

    def run(self) -> None:
        if self.headless:
            # headless pyxel.run() is paced in real time; step the frames ourselves
            frames = self.autoquit_frames or 600
            for _ in range(frames):
                self.update()
                self.draw()
            self.quit()
        else:
            pyxel.run(self.update, self.draw)

    # ------------------------------------------------------------------ state

    @property
    def counting(self) -> bool:
        return not (self.credits.done and self.win.done)

    @property
    def busy(self) -> bool:
        return self.cur is not None or bool(self.stages) or self.row.busy or self.counting

    @property
    def masked(self) -> bool:
        """Results (hand name, WIN, menu ...) stay hidden until the cards are revealed."""
        return self._pending_reveal > 0

    # ------------------------------------------------------------------ update

    def update(self) -> None:
        self.frame += 1
        f = self.frame
        if self.press_frames > 0:
            self.press_frames -= 1

        commands = poll()
        if self.driver is not None:
            commands += self.driver.poll(self.view, self.busy, f)
            if isinstance(self.driver, ScriptDriver) and self.driver.quit_requested:
                self._quit_requested = True
            self._pending_shot = self._pending_shot or (
                self.driver.shot_requests.pop(0) if self.driver.shot_requests else None
            )
        for cmd in commands:
            self.dispatch(cmd)

        self._update_stages()
        self._update_counters()
        self._update_free_game()
        self.row.update(f, sound.play)
        self.flash.update()

    def dispatch(self, cmd: Command) -> bool:
        """Run one command (keyboard, button or bot). Returns True if the session accepted it."""
        act = cmd.action
        if act in UI_ACTIONS:
            if act is Action.SCANLINES:
                self.scanlines.toggle()
            elif act is Action.MUTE:
                sound.set_muted(not sound.is_muted())
            else:
                self._quit_requested = True
            return False
        self.last_input_frame = self.frame
        phase = self.view.phase
        if phase is SessionPhase.FREE_GAME:
            # free games run by themselves; DEAL (Space) only skips the waiting/animation
            if act is Action.DEAL:
                self._skip()
            return False
        if self.busy:
            if act is Action.DEAL:  # Space / tap: fast-forward the running animation
                self._skip()
            return False
        session = self.session
        ok = True
        if act is Action.BET:
            ok = session.bet_one()
        elif act is Action.MAX_BET:
            ok = session.max_bet()
        elif act is Action.DEAL:
            ok = session.double() if phase is SessionPhase.DOUBLE_SELECT else session.deal()
        elif act is Action.COLLECT:
            ok = session.collect()
        elif act is Action.HOLD:
            ok = session.hold(cmd.arg)
        elif act is Action.HIGH:
            ok = session.guess(HighLowGuess.HIGH)
        elif act is Action.LOW:
            ok = session.guess(HighLowGuess.LOW)
        elif act is Action.ADD_MEDALS:
            ok = session.add_medals()
        self._ingest()
        return ok

    def _skip(self) -> None:
        """Fast-forward: finish the card animation, banners, and counters."""
        self.row.finish()
        self.credits.finish()
        self.win.finish()
        self.fg_ready_at = self.frame
        while self.stages or self.cur is not None:
            if self.cur is None:
                self._begin_stage(self.stages.popleft())
            self._end_stage()
        sound.stop_all_sfx()

    # ------------------------------------------------------------------ events -> stages

    def _ingest(self) -> None:
        """Read the session's events and view after a command."""
        events = self.session.drain_events()
        self.view = self.session.view()
        self._immediate_sounds(events)
        self._retarget_credits_down()
        if not is_sequence(events):
            self._sync_static()
            return
        stages = plan_stages(events, self.view)
        self._pending_reveal += sum(1 for s in stages if s.reveal)
        self.stages.extend(stages)
        if self.view.phase is SessionPhase.FREE_GAME:
            self.fg_ready_at = None

    def _immediate_sounds(self, events: list[Event]) -> None:
        for e in events:
            if e.kind is EventKind.BET or e.kind is EventKind.CREDITS_ADDED:
                sound.play(sound.Sfx.BET)
            elif e.kind in (EventKind.REJECTED, EventKind.HALF_DOUBLE_TOGGLED):
                sound.play(sound.Sfx.BUTTON)

    def _sync_static(self) -> None:
        """No animation sequence: counters and cards follow the view directly."""
        if not self.stages and self.cur is None:
            self._retarget_counters()

    # ------------------------------------------------------------------ stages

    def _update_stages(self) -> None:
        f = self.frame
        if self.cur is None:
            if not self.stages:
                return
            self._begin_stage(self.stages.popleft())
        st = self.cur
        assert st is not None
        if self._cur_state == "cards" and not self.row.busy:
            self._cards_settled(st)
        if self._cur_state == "hold" and f >= self._hold_until:
            self._end_stage()

    def _begin_stage(self, st: Stage) -> None:
        self.cur = st
        self._cur_state = "cards"
        if st.targets is not None:
            self.row.start(st.targets, st.highlight, self.frame, fast=st.fast)
        # else: banner-only stage; cards settle at once

    def _cards_settled(self, st: Stage) -> None:
        self._cur_state = "hold"
        self._hold_until = self.frame + st.hold
        self._banner_start = self.frame
        if st.reveal:
            self._pending_reveal = max(0, self._pending_reveal - 1)
            if self._pending_reveal == 0:
                self._retarget_counters()
        if st.sfx is not None:
            sound.play(st.sfx)
        if st.flash is not None:
            self.flash.trigger(st.flash, 12)
        if st.celebrate:
            self.celebrate_until = self.frame + CELEBRATE_FRAMES

    def _end_stage(self) -> None:
        st = self.cur
        if st is None:
            return
        if self._cur_state == "cards" and st.reveal:  # skipped before the cards settled
            self._pending_reveal = max(0, self._pending_reveal - 1)
        self.cur = None
        self._cur_state = ""
        if not self.stages:
            self._pending_reveal = 0
            self._retarget_counters()
            self._after_sequence()

    def _after_sequence(self) -> None:
        if self.view.phase is SessionPhase.FREE_GAME and self.fg_ready_at is None:
            self.fg_ready_at = self.frame + FREE_GAME_PAUSE

    # ------------------------------------------------------------------ counters

    def _retarget_credits_down(self) -> None:
        """Betting takes medals at once (a quick count down)."""
        v = self.view.credits
        if v < self._credits_target:
            self.credits.start(self.credits.value, v, 6)
            self._credits_target = v
        elif v > self._credits_target and self.cur is None and not self.stages:
            self._retarget_counters()

    def _retarget_counters(self) -> None:
        v = self.view
        if v.credits != self._credits_target:
            frames = effects.count_up_frames(self.credits.value, v.credits, 3, 90)
            self.credits.start(self.credits.value, v.credits, max(12, frames))
            self._credits_target = v.credits
        if v.win != self._win_target:
            frames = effects.count_up_frames(self.win.value, v.win, 3, 90)
            self.win.start(self.win.value, v.win, max(10, frames))
            self._win_target = v.win

    def _update_counters(self) -> None:
        changed = self.credits.tick()
        changed = self.win.tick() or changed
        if changed and self.frame % 3 == 0:
            sound.play(sound.Sfx.COUNT_TICK)

    def _update_free_game(self) -> None:
        if self.view.phase is not SessionPhase.FREE_GAME or self.busy:
            return
        if self.fg_ready_at is None:
            self.fg_ready_at = self.frame + FREE_GAME_PAUSE
        if self.frame >= self.fg_ready_at:
            self.fg_ready_at = None
            self.session.advance()
            self._ingest()

    # ------------------------------------------------------------------ draw

    def _shown(self) -> SessionView:
        """The view as it should look right now (results hidden while cards are dealt)."""
        v = self.view
        if not self.masked:
            return v
        return v.model_copy(
            update={
                "hand_rank": None,
                "paid_line": None,
                "win": self.win.value,
                "message": "",
                "menu": (),
                "hold_labels": ("",) * 5,
                "can_collect": False,
                "paytable": tuple(r.model_copy(update={"hit": False}) for r in v.paytable),
                "high_low": v.high_low
                and v.high_low.model_copy(update={"bonus_hand": None, "active": False}),
            }
        )

    def draw(self) -> None:
        f = self.frame
        view = self._shown()
        pyxel.cls(pal.FELT_DARK)
        self._draw_background()
        celebrating = f < self.celebrate_until
        effects.draw_marquee(
            1, 1, layout.W - 2, layout.H - 2, f, spacing=6, speed=2 if celebrating else 6,
            blinking=True,
        )  # fmt: skip
        if view.phase is SessionPhase.HIGH_LOW_GUESS or (
            view.high_low is not None and view.high_low.bonus_hand is not None
        ):
            panels.draw_bonus_table(view, f)
        else:
            panels.draw_paytable(view, f)
        panels.draw_free_game_table(view)
        panels.draw_status_box(view, f)
        self.row.draw(f, layout.CARDS_X0, layout.CARDS_Y)
        idle = self.cur is None and not self.stages
        if idle and view.phase is SessionPhase.BETTING and view.bet == 0 and not self.row.has_cards:
            panels.draw_attract(f)
        panels.draw_hold_labels(view, f, self.pressed if self.press_frames > 0 else None)
        panels.draw_info(view, f, self.credits.value, self.win.value)
        panels.draw_strip(view, self.pressed, self.press_frames)
        if self.cur is not None and self.cur.banner is not None and self._cur_state == "hold":
            panels.draw_banner(self.cur.banner, f, f - self._banner_start)
        self.flash.draw()
        self.scanlines.draw()
        self._handle_pointer_feedback()
        self._end_of_frame()

    def _draw_background(self) -> None:
        # faint felt texture
        for y in range(4, layout.H - 4, 8):
            pyxel.line(4, y, layout.W - 5, y, pal.FELT_DARK)
        x, y, w, h = layout.CARDS_X0 - 12, layout.CARDS_Y - 4, 5 * 52 + 16, 70
        pyxel.rect(x, y, w, h, pal.FELT)
        pyxel.rectb(x, y, w, h, pal.FELT_LIGHT)

    def _handle_pointer_feedback(self) -> None:
        if pyxel.btnp(pyxel.MOUSE_BUTTON_LEFT):
            hit = hit_test(pyxel.mouse_x, pyxel.mouse_y)
            if hit is not None and hit in ALL_BUTTONS:
                self.pressed = hit
                self.press_frames = 6

    def _end_of_frame(self) -> None:
        if self._pending_shot is not None:
            name = self._pending_shot
            self._pending_shot = None
            save_screen_png(self.shot_dir / f"{self.scene_name or 'game'}_{name}.png", scale=2)
        if self.autoquit_frames and self.frame >= self.autoquit_frames:
            if self.screenshot:
                save_screen_png(self.screenshot, scale=2)
            self._quit_requested = True
        if self._quit_requested:
            self.quit()

    # ------------------------------------------------------------------ quit

    def settle_pending_win(self) -> None:
        """Collect a pending win so medals are not lost when the game is closed."""
        if self._closed:
            return
        self._closed = True
        session = self.session
        if session.phase in (
            SessionPhase.DOUBLE_SELECT,
            SessionPhase.STANDARD_PICK,
            SessionPhase.RED_BLACK_PICK,
            SessionPhase.HIGH_LOW_GUESS,
        ):
            session.collect()

    def quit(self) -> None:
        self.settle_pending_win()
        pyxel.quit()
