from datetime import date, datetime, time
from typing import cast
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import pytest

from app.models.planning import Shift, ShiftStatus, ShiftType, Signup
from app.models.proposal import ProposalOverride, ProposalShiftSplit
from app.schemas.proposals import (
    ProposalGrillSplitsUpdate,
    ProposalKioskSplitsUpdate,
    ProposalShiftSplitInput,
    ProposalWindowResponse,
)
from app.services.proposals import (
    ProposalGame,
    ProposalNotFoundError,
    ProposalService,
    ProposalValidationError,
    ProposalWindow,
    derive_proposal_windows,
    exclude_past_windows,
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


def test_exclude_past_windows_keeps_today_and_future_only() -> None:
    earlier = derive_proposal_windows([game(1, time(10))], ZoneInfo("UTC"))[0]
    on_target_date = derive_proposal_windows(
        [ProposalGame(UUID(int=2), "Spiel 2", date(2026, 8, 5), time(10), "Sportplatz")],
        ZoneInfo("UTC"),
    )[0]
    later = derive_proposal_windows(
        [ProposalGame(UUID(int=3), "Spiel 3", date(2026, 8, 9), time(10), "Sportplatz")],
        ZoneInfo("UTC"),
    )[0]
    result = exclude_past_windows([earlier, on_target_date, later], date(2026, 8, 5))
    assert result == [on_target_date, later]


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


class _ScalarsResult:
    """Minimal stand-in for SQLAlchemy's ScalarResult, only supporting .all()."""

    def __init__(self, items: list[object]) -> None:
        self._items = items

    def all(self) -> list[object]:
        return self._items


class _ConfirmDb:
    """Minimal fake session returning queued scalar()/scalars() results in call order."""

    def __init__(
        self,
        responses: list[object],
        scalars_responses: list[list[object]] | None = None,
    ) -> None:
        self._responses = list(responses)
        self._scalars_responses = list(scalars_responses or [])
        self.added: list[object] = []
        self.committed = False

    def scalar(self, _statement: object) -> object:
        return self._responses.pop(0)

    def scalars(self, _statement: object) -> _ScalarsResult:
        return _ScalarsResult(self._scalars_responses.pop(0))

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
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])

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
    # scalar() resolves the ProposalOverride row; scalars() resolves the
    # "which non-cancelled shifts already exist for this event/type" lookup
    # used for reconciliation (none yet).
    db = _ConfirmDb([override], scalars_responses=[[]])
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])

    service.confirm("window-1", "grill", uuid4())

    assert override.grill_confirmed is True
    created = next(item for item in db.added if isinstance(item, Shift))
    assert created.shift_type == ShiftType.GRILL
    assert created.status == ShiftStatus.OPEN
    assert created.required_volunteers == window.proposed_grill_slots
    assert db.committed is True


def test_confirm_grill_with_splits_creates_one_shift_per_split(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An admin-defined split (e.g. two shorter shifts instead of one long one)
    materialises one real Shift per split, each with its own time and headcount."""
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(),
        window_key="window-1",
        proposal_date=window.date,
        kiosk_confirmed=True,
        grill_confirmed=False,
    )
    override.splits = [
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 10, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 14, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.GRILL,
            sort_order=0,
        ),
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 14, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 20, tzinfo=ZoneInfo("UTC")),
            required_volunteers=2,
            shift_type=ShiftType.GRILL,
            sort_order=1,
        ),
    ]
    # scalar() resolves the ProposalOverride row; scalars() resolves the
    # existing-shifts reconciliation lookup (none found yet).
    db = _ConfirmDb([override], scalars_responses=[[]])
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])

    service.confirm("window-1", "grill", uuid4())

    created = [item for item in db.added if isinstance(item, Shift)]
    assert len(created) == 2
    assert [shift.required_volunteers for shift in created] == [1, 2]
    assert created[0].starts_at.hour == 10 and created[0].ends_at.hour == 14
    assert created[1].starts_at.hour == 14 and created[1].ends_at.hour == 20
    assert all(shift.shift_type == ShiftType.GRILL for shift in created)
    assert db.committed is True


def test_confirm_grill_reconfirm_after_splitting_cancels_the_orphaned_whole_window_shift(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An admin who first confirmed one whole-window shift and later splits the
    window into several timed sub-shifts must not end up with both: the
    orphaned whole-window shift is cancelled once it no longer matches any
    current split, instead of lingering alongside the new ones."""
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(),
        window_key="window-1",
        proposal_date=window.date,
        kiosk_confirmed=True,
        grill_confirmed=True,
    )
    override.splits = [
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 11, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 15, 30, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.GRILL,
            sort_order=0,
        ),
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 15, 30, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 20, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.GRILL,
            sort_order=1,
        ),
    ]
    orphaned_shift = Shift(
        event_id=window.covered_event_ids[0],
        starts_at=window.start_at,
        ends_at=window.end_at,
        required_volunteers=2,
        status=ShiftStatus.OPEN,
        shift_type=ShiftType.GRILL,
    )
    db = _ConfirmDb([override], scalars_responses=[[orphaned_shift]])
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])

    service.confirm("window-1", "grill", uuid4())

    assert orphaned_shift.status == ShiftStatus.CANCELLED
    created = [item for item in db.added if isinstance(item, Shift)]
    assert len(created) == 2
    assert {(shift.starts_at.hour, shift.ends_at.hour) for shift in created} == {(11, 15), (15, 20)}
    assert db.committed is True


