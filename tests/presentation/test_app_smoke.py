"""Smoke tests: run the real app headless in a subprocess (pyxel quits the process on exit)."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest


def _run(env_extra: dict[str, str], tmp_path: Path, code: str | None = None) -> None:
    env = {
        **os.environ,
        "TWINJOKERS_HEADLESS": "1",
        "TWINJOKERS_SAVE": str(tmp_path / "save.json"),
        **env_extra,
    }
    args = [sys.executable, "-c", code] if code else [sys.executable, "-m", "twinjokers"]
    done = subprocess.run(args, env=env, capture_output=True, text=True, timeout=120, check=False)
    assert done.returncode == 0, done.stdout + done.stderr
    assert "Traceback" not in done.stderr, done.stderr


@pytest.mark.parametrize("mode", ["1", "chaos"])
def test_autoplay_runs_3000_frames(mode: str, tmp_path: Path) -> None:
    _run(
        {
            "TWINJOKERS_AUTOPLAY": mode,
            "TWINJOKERS_AUTOPLAY_SEED": "11",
            "TWINJOKERS_AUTOQUIT_FRAMES": "3000",
            "TWINJOKERS_SCREENSHOT": str(tmp_path / "shot.png"),
        },
        tmp_path,
    )
    assert (tmp_path / "shot.png").stat().st_size > 1000
    save = json.loads((tmp_path / "save.json").read_text())
    assert save["stats"]["games_played"] > 0


@pytest.mark.parametrize("scene", ["betting", "win", "standard", "redblack", "highlow", "joker"])
def test_debug_scenes_run(scene: str, tmp_path: Path) -> None:
    _run(
        {
            "TWINJOKERS_DEBUG_SCENE": scene,
            "TWINJOKERS_SHOT_DIR": str(tmp_path),
            "TWINJOKERS_AUTOQUIT_FRAMES": "4000",
        },
        tmp_path,
    )
    assert list(tmp_path.glob(f"{scene}_*.png"))


def test_quit_collects_pending_win(tmp_path: Path) -> None:
    """Closing the game in the double down menu must not lose the pending win."""
    code = textwrap.dedent(
        """
        from twinjokers.application.session import GameSession
        from twinjokers.domain.config import DEFAULT_CONFIG
        from twinjokers.infrastructure.storage import JsonSaveRepository, default_save_path
        from twinjokers.presentation.app import GameApp
        from twinjokers.presentation.autoplay import ScriptDriver, Step, act, idle
        from twinjokers.presentation.debug_scenes import ScriptedRandomizer
        from twinjokers.presentation.input import Action

        rng = ScriptedRandomizer(["7S 7H 3D 3C 9S"])
        driver = ScriptDriver([act(Action.MAX_BET), idle(), Step("wait", n=30), Step("quit")])
        session = GameSession(DEFAULT_CONFIG, rng, JsonSaveRepository(default_save_path()))
        GameApp(session, driver=driver, headless=True, autoquit_frames=3000).run()
        """
    )
    _run({}, tmp_path, code)
    save = json.loads((tmp_path / "save.json").read_text())
    assert save["credits"] == 1000 - 5 + 8  # two pair at 5 BET pays 8, collected on quit
