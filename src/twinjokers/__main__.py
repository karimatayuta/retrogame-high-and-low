"""Composition root: wires config, randomness, persistence, session and the Pyxel app.

Environment variables (all optional)::

    TWINJOKERS_CONFIG=path.json            GameConfig override (JSON)
    TWINJOKERS_SAVE=path.json              save file (handled by infrastructure.storage)
    TWINJOKERS_HEADLESS=1                  no window (smoke tests, screenshots)
    TWINJOKERS_AUTOQUIT_FRAMES=N           quit after N frames
    TWINJOKERS_SCREENSHOT=path.png         save the last frame at autoquit
    TWINJOKERS_AUTOPLAY=1|chaos            a bot presses the buttons (chaos: random key mashing)
    TWINJOKERS_AUTOPLAY_SEED=N             seed for the bot
    TWINJOKERS_DEBUG_SCENE=name            scripted QA scene (screenshots into TWINJOKERS_SHOT_DIR)
    TWINJOKERS_SCANLINES=0                 start without the CRT scanlines
"""

from __future__ import annotations

import os
from pathlib import Path

from twinjokers.application.session import GameSession
from twinjokers.domain.config import DEFAULT_CONFIG, GameConfig
from twinjokers.infrastructure.rng import SystemRandomizer
from twinjokers.infrastructure.storage import JsonSaveRepository, default_save_path


def _flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def load_config() -> GameConfig:
    path = os.environ.get("TWINJOKERS_CONFIG")
    if not path:
        return DEFAULT_CONFIG
    try:
        return GameConfig.model_validate_json(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise SystemExit(f"cannot load TWINJOKERS_CONFIG={path}: {e}") from e


def main() -> None:
    from twinjokers.presentation.app import (
        GameApp,
    )

    config = load_config()
    scene = os.environ.get("TWINJOKERS_DEBUG_SCENE")
    driver = None
    if scene:  # QA only: scripted cards, no save file
        from twinjokers.presentation.debug_scenes import build_scene

        rng, driver = build_scene(scene)
        repository = None
    else:
        rng = SystemRandomizer()
        repository = JsonSaveRepository(default_save_path())
        autoplay = os.environ.get("TWINJOKERS_AUTOPLAY", "").strip().lower()
        seed_text = os.environ.get("TWINJOKERS_AUTOPLAY_SEED")
        seed = int(seed_text) if seed_text else None
        if autoplay == "chaos":
            from twinjokers.presentation.autoplay import ChaosPlayer

            driver = ChaosPlayer(seed)
        elif autoplay in ("1", "true", "yes", "on"):
            from twinjokers.presentation.autoplay import AutoPlayer

            driver = AutoPlayer(seed)
    session = GameSession(config, rng, repository)
    app = GameApp(
        session,
        driver=driver,
        autoquit_frames=int(os.environ.get("TWINJOKERS_AUTOQUIT_FRAMES", "0") or 0),
        screenshot=os.environ.get("TWINJOKERS_SCREENSHOT") or None,
        shot_dir=os.environ.get("TWINJOKERS_SHOT_DIR") or None,
        headless=_flag("TWINJOKERS_HEADLESS"),
        scanlines=os.environ.get("TWINJOKERS_SCANLINES", "1") != "0",
        muted=_flag("TWINJOKERS_MUTED"),
    )
    app.scene_name = scene or ""
    app.run()


if __name__ == "__main__":
    main()
