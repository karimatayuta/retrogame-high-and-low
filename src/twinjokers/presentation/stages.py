"""Turn the session's instant results (events + view) into a timed presentation script.

Pure data, no Pyxel: the app plays the resulting :class:`Stage` list one after another and
ignores game commands meanwhile. No game rules here: only "what to show, for how long".
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from twinjokers.application.events import Event, EventKind
from twinjokers.application.view import SessionPhase, SessionView
from twinjokers.domain.cards import Card
from twinjokers.domain.enums import HandRank
from twinjokers.presentation import palette as pal
from twinjokers.presentation.card_row import SlotVis
from twinjokers.presentation.sound import Sfx

# frames at 60 fps
FREE_GAME_PAUSE = 48  # ~0.8 s between free games


@dataclass(frozen=True, slots=True)
class Banner:
    text: str
    sub: str = ""
    color: int = pal.GOLD
    alt: int = pal.ORANGE
    scale: int = 3


@dataclass(frozen=True, slots=True)
class Stage:
    targets: tuple[SlotVis, ...] | None = None  # None: no card change (banner only)
    highlight: int | None = None
    fast: bool = False
    reveal: bool = False  # after this stage's cards settle, show the result (hand, WIN, ...)
    hold: int = 0  # frames to stay after the cards settled
    banner: Banner | None = None
    sfx: Sfx | None = None  # played when the cards settled
    flash: int | None = None  # screen flash colour
    celebrate: bool = False  # faster marquee


PICK_PHASES = (SessionPhase.STANDARD_PICK, SessionPhase.RED_BLACK_PICK)

# events that start a presentation sequence (the rest play a sound at once)
SEQUENCE_KINDS = frozenset(
    {
        EventKind.DEAL,
        EventKind.FREE_GAME_STEP,
        EventKind.DOUBLE_START,
        EventKind.DOUBLE_WIN,
        EventKind.DOUBLE_LOSE,
        EventKind.DOUBLE_DRAW,
        EventKind.HIGH_LOW_STEP,
        EventKind.COLLECT,
        EventKind.AUTO_SETTLED,
    }
)

_TOP_HANDS = {
    HandRank.FIVE_OF_A_KIND,
    HandRank.ROYAL_FLUSH,
    HandRank.STRAIGHT_FLUSH,
    HandRank.FOUR_OF_A_KIND,
    HandRank.FULL_HOUSE,
}


def targets_from_view(view: SessionView) -> tuple[SlotVis, ...]:
    """Slot contents the screen should settle on for ``view``."""
    picking = view.phase in PICK_PHASES
    out: list[SlotVis] = []
    for card, up in zip(view.cards, view.face_up, strict=True):
        if card is not None:
            out.append(SlotVis(card, up, True))
        elif picking:  # face-down cards still to pick from
            out.append(SlotVis(None, False, True))
        else:
            out.append(SlotVis())
    return tuple(out)


def targets_from_cards(cards: Sequence[Card]) -> tuple[SlotVis, ...]:
    padded = [*cards, *([None] * (5 - len(cards)))]
    return tuple(SlotVis(c, True, True) if c is not None else SlotVis() for c in padded[:5])


def is_sequence(events: Sequence[Event]) -> bool:
    return any(e.kind in SEQUENCE_KINDS for e in events)


def plan_stages(events: Sequence[Event], view: SessionView) -> list[Stage]:
    """Presentation script for one command's events. ``view`` is the state afterwards."""
    kinds = {e.kind for e in events}
    by_kind = {e.kind: e for e in events}  # last one wins; fine for our single-use lookups
    fast = EventKind.FREE_GAME_STEP in kinds
    stages: list[Stage] = []

    draw = by_kind.get(EventKind.DOUBLE_DRAW)
    if draw is not None:  # standard double drew: show the cards, then the fresh deal
        stages.append(
            Stage(
                targets_from_cards(draw.cards),
                highlight=draw.index,
                reveal=False,
                hold=42,
                sfx=Sfx.DRAW,
                banner=Banner("DRAW", "PICK AGAIN", pal.CYAN, pal.BLUE, 3),
            )
        )

    hold, sfx = 8, None
    flash: int | None = None
    celebrate = False
    hand = by_kind.get(EventKind.HAND)
    if EventKind.NO_WIN in kinds:
        hold = 14
    if hand is not None and hand.amount > 0 and not fast:
        hold = 34
        sfx = Sfx.BIG_WIN if view.hand_rank in _TOP_HANDS else Sfx.WIN
        celebrate = True
    if fast:
        hold = 6
        if hand is not None and hand.amount > 0 and view.hand_rank not in (None, HandRank.NOTHING):
            sfx = Sfx.WIN
            hold = 10
    if EventKind.DOUBLE_WIN in kinds:
        hold, sfx, celebrate = 34, Sfx.DOUBLE_WIN, True
    if EventKind.DOUBLE_LOSE in kinds:
        hold, sfx = 46, Sfx.LOSE
    if EventKind.DOUBLE_START in kinds:
        hold = 22
    stages.append(
        Stage(
            targets_from_view(view),
            highlight=view.highlight,
            fast=fast,
            reveal=True,
            hold=hold,
            sfx=sfx,
            flash=flash,
            celebrate=celebrate,
        )
    )

    # banners, one stage each
    if EventKind.DOUBLE_START in kinds:
        start = by_kind[EventKind.DOUBLE_START]
        stages.append(
            Stage(
                hold=26,
                banner=Banner(
                    "DOUBLE UP", f"{start.detail}  STAKE {start.amount:,}", pal.CARD_FACE, pal.CYAN
                ),
                sfx=Sfx.BUTTON,
            )
        )
    if EventKind.PROGRESSIVE_WON in kinds:
        won = by_kind[EventKind.PROGRESSIVE_WON]
        stages.append(
            Stage(
                hold=110,
                banner=Banner(
                    "JACKPOT!", f"{won.detail}  {won.amount:,}", pal.GOLD, pal.CARD_RED, 4
                ),
                sfx=Sfx.BIG_WIN,
                flash=pal.GOLD,
                celebrate=True,
            )
        )
    awarded = [e for e in events if e.kind is EventKind.FREE_GAME_AWARDED]
    if awarded:
        ev = awarded[-1]
        if fast:
            banner = Banner(
                "EXTRA GAMES", f"+{ev.amount} GAMES  {ev.detail}", pal.CYAN, pal.CARD_FACE, 3
            )
            stages.append(Stage(hold=50, banner=banner, sfx=Sfx.FREE_GAME, flash=pal.CYAN))
        else:
            banner = Banner(
                "FREE GAME", f"{ev.amount} GAMES  {ev.detail}", pal.CYAN, pal.CARD_FACE, 4
            )
            stages.append(
                Stage(hold=90, banner=banner, sfx=Sfx.FREE_GAME, flash=pal.CYAN, celebrate=True)
            )
    if EventKind.FREE_GAME_END in kinds:
        end = by_kind[EventKind.FREE_GAME_END]
        stages.append(
            Stage(
                hold=70,
                banner=Banner(
                    "FREE GAME END", f"TOTAL WIN {end.amount:,}", pal.GOLD, pal.ORANGE, 3
                ),
                sfx=Sfx.WIN,
                celebrate=True,
            )
        )
    if EventKind.HIGH_LOW_BONUS in kinds:
        bonus = by_kind[EventKind.HIGH_LOW_BONUS]
        stages.append(
            Stage(
                hold=90,
                banner=Banner(
                    "SPECIAL BONUS", f"{bonus.detail}  +{bonus.amount:,}", pal.GOLD, pal.CARD_RED, 3
                ),
                sfx=Sfx.BIG_WIN,
                flash=pal.GOLD,
                celebrate=True,
            )
        )
    if EventKind.JOKER in kinds:
        stages.append(
            Stage(
                hold=80,
                banner=Banner("JOKER!", "AUTO COLLECT", pal.GOLD, pal.CARD_FACE, 4),
                sfx=Sfx.JOKER,
                flash=pal.CARD_FACE,
                celebrate=True,
            )
        )
    return stages