def test_confirm_grill_blocks_reconfirm_when_orphaned_shift_has_signups(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If the shift that would become orphaned by a changed split already has
    real signups, silently cancelling it would drop a volunteer's commitment.
    The admin must resolve this in Anwesenheit first."""
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(),
        window_key="window-1",
        proposal_date=window.date,
        kiosk_confirmed=True,
        grill_confirmed=True,
    )
    override.splits = [
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 11, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 20, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.GRILL,
            sort_order=0,
        ),
    ]
    orphaned_shift = Shift(
        event_id=window.covered_event_ids[0],
        starts_at=window.start_at,
        ends_at=window.end_at,
        required_volunteers=2,
        status=ShiftStatus.OPEN,
        shift_type=ShiftType.GRILL,
    )
    orphaned_shift.signups = [
        Signup(shift_id=uuid4(), volunteer_id=uuid4(), public_name_snapshot="Test Helfer")
    ]
    db = _ConfirmDb([override], scalars_responses=[[orphaned_shift]])
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])

    with pytest.raises(ProposalValidationError, match="bestehen bereits Anmeldungen"):
        service.confirm("window-1", "grill", uuid4())

    assert orphaned_shift.status == ShiftStatus.OPEN
    assert db.added == []
    assert db.committed is False


class _SplitsDb:
    """Fake session for update_grill_shift_splits: one scalar() for the override
    lookup, and add()/commit() bookkeeping like the other fake DBs in this file."""

    def __init__(self, override: ProposalOverride | None) -> None:
        self.override = override
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, _statement: object) -> ProposalOverride | None:
        return self.override

    def add(self, obj: object) -> None:
        self.added.append(obj)

    def flush(self) -> None:
        pass

    def commit(self) -> None:
        self.commits += 1


def test_update_grill_shift_splits_replaces_existing_splits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(), window_key="window-1", proposal_date=window.date
    )
    override.splits = [
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 9, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 10, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.GRILL,
            sort_order=0,
        )
    ]
    db = _SplitsDb(override)
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])
    payload = ProposalGrillSplitsUpdate(
        shifts=[
            ProposalShiftSplitInput(
                starts_at=datetime(2026, 8, 2, 10, tzinfo=ZoneInfo("UTC")),
                ends_at=datetime(2026, 8, 2, 14, tzinfo=ZoneInfo("UTC")),
                required_volunteers=1,
            ),
            ProposalShiftSplitInput(
                starts_at=datetime(2026, 8, 2, 14, tzinfo=ZoneInfo("UTC")),
                ends_at=datetime(2026, 8, 2, 20, tzinfo=ZoneInfo("UTC")),
                required_volunteers=2,
            ),
        ]
    )

    service.update_grill_shift_splits("window-1", payload, uuid4())

    assert [split.required_volunteers for split in override.splits] == [1, 2]
    assert [split.sort_order for split in override.splits] == [0, 1]
    assert db.commits == 1


def test_update_grill_shift_splits_rejects_a_split_on_another_day(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    window = _window()
    db = _SplitsDb(None)
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])
    payload = ProposalGrillSplitsUpdate(
        shifts=[
            ProposalShiftSplitInput(
                starts_at=datetime(2026, 8, 3, 10, tzinfo=ZoneInfo("UTC")),
                ends_at=datetime(2026, 8, 3, 14, tzinfo=ZoneInfo("UTC")),
                required_volunteers=1,
            )
        ]
    )

    with pytest.raises(ProposalValidationError, match="proposal date"):
        service.update_grill_shift_splits("window-1", payload, uuid4())

    assert db.commits == 0


def test_update_grill_shift_splits_rejects_unknown_window(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _SplitsDb(None)
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [])

    with pytest.raises(ProposalNotFoundError):
        service.update_grill_shift_splits(
            "missing-window", ProposalGrillSplitsUpdate(shifts=[]), uuid4()
        )


def test_confirm_kiosk_with_splits_creates_one_shift_per_split(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Mirrors test_confirm_grill_with_splits_creates_one_shift_per_split: an
    admin-defined Kiosk split materialises one real (CLOSED) Shift per split."""
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(),
        window_key="window-1",
        proposal_date=window.date,
        kiosk_confirmed=False,
        grill_confirmed=False,
    )
    override.splits = [
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 9, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 11, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.KIOSK,
            sort_order=0,
        ),
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 11, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 13, 30, tzinfo=ZoneInfo("UTC")),
            required_volunteers=2,
            shift_type=ShiftType.KIOSK,
            sort_order=1,
        ),
    ]
    # scalar() resolves the ProposalOverride row; scalars() resolves the
    # existing-shifts reconciliation lookup (none found yet).
    db = _ConfirmDb([override], scalars_responses=[[]])
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])

    service.confirm("window-1", "kiosk", uuid4())

    created = [item for item in db.added if isinstance(item, Shift)]
    assert len(created) == 2
    assert [shift.required_volunteers for shift in created] == [1, 2]
    assert created[0].starts_at.hour == 9 and created[0].ends_at.hour == 11
    assert created[1].starts_at.hour == 11 and created[1].ends_at.hour == 13
    assert all(shift.shift_type == ShiftType.KIOSK for shift in created)
    assert all(shift.status == ShiftStatus.CLOSED for shift in created)
    assert override.kiosk_confirmed is True
    assert db.committed is True


