"""Chiptune sound effects defined with Pyxel's Sound API (no audio files).

Usage::

    sound.setup_sounds()          # once, after pyxel.init
    sound.play(sound.Sfx.BET)     # fire and forget
    sound.start_bgm()             # optional subtle attract loop on channel 3

Channels 0-2 are used for effects (a simple priority scheme decides who may cut
whom), channel 3 is reserved for the BGM.
"""

from __future__ import annotations

from enum import IntEnum
from typing import Final

import pyxel

BGM_CHANNEL: Final = 3
SFX_CHANNELS: Final = (0, 1, 2)


class Sfx(IntEnum):
    """Effect names; the value is the Pyxel sound slot."""

    BUTTON = 0
    BET = 1
    DEAL = 2
    FLIP = 3
    WIN = 4
    BIG_WIN = 5
    FREE_GAME = 6
    COUNT_TICK = 7
    DOUBLE_WIN = 8
    LOSE = 9
    DRAW = 10
    JOKER = 11


BGM_SLOTS: Final = (20, 21, 22, 23)

# name -> (notes, tones, volumes, effects, speed)
_DEFS: Final[dict[Sfx, tuple[str, str, str, str, int]]] = {
    Sfx.BUTTON: ("a3", "p", "5", "f", 4),
    Sfx.BET: ("e4b4", "ss", "65", "nf", 5),
    Sfx.DEAL: ("c4", "n", "4", "f", 4),
    Sfx.FLIP: ("g2c3e3", "nns", "533", "ffn", 2),
    Sfx.WIN: ("c3e3g3c4rc4", "ssssss", "666657", "nnnnnf", 8),
    Sfx.BIG_WIN: (
        "c3e3g3c4e4g4c4e4g4c4rg3c4e4g4rg4c4e4g4c4",
        "pppppppppppppppppppp",
        "56667777777777777777",
        "nnnnnnnnnnnnnnnnnnvf",
        8,
    ),
    Sfx.FREE_GAME: (
        "g3g3g3c4rrc4e4g4r",
        "sssssssss",
        "666666667",
        "nnnnnnnnf",
        10,
    ),
    Sfx.COUNT_TICK: ("c4", "s", "3", "f", 2),
    Sfx.DOUBLE_WIN: ("g3c4e4g4g4", "sssss", "66667", "nnnnv", 6),
    Sfx.LOSE: ("e3d3c3g2c2", "ttttt", "66667", "nnnnf", 14),
    Sfx.DRAW: ("c3c3", "tt", "55", "nf", 5),
    Sfx.JOKER: ("c3g3c4g4c4g4c4g4", "pppppppp", "45676543", "vvvvvvvf", 4),
}

# Higher priority sounds cannot be cut by lower ones.
_PRIORITY: Final[dict[Sfx, int]] = {
    Sfx.COUNT_TICK: 0,
    Sfx.BUTTON: 1,
    Sfx.DEAL: 1,
    Sfx.FLIP: 1,
    Sfx.BET: 1,
    Sfx.DRAW: 2,
    Sfx.LOSE: 2,
    Sfx.JOKER: 3,
    Sfx.DOUBLE_WIN: 3,
    Sfx.WIN: 3,
    Sfx.FREE_GAME: 4,
    Sfx.BIG_WIN: 4,
}

# Subtle looping attract tune: slow bass + sparse arpeggio, C major / A minor.
_BGM: Final[tuple[tuple[str, str, str, str, int], ...]] = (
    ("c2rg2rc2rg2r a1re2ra1re2r", "t", "3", "n", 14),
    ("f2rc3rf2rc3r g2rd3rg2rd3r", "t", "3", "n", 14),
    ("e3rrg3rrc4rr e3rrg3rrb3rr", "s", "11", "nf", 14),
    ("a3rrc4rre4rr d4rrb3rrg3rr", "s", "11", "nf", 14),
)

_ready = False
_muted = False
_bgm_on = False
_channel_sfx: dict[int, Sfx] = {}
_next_rr = 0


def setup_sounds() -> None:
    """Register every effect (and the BGM) in its sound slot. Idempotent."""
    global _ready
    for sfx, (notes, tones, vols, effects, speed) in _DEFS.items():
        pyxel.sounds[int(sfx)].set(notes, tones, vols, effects, speed)
    for slot, (notes, tones, vols, effects, speed) in zip(BGM_SLOTS, _BGM, strict=True):
        pyxel.sounds[slot].set(notes, tones, vols, effects, speed)
    pyxel.channels[BGM_CHANNEL].gain = 0.06
    _ready = True


def set_muted(muted: bool) -> None:
    global _muted
    _muted = muted
    if muted:
        pyxel.stop()
    elif _bgm_on:
        _play_bgm()


def is_muted() -> bool:
    return _muted


def _channel_busy(ch: int) -> bool:
    return pyxel.play_pos(ch) is not None


def _pick_channel(sfx: Sfx) -> int | None:
    global _next_rr
    for ch in SFX_CHANNELS:
        if not _channel_busy(ch):
            return ch
    prio = _PRIORITY[sfx]
    candidates = [
        ch for ch in SFX_CHANNELS if _PRIORITY[_channel_sfx.get(ch, Sfx.COUNT_TICK)] <= prio
    ]
    if not candidates:
        return None
    # steal the lowest priority one; rotate among equals
    lowest = min(_PRIORITY[_channel_sfx.get(ch, Sfx.COUNT_TICK)] for ch in candidates)
    pool = [ch for ch in candidates if _PRIORITY[_channel_sfx.get(ch, Sfx.COUNT_TICK)] == lowest]
    _next_rr += 1
    return pool[_next_rr % len(pool)]


def play(sfx: Sfx) -> None:
    """Play ``sfx`` on a sensible channel. No-op when muted or not set up."""
    if _muted:
        return
    if not _ready:
        setup_sounds()
    ch = _pick_channel(sfx)
    if ch is None:
        return
    _channel_sfx[ch] = sfx
    pyxel.play(ch, int(sfx))


def stop_all_sfx() -> None:
    for ch in SFX_CHANNELS:
        pyxel.stop(ch)
    _channel_sfx.clear()


def _play_bgm() -> None:
    pyxel.play(BGM_CHANNEL, list(BGM_SLOTS), loop=True)


def start_bgm() -> None:
    global _bgm_on
    if not _ready:
        setup_sounds()
    _bgm_on = True
    if not _muted:
        _play_bgm()


def stop_bgm() -> None:
    global _bgm_on
    _bgm_on = False
    pyxel.stop(BGM_CHANNEL)
