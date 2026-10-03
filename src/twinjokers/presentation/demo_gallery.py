"""Visual gallery for the presentation building blocks.

    uv run python -m twinjokers.presentation.demo_gallery

Keys: LEFT/RIGHT page, SPACE restart flip, S toggle scanlines, M mute, 1-9/0/-/=
play sound effects (see list on the last page), ESC quit.

Env: TWINJOKERS_AUTOQUIT_FRAMES=N quits after N frames, TWINJOKERS_DEMO_PAGE=n starts on
page n, TWINJOKERS_SCREENSHOT=path.png saves the last frame (2x) before quitting.
"""

from __future__ import annotations

import os

import pyxel

from twinjokers.domain.cards import Card, Rank, Suit, joker, standard_deck
from twinjokers.presentation import effects, palette, sound, text
from twinjokers.presentation.capture import save_screen_png
from twinjokers.presentation.card_sprite import (
    CARD_GAP,
    CARD_H,
    CARD_W,
    draw_card,
    draw_card_flip,
    draw_card_slot,
    draw_suit,
)

W, H = 320, 240
COLS = 7
ROWS = 3
PER_PAGE = COLS * ROWS


def _all_items() -> list[Card | None]:
    items: list[Card | None] = list(standard_deck(2))
    items.append(None)  # card back
    return items


class Gallery:
    def __init__(self) -> None:
        pyxel.init(W, H, title="TWIN JOKERS - gallery", fps=30)
        palette.apply_palette()
        sound.setup_sounds()
        self.items = _all_items()
        self.card_pages = (len(self.items) + PER_PAGE - 1) // PER_PAGE
        self.page = int(os.environ.get("TWINJOKERS_DEMO_PAGE", "0"))
        self.scan = effects.ScanlineOverlay(enabled=True)
        self.flash = effects.ScreenFlash()
        self.counter = effects.CoinCounter()
        self.counter.start(1000, 3456, 90)
        self.flip_t0 = 0
        self.quit_after = int(os.environ.get("TWINJOKERS_AUTOQUIT_FRAMES", "0"))
        self.shot = os.environ.get("TWINJOKERS_SCREENSHOT")
        pyxel.run(self.update, self.draw)

    # ------------------------------------------------------------- update
    def update(self) -> None:
        if pyxel.btnp(pyxel.KEY_RIGHT):
            self.page = (self.page + 1) % (self.card_pages + 1)
        if pyxel.btnp(pyxel.KEY_LEFT):
            self.page = (self.page - 1) % (self.card_pages + 1)
        if pyxel.btnp(pyxel.KEY_SPACE):
            self.flip_t0 = pyxel.frame_count
            sound.play(sound.Sfx.FLIP)
            self.counter.start(1000, 3456, 90)
            self.flash.trigger(palette.GOLD, 10)
        if pyxel.btnp(pyxel.KEY_S):
            self.scan.toggle()
        if pyxel.btnp(pyxel.KEY_M):
            sound.set_muted(not sound.is_muted())
        keys = (
            pyxel.KEY_1, pyxel.KEY_2, pyxel.KEY_3, pyxel.KEY_4, pyxel.KEY_5, pyxel.KEY_6,
            pyxel.KEY_7, pyxel.KEY_8, pyxel.KEY_9, pyxel.KEY_0, pyxel.KEY_MINUS, pyxel.KEY_EQUALS,
        )  # fmt: skip
        for key, sfx in zip(keys, sound.Sfx, strict=False):
            if pyxel.btnp(key):
                sound.play(sfx)
        if self.counter.tick():
            sound.play(sound.Sfx.COUNT_TICK)
        self.flash.update()

    # ------------------------------------------------------------- draw
    def draw(self) -> None:
        pyxel.cls(palette.FELT_DARK)
        if self.page < self.card_pages:
            self._draw_cards_page()
        else:
            self._draw_fx_page()
        self.flash.draw()
        self.scan.draw()
        if self.quit_after and pyxel.frame_count + 1 >= self.quit_after:
            if self.shot:
                save_screen_png(self.shot, scale=2)
            pyxel.quit()

    def _draw_cards_page(self) -> None:
        text.draw_shadow_text(
            6, 3, f"CARDS  PAGE {self.page + 1}/{self.card_pages + 1}", palette.TEXT
        )
        start = self.page * PER_PAGE
        x0 = (W - (COLS * CARD_W + (COLS - 1) * 2)) // 2
        for i, item in enumerate(self.items[start : start + PER_PAGE]):
            col, row = i % COLS, i // COLS
            draw_card(x0 + col * (CARD_W + 2), 12 + row * (CARD_H + 3), item)
        text.draw_text_center(W // 2, H - 8, "LEFT/RIGHT: PAGE   S: SCANLINES", palette.GREY_LIGHT)

    def _draw_fx_page(self) -> None:
        f = pyxel.frame_count
        effects.draw_marquee(2, 2, W - 4, H - 4, f)
        text.draw_shadow_text(10, 8, "EFFECTS / FLIP / BIG TEXT", palette.TEXT)
        # flip row: 5 cards at different phases + highlight
        deck = [Card(Rank.ACE, Suit.SPADES), Card(Rank.KING, Suit.HEARTS), joker(1),
                Card(Rank.TEN, Suit.CLUBS), Card(Rank.QUEEN, Suit.DIAMONDS)]  # fmt: skip
        total = CARD_W * 5 + CARD_GAP * 4
        x0 = (W - total) // 2
        for i, c in enumerate(deck):
            t = (f - self.flip_t0) / 30.0 - i * 0.12
            t = min(1.0, max(0.0, t))
            if f - self.flip_t0 > 200:
                t = 1.0
            draw_card_flip(x0 + i * (CARD_W + CARD_GAP), 20, c, t, highlight=(i == 2 and t >= 1))
        draw_card_slot(W - 60, 88)
        draw_suit(W - 50, 100, Suit.HEARTS, 16)
        draw_suit(W - 30, 100, Suit.SPADES, 16)
        # big text
        win = text.blink(f, 20)
        text.draw_big_text(10, 100, "WIN", palette.GOLD if win else palette.ORANGE, 4,
                           shadow=palette.BLACK)  # fmt: skip
        text.draw_big_text_center(
            W // 2 + 40, 104, "FREE GAME", palette.CYAN, 3, outline=palette.NAVY
        )
        text.draw_big_text_center(
            W // 2, 134, "DOUBLE UP", palette.CARD_RED, 2, outline=palette.CARD_FACE
        )
        text.draw_big_text_right(W - 10, 160, f"{self.counter.value:,}", palette.TEXT, 2,
                                 shadow=palette.BLACK)  # fmt: skip
        text.draw_text(10, 160, "CREDITS", palette.GREY_LIGHT)
        text.draw_text_right(W - 10, 178, "SMALL TEXT RIGHT", palette.CARD_FACE)
        text.draw_text_center(W // 2, 190, "CENTER TEXT", palette.CARD_FACE)
        text.draw_shadow_text(10, 190, "SHADOW", palette.GOLD)
        # palette strip
        for i in range(palette.NUM_COLORS):
            pyxel.rect(10 + i * 18, 206, 16, 10, i)
        labels = "1234567890-="
        for i, sfx in enumerate(sound.Sfx):
            label = f"{labels[i]}{sfx.name[:6]}"
            text.draw_text(10 + (i % 6) * 52, 220 + (i // 6) * 8, label, palette.TEXT)


def main() -> None:
    Gallery()


if __name__ == "__main__":
    main()