def test_update_kiosk_shift_splits_replaces_existing_splits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    window = _window()
    override = ProposalOverride(
        organization_id=uuid4(), window_key="window-1", proposal_date=window.date
    )
    override.splits = [
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 9, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 10, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.KIOSK,
            sort_order=0,
        )
    ]
    db = _SplitsDb(override)
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])
    payload = ProposalKioskSplitsUpdate(
        shifts=[
            ProposalShiftSplitInput(
                starts_at=datetime(2026, 8, 2, 10, tzinfo=ZoneInfo("UTC")),
                ends_at=datetime(2026, 8, 2, 12, tzinfo=ZoneInfo("UTC")),
                required_volunteers=1,
            ),
            ProposalShiftSplitInput(
                starts_at=datetime(2026, 8, 2, 12, tzinfo=ZoneInfo("UTC")),
                ends_at=datetime(2026, 8, 2, 13, 30, tzinfo=ZoneInfo("UTC")),
                required_volunteers=2,
            ),
        ]
    )

    service.update_kiosk_shift_splits("window-1", payload, uuid4())

    assert [split.required_volunteers for split in override.splits] == [1, 2]
    assert [split.sort_order for split in override.splits] == [0, 1]
    assert all(split.shift_type == ShiftType.KIOSK for split in override.splits)
    assert db.commits == 1


def test_update_kiosk_shift_splits_rejects_a_split_on_another_day(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    window = _window()
    db = _SplitsDb(None)
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])
    payload = ProposalKioskSplitsUpdate(
        shifts=[
            ProposalShiftSplitInput(
                starts_at=datetime(2026, 8, 3, 10, tzinfo=ZoneInfo("UTC")),
                ends_at=datetime(2026, 8, 3, 14, tzinfo=ZoneInfo("UTC")),
                required_volunteers=1,
            )
        ]
    )

    with pytest.raises(ProposalValidationError, match="proposal date"):
        service.update_kiosk_shift_splits("window-1", payload, uuid4())

    assert db.commits == 0


def test_update_kiosk_shift_splits_rejects_unknown_window(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _SplitsDb(None)
    service = ProposalService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [])

    with pytest.raises(ProposalNotFoundError):
        service.update_kiosk_shift_splits(
            "missing-window", ProposalKioskSplitsUpdate(shifts=[]), uuid4()
        )


