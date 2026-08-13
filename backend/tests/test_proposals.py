from datetime import date, datetime, time
from typing import cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest

from app.models.planning import Shift, ShiftStatus, ShiftType
from app.models.proposal import ProposalOverride
from app.schemas.proposals import ProposalWindowResponse
from app.services.proposals import (
    ProposalGame,
    ProposalService,
    ProposalValidationError,
    derive_proposal_windows,
)


def game(value: int, kickoff: time, venue: str = "Sportplatz") -> ProposalGame:
    return ProposalGame(UUID(int=value), f"Spiel {value}", date(2026, 8, 2), kickoff, venue)


def test_groups_games_with_thirty_minute_margins() -> None:
    windows = derive_proposal_windows(
        [game(1, time(10)), game(2, time(13))], ZoneInfo("Europe/Zurich")
    )
    assert len(windows) == 1
    assert windows[0].start_at.time() == time(9, 30)
    assert windows[0].end_at.time() == time(13, 30)
    assert [item.id for item in windows[0].games] == [UUID(int=1), UUID(int=2)]


def test_gap_equal_to_four_hours_remains_continuous() -> None:
    assert (
        len(derive_proposal_windows([game(1, time(10)), game(2, time(14))], ZoneInfo("UTC"))) == 1
    )


def test_gap_greater_than_four_hours_splits_and_marks_reason() -> None:
    windows = derive_proposal_windows([game(1, time(9)), game(2, time(13, 1))], ZoneInfo("UTC"))
    assert len(windows) == 2
    assert all(item.split_reason == "KICKOFF_GAP_EXCEEDED" for item in windows)


def test_empty_games_returns_empty_state() -> None:
    assert derive_proposal_windows([], ZoneInfo("UTC")) == []


def test_multiple_venues_are_kept_in_same_daily_window() -> None:
    windows = derive_proposal_windows(
        [game(1, time(10), "A"), game(2, time(11), "B")], ZoneInfo("UTC")
    )
    assert {item.venue for item in windows[0].games} == {"A", "B"}


def test_window_uses_last_game_duration_and_configured_margins() -> None:
    games = [
        ProposalGame(UUID(int=1), "Spiel 1", date(2026, 8, 2), time(10), "A", 90),
        ProposalGame(UUID(int=2), "Spiel 2", date(2026, 8, 2), time(12), "A", 120),
    ]
    windows = derive_proposal_windows(
        games, ZoneInfo("Europe/Zurich"), pre_margin_minutes=20, post_margin_minutes=40
    )
    assert len(windows) == 1
    assert windows[0].start_at.time() == time(9, 40)
    assert windows[0].end_at.time() == time(14, 40)


def test_games_on_different_days_never_share_a_window() -> None:
    games = [
        game(1, time(10)),
        ProposalGame(UUID(int=2), "Spiel 2", date(2026, 8, 3), time(10), "A"),
    ]
    assert len(derive_proposal_windows(games, ZoneInfo("UTC"))) == 2


def _window(**overrides: object) -> ProposalWindowResponse:
    defaults: dict[str, object] = {
        "id": "window-1",
        "date": date(2026, 8, 2),
        "start_at": datetime(2026, 8, 2, 9, 30, tzinfo=ZoneInfo("UTC")),
        "end_at": datetime(2026, 8, 2, 13, 30, tzinfo=ZoneInfo("UTC")),
        "kiosk_open": True,
        "grill_required": True,
        "proposed_grill_slots": 2,
        "proposed_kiosk_slots": 1,
        "override_state": "PROPOSAL",
        "is_overridden": False,
        "split_reason": None,
        "venues": ["Sportplatz"],
        "crew_rule_context": None,
        "covered_event_ids": [uuid4()],
        "games": [],
        "kiosk_confirmed": False,
        "grill_confirmed": False,
    }
    defaults.update(overrides)
    return ProposalWindowResponse(**defaults)


class _ConfirmDb:
    """Minimal fake session returning queued scalar() results in call order."""

    def __init__(self, responses: list[object]) -> None:
        self._responses = list(responses)
        self.added: list[object] = []
        self.committed = False

    def scalar(self, _statement: object) -> object:
        return self._responses.pop(0)

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.committed = True


def test_confirm_grill_rejects_an_unconfirmed_kiosk_window(monkeypatch: pytest.MonkeyPatch) -> None:
    """D-042/D-041: a grill proposal may only be tied to an already-confirmed kiosk window."""
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(),
        window_key="window-1",
        proposal_date=window.date,
        kiosk_confirmed=False,
        grill_confirmed=False,
    )
    db = _ConfirmDb([override])
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self: [window])

    with pytest.raises(ProposalValidationError, match="Kiosk muss zuerst bestätigt werden"):
        service.confirm("window-1", "grill", uuid4())

    # The reordered check must validate before mutating: a rejected grill
    # confirmation must never leave the override half-confirmed, and must
    # never create a Shift or commit anything.
    assert override.grill_confirmed is False
    assert db.added == []
    assert db.committed is False


def test_confirm_grill_succeeds_once_kiosk_is_confirmed(monkeypatch: pytest.MonkeyPatch) -> None:
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(),
        window_key="window-1",
        proposal_date=window.date,
        kiosk_confirmed=True,
        grill_confirmed=False,
    )
    # First scalar() call resolves the ProposalOverride row; the second
    # resolves the "does a matching Shift already exist" lookup (none yet).
    db = _ConfirmDb([override, None])
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self: [window])

    service.confirm("window-1", "grill", uuid4())

    assert override.grill_confirmed is True
    created = next(item for item in db.added if isinstance(item, Shift))
    assert created.shift_type == ShiftType.GRILL
    assert created.status == ShiftStatus.OPEN
    assert created.required_volunteers == window.proposed_grill_slots
    assert db.committed is True
