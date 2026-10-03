"""Save data model and repository port (implemented in infrastructure)."""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

from twinjokers.domain.enums import PayLine


class Stats(BaseModel):
    games_played: int = Field(default=0, ge=0)
    total_bet: int = Field(default=0, ge=0)
    total_won: int = Field(default=0, ge=0)
    biggest_win: int = Field(default=0, ge=0)
    free_games_played: int = Field(default=0, ge=0)


class SaveData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: int = 1
    credits: int = Field(ge=0)
    progressive: dict[PayLine, float] = Field(default_factory=dict)
    stats: Stats = Field(default_factory=Stats)


class SaveRepository(Protocol):
    def load(self) -> SaveData | None:
        """Return saved data, or None if absent/unreadable (never raises)."""
        ...

    def save(self, data: SaveData) -> bool:
        """Persist data; False on failure (never raises)."""
        ...
