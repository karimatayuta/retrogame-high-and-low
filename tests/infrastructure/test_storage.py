from __future__ import annotations

import os
import stat

import pytest

from twinjokers.application.save_data import SaveData, SaveRepository, Stats
from twinjokers.domain.enums import PayLine
from twinjokers.infrastructure.rng import SystemRandomizer
from twinjokers.infrastructure.storage import JsonSaveRepository, default_save_path


def sample() -> SaveData:
    return SaveData(
        credits=1234,
        progressive={PayLine.FLUSH_OR_STRAIGHT: 40.5, PayLine.FOUR_OR_FULL: 41.0},
        stats=Stats(games_played=3, total_bet=15, total_won=9, biggest_win=8, free_games_played=1),
    )


def test_roundtrip(tmp_path):
    repo: SaveRepository = JsonSaveRepository(tmp_path / "sub" / "save.json")
    assert repo.load() is None
    assert repo.save(sample()) is True
    assert repo.load() == sample()
    assert [p.name for p in (tmp_path / "sub").iterdir()] == ["save.json"]


def test_overwrite(tmp_path):
    repo = JsonSaveRepository(tmp_path / "s.json")
    repo.save(sample())
    repo.save(SaveData(credits=1))
    assert repo.load().credits == 1


@pytest.mark.parametrize(
    "content",
    [
        "{not json",
        "",
        "[]",
        '{"credits": -5}',
        '{"credits": "abc"}',
        '{"credits": 1, "progressive": {"BAD": 1}}',
    ],
)
def test_corrupted(tmp_path, content):
    path = tmp_path / "s.json"
    path.write_text(content)
    assert JsonSaveRepository(path).load() is None


def test_non_utf8(tmp_path):
    path = tmp_path / "s.json"
    path.write_bytes(b"\xff\xfe\x00")
    assert JsonSaveRepository(path).load() is None


def test_path_is_directory(tmp_path):
    assert JsonSaveRepository(tmp_path).load() is None
    assert JsonSaveRepository(tmp_path).save(sample()) is False


@pytest.mark.skipif(os.geteuid() == 0, reason="root ignores permissions")
def test_unwritable_dir(tmp_path):
    d = tmp_path / "ro"
    d.mkdir()
    d.chmod(stat.S_IRUSR | stat.S_IXUSR)
    try:
        assert JsonSaveRepository(d / "s.json").save(sample()) is False
    finally:
        d.chmod(stat.S_IRWXU)


def test_parent_is_a_file(tmp_path):
    (tmp_path / "f").write_text("x")
    assert JsonSaveRepository(tmp_path / "f" / "s.json").save(sample()) is False


def test_failed_replace_keeps_old_file(tmp_path, monkeypatch):
    repo = JsonSaveRepository(tmp_path / "s.json")
    repo.save(sample())

    def boom(*a, **k):
        raise OSError("nope")

    monkeypatch.setattr(os, "replace", boom)
    assert repo.save(SaveData(credits=1)) is False
    monkeypatch.undo()
    assert repo.load() == sample()
    assert [p.name for p in tmp_path.iterdir()] == ["s.json"]  # temp file cleaned up


def test_default_path(monkeypatch, tmp_path):
    monkeypatch.setenv("TWINJOKERS_SAVE", str(tmp_path / "x.json"))
    assert default_save_path() == tmp_path / "x.json"
    monkeypatch.delenv("TWINJOKERS_SAVE")
    assert default_save_path().parts[-2:] == (".twinjokers", "save.json")


def test_system_randomizer():
    r = SystemRandomizer()
    assert 0.0 <= r.random() < 1.0
    assert 3 <= r.randrange(3, 6) < 6
    xs = list(range(10))
    r.shuffle(xs)
    assert sorted(xs) == list(range(10))
    assert r.choice([7]) == 7
