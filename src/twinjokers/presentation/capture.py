"""Save the current Pyxel screen as a PNG (pure Python, no Pillow) for visual QA.

Call :func:`save_screen_png` at the *end* of ``draw()`` (the screen buffer holds the
frame just drawn). ``pyxel.screenshot(filename)`` also exists, but this works
without a window and lets agents read pixels deterministically.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

import pyxel


def _chunk(tag: bytes, data: bytes) -> bytes:
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def encode_png(width: int, height: int, rgb_rows: list[bytes]) -> bytes:
    raw = b"".join(b"\x00" + row for row in rgb_rows)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", header)
        + _chunk(b"IDAT", zlib.compress(raw, 9))
        + _chunk(b"IEND", b"")
    )


def save_screen_png(path: str | Path, scale: int = 2) -> Path:
    """Write ``pyxel.screen`` to ``path`` as an RGB PNG, integer-scaled by ``scale``."""
    scale = max(1, scale)
    width, height = pyxel.width, pyxel.height
    colors = list(pyxel.colors)
    screen = pyxel.screen
    rows: list[bytes] = []
    for y in range(height):
        px = b"".join(
            bytes(((c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF)) * scale
            for c in (colors[screen.pget(x, y)] for x in range(width))
        )
        rows.extend([px] * scale)
    out = Path(path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(encode_png(width * scale, height * scale, rows))
    return out
