"""Drawing of the fixed screen furniture: tables, hold labels, info rows, buttons, banners.

Everything here only reads a :class:`SessionView` (no rules).
"""

from __future__ import annotations

import pyxel

from twinjokers.application.view import SessionPhase, SessionView
from twinjokers.domain.enums import HandRank
from twinjokers.presentation import layout
from twinjokers.presentation import palette as pal
from twinjokers.presentation.input import Action, Button
from twinjokers.presentation.stages import Banner
from twinjokers.presentation.text import (
    blink,
    draw_big_text,
    draw_big_text_center,
    draw_big_text_right,
    draw_shadow_text,
    draw_text,
    draw_text_center,
    draw_text_right,
    text_width,
)

LEFT_X, LEFT_Y, LEFT_W, LEFT_H = 5, 5, 152, 82
RIGHT_X, RIGHT_Y, RIGHT_W = 163, 5, 152
ROW = 8


def money(n: int) -> str:
    return f"{n:,}"


def _panel(x: int, y: int, w: int, h: int, title: str, title_col: int = pal.CARD_FACE) -> None:
    pyxel.rect(x, y, w, h, pal.BG)
    pyxel.rectb(x, y, w, h, pal.FELT_LIGHT)
    pyxel.rect(x + 1, y + 1, w - 2, 9, pal.FELT)
    draw_text_center(x + w / 2, y + 3, title, title_col)


# ---------------------------------------------------------------- top-left tables


def draw_paytable(view: SessionView, frame: int) -> None:
    bet = view.bet or view.last_bet or 1
    _panel(LEFT_X, LEFT_Y, LEFT_W, LEFT_H, f"PAY TABLE   BET {bet}")
    y = LEFT_Y + 13
    for row in view.paytable:
        hit = row.hit and view.phase in (SessionPhase.FREE_GAME, SessionPhase.DOUBLE_SELECT)
        if hit and blink(frame, 20):
            pyxel.rect(LEFT_X + 2, y - 1, LEFT_W - 4, ROW, pal.ORANGE)
            label_col, value_col = pal.BLACK, pal.BLACK
        else:
            label_col = pal.TEXT
            value_col = pal.GOLD if row.progressive else pal.CARD_FACE
        draw_text(LEFT_X + 5, y, row.label, label_col)
        if row.progressive and not (hit and blink(frame, 20)):
            pyxel.rect(
                LEFT_X + LEFT_W - 41, y - 1, 3, 7, pal.CARD_RED if blink(frame, 40) else pal.ORANGE
            )
        draw_text_right(LEFT_X + LEFT_W - 5, y, money(row.payout), value_col)
        y += ROW


def draw_bonus_table(view: SessionView, frame: int) -> None:
    hl = view.high_low
    _panel(LEFT_X, LEFT_Y, LEFT_W, LEFT_H, "HIGH & LOW SPECIAL BONUS", pal.GOLD)
    y = LEFT_Y + 13
    if hl is None:
        return
    for row in hl.bonus_rows:
        hit = hl.bonus_hand == row.label
        if hit and blink(frame, 20):
            pyxel.rect(LEFT_X + 2, y - 1, LEFT_W - 4, ROW, pal.ORANGE)
            cols = (pal.BLACK, pal.BLACK, pal.BLACK)
        else:
            cols = (pal.TEXT, pal.GREY_LIGHT, pal.GOLD)
        draw_text(LEFT_X + 5, y, row.label, cols[0])
        draw_text_right(LEFT_X + LEFT_W - 50, y, f"x{row.multiplier}", cols[1])
        draw_text_right(LEFT_X + LEFT_W - 5, y, money(row.amount), cols[2])
        y += ROW


# ---------------------------------------------------------------- top-right


def draw_free_game_table(view: SessionView) -> None:
    h = 12 + ROW * len(view.free_game_awards) + 3
    _panel(RIGHT_X, RIGHT_Y, RIGHT_W, h, "FREE GAME BONUS")
    y = RIGHT_Y + 13
    for award in view.free_game_awards:
        hit = view.in_free_game and view.free_game_trigger == award.label
        draw_text(RIGHT_X + 6, y, award.label, pal.GOLD if hit else pal.TEXT)
        draw_text_right(RIGHT_X + RIGHT_W - 6, y, str(award.games), pal.CARD_FACE)
        y += ROW