def test_response_places_splits_under_their_matching_kind_list() -> None:
    """list_windows()'s _response() must split a window's mixed-kind splits into
    grill_shift_splits and kiosk_shift_splits by shift_type, not lump every row
    into grill_shift_splits regardless of kind."""
    window = ProposalWindow(
        id="window-1",
        date=date(2026, 8, 2),
        start_at=datetime(2026, 8, 2, 9, 30, tzinfo=ZoneInfo("UTC")),
        end_at=datetime(2026, 8, 2, 13, 30, tzinfo=ZoneInfo("UTC")),
        games=(),
        split_reason=None,
    )
    override = ProposalOverride(
        organization_id=uuid4(), window_key="window-1", proposal_date=window.date
    )
    override.splits = [
        ProposalShiftSplit(
            id=uuid4(),
            starts_at=datetime(2026, 8, 2, 9, 30, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 11, tzinfo=ZoneInfo("UTC")),
            required_volunteers=1,
            shift_type=ShiftType.KIOSK,
            sort_order=0,
        ),
        ProposalShiftSplit(
            id=uuid4(),
            starts_at=datetime(2026, 8, 2, 11, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 13, 30, tzinfo=ZoneInfo("UTC")),
            required_volunteers=2,
            shift_type=ShiftType.GRILL,
            sort_order=0,
        ),
    ]
    service = ProposalService(cast(object, None), uuid4())  # type: ignore[arg-type]

    response = service._response(window, override, [])

    assert [split.required_volunteers for split in response.kiosk_shift_splits] == [1]
    assert [split.required_volunteers for split in response.grill_shift_splits] == [2]


def test_grill_and_kiosk_splits_on_same_window_are_independent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Kiosk and Grill splits coexist as independent rows on the same
    ProposalOverride: replacing one kind must never touch the other, and
    confirming one kind must never require or consume the other's splits."""
    window = _window()

    # Replacing the KIOSK splits must leave an already-saved GRILL split intact.
    override = ProposalOverride(
        organization_id=uuid4(),
        window_key="window-1",
        proposal_date=window.date,
        kiosk_confirmed=False,
        grill_confirmed=False,
    )
    override.splits = [
        ProposalShiftSplit(
            starts_at=datetime(2026, 8, 2, 9, 30, tzinfo=ZoneInfo("UTC")),
            ends_at=datetime(2026, 8, 2, 13, 30, tzinfo=ZoneInfo("UTC")),
            required_volunteers=3,
            shift_type=ShiftType.GRILL,
            sort_order=0,
        )
    ]
    splits_db = _SplitsDb(override)
    splits_service = ProposalService(cast(object, splits_db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(ProposalService, "list_windows", lambda _self, include_past=False: [window])
    splits_service.update_kiosk_shift_splits(
        "window-1",
        ProposalKioskSplitsUpdate(
            shifts=[
                ProposalShiftSplitInput(
                    starts_at=datetime(2026, 8, 2, 10, tzinfo=ZoneInfo("UTC")),
                    ends_at=datetime(2026, 8, 2, 12, tzinfo=ZoneInfo("UTC")),
                    required_volunteers=1,
                )
            ]
        ),
        uuid4(),
    )
    grill_remaining = [split for split in override.splits if split.shift_type == ShiftType.GRILL]
    kiosk_added = [split for split in override.splits if split.shift_type == ShiftType.KIOSK]
    assert len(grill_remaining) == 1 and grill_remaining[0].required_volunteers == 3
    assert len(kiosk_added) == 1 and kiosk_added[0].required_volunteers == 1

    # Confirming kiosk only ever materialises the KIOSK-kind split and never
    # touches/consumes the still-unconfirmed GRILL split sitting on the same row.
    kiosk_db = _ConfirmDb([override], scalars_responses=[[]])
    kiosk_confirm_service = ProposalService(cast(object, kiosk_db), uuid4())  # type: ignore[arg-type]
    kiosk_confirm_service.confirm("window-1", "kiosk", uuid4())
    kiosk_created = [item for item in kiosk_db.added if isinstance(item, Shift)]
    assert len(kiosk_created) == 1
    assert kiosk_created[0].shift_type == ShiftType.KIOSK
    assert kiosk_created[0].required_volunteers == 1
    assert override.grill_confirmed is False
    assert len(override.splits) == 2  # both splits still present, nothing consumed

    # Confirming grill (now unblocked since kiosk_confirmed was just set) only
    # ever materialises the GRILL-kind split; it never requires or reads the
    # kiosk split that's still sitting on the same override.
    grill_db = _ConfirmDb([override], scalars_responses=[[]])
    grill_confirm_service = ProposalService(cast(object, grill_db), uuid4())  # type: ignore[arg-type]
    grill_confirm_service.confirm("window-1", "grill", uuid4())
    grill_created = [item for item in grill_db.added if isinstance(item, Shift)]
    assert len(grill_created) == 1
    assert grill_created[0].shift_type == ShiftType.GRILL
    assert grill_created[0].required_volunteers == 3
