import pytest

from twinjokers.domain.config import DoubleDownConfig
from twinjokers.domain.double_down.common import (
    apply_cap,
    can_double,
    can_half_double,
    must_auto_settle,
    split_half,
)

CFG = DoubleDownConfig()


@pytest.mark.parametrize(
    ("amount", "expected"), [(7, (4, 3)), (8, (4, 4)), (1, (1, 0)), (2, (1, 1)), (0, (0, 0))]
)
def test_split_half(amount, expected):
    assert split_half(amount) == expected


def test_split_half_negative():
    with pytest.raises(ValueError):
        split_half(-1)


def test_half_double_refused_for_one():
    assert not can_half_double(1)
    assert not can_half_double(0)
    assert can_half_double(2)
    assert can_half_double(5000, CFG)
    assert not can_half_double(5001, CFG)


@pytest.mark.parametrize(
    ("amount", "doubling", "auto"),
    [(0, False, False), (1, True, False), (5000, True, False), (5001, False, True),
     (10000, False, True)],
)  # fmt: skip
def test_boundaries(amount, doubling, auto):
    assert can_double(amount, CFG) is doubling
    assert must_auto_settle(amount, CFG) is auto


def test_apply_cap():
    assert apply_cap(9999, CFG) == 9999
    assert apply_cap(10000, CFG) == 10000
    assert apply_cap(10001, CFG) == 10000