def draw_status_box(view: SessionView, frame: int) -> None:
    """Under the free game table: note, free game counter, or HIGH & LOW progress."""
    y0 = RIGHT_Y + 12 + ROW * len(view.free_game_awards) + 5
    h = LEFT_Y + LEFT_H - y0
    pyxel.rect(RIGHT_X, y0, RIGHT_W, h, pal.BG)
    pyxel.rectb(RIGHT_X, y0, RIGHT_W, h, pal.FELT_LIGHT)
    cx = RIGHT_X + RIGHT_W / 2
    if view.in_free_game:
        draw_big_text_center(
            cx, y0 + 3, f"FREE GAME {view.free_games_played}/{view.free_game_total}", pal.CYAN, 1
        )
        draw_text_center(
            cx,
            y0 + 10,
            f"LEFT {view.free_games_left}   WIN {money(view.free_game_win)}",
            pal.CARD_FACE,
        )
        draw_text_center(cx, y0 + 17, "SPACE: SKIP WAIT", pal.GREY)
    elif view.high_low is not None and view.phase is SessionPhase.HIGH_LOW_GUESS:
        hl = view.high_low
        draw_text_center(
            cx,
            y0 + 3,
            f"ROUND {min(hl.rounds_won + 1, hl.rounds_total)}/{hl.rounds_total}",
            pal.CYAN,
        )
        draw_text_center(
            cx, y0 + 10, f"NOW {money(hl.current_amount)}  WIN> {money(hl.next_amount)}", pal.GOLD
        )
        draw_text_center(cx, y0 + 17, "LOW: 2 / DOWN   HIGH: 4 / UP", pal.GREY)
    else:
        draw_text_center(cx, y0 + 3, "JOKER IS NOT A FACE CARD", pal.CYAN)
        draw_text_center(cx, y0 + 10, "R/B = FACES OF ONE COLOR", pal.GREY_LIGHT)
        draw_text_center(cx, y0 + 17, "FREE GAMES PAY x2", pal.GREY_LIGHT)


# ---------------------------------------------------------------- hold labels


def draw_hold_labels(view: SessionView, frame: int, pressed: Button | None) -> None:
    for i, label in enumerate(view.hold_labels):
        if not label:
            continue
        x, y, w, h = layout.hold_rect(i)
        enabled, selected = True, False
        if view.menu:
            item = view.menu[i]
            enabled, selected = item.enabled, item.selected
        if selected:
            bg, fg, edge = pal.GOLD, pal.BLACK, pal.CARD_FACE
        elif not enabled:
            bg, fg, edge = pal.GREY_DARK, pal.GREY, pal.GREY_DARK
        else:
            bg, fg, edge = pal.FELT, pal.CARD_FACE, pal.TEXT
        if (
            pressed is not None
            and pressed.command.action is Action.HOLD
            and pressed.command.arg == i + 1
        ):
            bg, fg = pal.GOLD, pal.BLACK
        pyxel.rect(x, y, w, h, bg)
        pyxel.rectb(x, y, w, h, edge)
        draw_text_center(x + w / 2, y + 3, label, fg)
        if label in ("HIGH", "LOW"):  # little arrows
            ax = x + 6
            if label == "HIGH":
                pyxel.tri(ax, y + 7, ax + 6, y + 7, ax + 3, y + 3, fg)
            else:
                pyxel.tri(ax, y + 3, ax + 6, y + 3, ax + 3, y + 7, fg)


# ---------------------------------------------------------------- info rows


_KIND_NAMES = {
    SessionPhase.STANDARD_PICK: "STANDARD DOUBLE",
    SessionPhase.RED_BLACK_PICK: "RED & BLACK",
    SessionPhase.HIGH_LOW_GUESS: "HIGH & LOW",
}


def draw_info(view: SessionView, frame: int, credits: int, win: int) -> None:
    y = layout.HOLD_Y + layout.HOLD_H + 4  # 176
    pyxel.line(8, y - 2, layout.W - 9, y - 2, pal.FELT)
    # row A: hand name (left) and WIN (right)
    name = ""
    if view.phase in (SessionPhase.FREE_GAME, SessionPhase.DOUBLE_SELECT):
        if view.hand_rank not in (None, HandRank.NOTHING):
            name = view.hand_rank.value if view.hand_rank else ""
    else:
        name = _KIND_NAMES.get(view.phase, "")
    if name:
        col = pal.GOLD if (win > 0 and blink(frame, 24, 0.7)) else pal.CARD_FACE
        if view.phase in _KIND_NAMES:
            col = pal.CYAN
        draw_big_text(8, y + 1, name, col, 2, shadow=pal.BLACK)
    win_col = pal.GOLD if win > 0 else pal.GREY
    draw_big_text_right(layout.W - 8, y + 1, money(win), win_col, 2, shadow=pal.BLACK)
    draw_text_right(
        layout.W - 8 - text_width(money(win), 2) - 6,
        y + 5,
        "WIN",
        pal.GOLD if win > 0 else pal.GREY,
    )
    # row B: BET (left), CREDITS (right)
    y2 = y + 17  # 193
    draw_text(8, y2 + 5, "BET", pal.GREY_LIGHT)
    draw_big_text(26, y2, str(view.bet), pal.CYAN, 2, shadow=pal.BLACK)
    draw_text_right(
        layout.W - 8 - text_width(money(credits), 2) - 6, y2 + 5, "CREDITS", pal.GREY_LIGHT
    )
    draw_big_text_right(layout.W - 8, y2, money(credits), pal.TEXT, 2, shadow=pal.BLACK)
    # row C: message
    msg = view.message
    col = pal.CARD_FACE
    if msg in ("PRESS DEAL", "DOUBLE UP?", "HIGH OR LOW?", "PICK A CARD", "PLACE YOUR BET"):
        col = pal.GOLD if blink(frame, 40, 0.65) else pal.ORANGE
    draw_text_center(layout.W / 2, y2 + 17, msg, col)


