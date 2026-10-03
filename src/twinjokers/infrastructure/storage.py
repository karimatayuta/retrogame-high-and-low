"""Save data persistence. Never raises: no save is better than a crash."""

from __future__ import annotations

import contextlib
import logging
import os
import tempfile
from pathlib import Path

from twinjokers.application.save_data import SaveData

log = logging.getLogger(__name__)

SAVE_ENV_VAR = "TWINJOKERS_SAVE"


def default_save_path() -> Path:
    override = os.environ.get(SAVE_ENV_VAR)
    if override:
        return Path(override)
    return Path.home() / ".twinjokers" / "save.json"


class JsonSaveRepository:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)

    def load(self) -> SaveData | None:
        try:
            text = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except (OSError, ValueError) as e:
            log.warning("cannot read save file %s: %s", self.path, e)
            return None
        try:
            return SaveData.model_validate_json(text)
        except ValueError as e:  # pydantic ValidationError is a ValueError
            log.warning("ignoring invalid save file %s: %s", self.path, e)
            return None

    def save(self, data: SaveData) -> bool:
        tmp_name: str | None = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(
                dir=self.path.parent, prefix=self.path.name + ".", suffix=".tmp"
            )
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(data.model_dump_json(indent=2))
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_name, self.path)
            return True
        except (OSError, ValueError) as e:
            log.warning("cannot write save file %s: %s", self.path, e)
            if tmp_name is not None:
                with contextlib.suppress(OSError):
                    os.unlink(tmp_name)
            return False