# ---------------------------------------------------------------- buttons


def _button_enabled(button: Button, view: SessionView) -> bool:
    act = button.command.action
    betting = view.phase is SessionPhase.BETTING
    if act in (Action.BET, Action.MAX_BET, Action.ADD_MEDALS):
        return betting
    if act is Action.DEAL:
        return view.phase in (
            SessionPhase.BETTING,
            SessionPhase.DOUBLE_SELECT,
            SessionPhase.FREE_GAME,
        )
    if act is Action.COLLECT:
        return view.can_collect
    if act is Action.HOLD:
        label = view.hold_labels[button.command.arg - 1]
        if not label:
            return False
        if view.menu:
            return view.menu[button.command.arg - 1].enabled
        return True
    return True


def deal_label(view: SessionView) -> str:
    return {
        SessionPhase.FREE_GAME: "NEXT",
        SessionPhase.DOUBLE_SELECT: "DOUBLE",
    }.get(view.phase, "DEAL")


def draw_strip(view: SessionView, pressed: Button | None, press_frames: int) -> None:
    from twinjokers.presentation.input import STRIP_BUTTONS

    for button in STRIP_BUTTONS:
        enabled = _button_enabled(button, view)
        label = deal_label(view) if button.command.action is Action.DEAL else button.label
        if pressed is button and press_frames > 0:
            bg, fg, edge = pal.GOLD, pal.BLACK, pal.CARD_FACE
        elif enabled:
            bg, fg, edge = pal.FELT, pal.CARD_FACE, pal.TEXT
        else:
            bg, fg, edge = pal.GREY_DARK, pal.GREY, pal.GREY_DARK
        pyxel.rect(button.x, button.y, button.w, button.h, bg)
        pyxel.rectb(button.x, button.y, button.w, button.h, edge)
        if enabled:  # top highlight for a "keycap" look
            pyxel.line(
                button.x + 1, button.y + 1, button.x + button.w - 2, button.y + 1, pal.FELT_LIGHT
            )
        draw_text_center(button.x + button.w / 2, button.y + 4, label, fg)


# ---------------------------------------------------------------- banner / attract


def draw_banner(banner: Banner, frame: int, age: int) -> None:
    """Centre band over the card row. ``age`` = frames since it appeared (pop-in effect)."""
    h = 36 if banner.sub else 28
    y = layout.CARDS_Y + (62 - h) // 2
    grow = min(1.0, (age + 1) / 6)
    hh = max(4, int(h * grow))
    yy = y + (h - hh) // 2
    pyxel.dither(0.9)
    pyxel.rect(0, yy, layout.W, hh, pal.BG)
    pyxel.dither(1.0)
    pyxel.rect(0, yy, layout.W, 1, pal.GOLD)
    pyxel.rect(0, yy + hh - 1, layout.W, 1, pal.GOLD)
    if grow < 1.0:
        return
    col = banner.color if blink(frame, 14) else banner.alt
    ty = y + (5 if banner.sub else 8)
    draw_big_text_center(layout.W / 2, ty, banner.text, col, banner.scale, shadow=pal.BLACK)
    if banner.sub:
        sw = text_width(banner.sub) + 10
        pyxel.rect(layout.W / 2 - sw / 2, y + h - 13, sw, 10, pal.BG)
        pyxel.rectb(layout.W / 2 - sw / 2, y + h - 13, sw, 10, pal.FELT_LIGHT)
        draw_text_center(layout.W / 2, y + h - 11, banner.sub, pal.CARD_FACE)


def draw_attract(frame: int) -> None:
    """Idle text over the empty card slots."""
    cx = layout.W / 2
    y = layout.CARDS_Y + 14
    if blink(frame, 80, 0.62):
        draw_big_text_center(cx, y, "INSERT MEDAL", pal.GOLD, 2, shadow=pal.BLACK)
        draw_big_text_center(cx, y + 20, "PRESS DEAL", pal.CARD_FACE, 2, shadow=pal.BLACK)
    draw_shadow_text(
        cx - text_width("FREE DEAL  TWIN JOKERS") / 2, y + 42, "FREE DEAL  TWIN JOKERS", pal.CYAN
    )
