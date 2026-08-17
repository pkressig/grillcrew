"""Focused F003 planning model, validation, lifecycle, and tenant tests."""

from collections.abc import Sequence
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.api import dependencies, planning
from app.api.dependencies import CurrentStaffMembership
from app.core.config import get_settings
from app.core.security.csrf import CSRF_HEADER_NAME, derive_csrf_secret, generate_csrf_token
from app.db.session import get_db
from app.main import app
from app.models.identity import AuditEvent
from app.models.organization import CrewSizeRule, MenuType, Organization
from app.models.planning import (
    ClubYear,
    Event,
    EventStatus,
    PlanningStatus,
    Season,
    SeasonType,
    Shift,
    ShiftAssignmentMode,
    ShiftStatus,
    ShiftType,
    Signup,
    SignupOutcome,
    SignupSource,
    SignupStatus,
)
from app.schemas.planning import (
    ClubYearCreate,
    EventCreate,
    EventUpdate,
    SeasonCreate,
    SeasonUpdate,
    ShiftCreate,
    ShiftUpdate,
    SignupAttendanceUpdate,
)
from app.services.auth import REFRESH_TOKEN_COOKIE_NAME
from app.services.planning import (
    PlanningConflictError,
    PlanningNotFoundError,
    PlanningService,
    PlanningValidationError,
    validate_transition,
)


def test_model_relationships_and_enum_values() -> None:
    assert ClubYear.organization.property.back_populates == "club_years"
    assert Season.club_year.property.back_populates == "seasons"
    assert [item.value for item in PlanningStatus] == ["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]
    assert [item.value for item in SeasonType] == ["AUTUMN", "SPRING", "OTHER"]
    assert Event.season.property.back_populates == "events"
    assert Shift.event.property.back_populates == "shifts"
    assert [item.value for item in EventStatus] == [
        "DRAFT",
        "PUBLISHED",
        "POSTPONED",
        "CANCELLED",
        "COMPLETED",
    ]
    assert [item.value for item in ShiftStatus] == ["OPEN", "CLOSED", "CANCELLED"]


def test_invalid_payload_date_ranges_are_rejected() -> None:
    with pytest.raises(ValidationError):
        ClubYearCreate(label="2026", start_date=date(2027, 1, 1), end_date=date(2026, 1, 1))


@pytest.mark.parametrize(
    ("current", "requested"),
    [
        (PlanningStatus.DRAFT, PlanningStatus.ACTIVE),
        (PlanningStatus.DRAFT, PlanningStatus.CLOSED),
        (PlanningStatus.ACTIVE, PlanningStatus.CLOSED),
        (PlanningStatus.CLOSED, PlanningStatus.ARCHIVED),
    ],
)
def test_valid_status_transitions(current: PlanningStatus, requested: PlanningStatus) -> None:
    validate_transition(current, requested)


@pytest.mark.parametrize(
    ("current", "requested"),
    [
        (PlanningStatus.ACTIVE, PlanningStatus.DRAFT),
        (PlanningStatus.CLOSED, PlanningStatus.ACTIVE),
        (PlanningStatus.ARCHIVED, PlanningStatus.DRAFT),
    ],
)
def test_invalid_and_archived_status_transitions(
    current: PlanningStatus, requested: PlanningStatus
) -> None:
    with pytest.raises(PlanningConflictError):
        validate_transition(current, requested)


def test_season_must_fit_inside_club_year() -> None:
    club_year = cast(
        ClubYear, SimpleNamespace(start_date=date(2026, 7, 1), end_date=date(2027, 6, 30))
    )
    with pytest.raises(PlanningValidationError, match="fit inside"):
        PlanningService._validate_inside_club_year(date(2026, 6, 30), date(2026, 12, 31), club_year)


def test_closed_season_rejects_field_edits() -> None:
    club_year = cast(
        ClubYear, SimpleNamespace(start_date=date(2026, 7, 1), end_date=date(2027, 6, 30))
    )
    season = cast(
        Season,
        SimpleNamespace(
            id=uuid4(),
            status=PlanningStatus.CLOSED,
            start_date=date(2026, 7, 1),
            end_date=date(2026, 12, 31),
            club_year=club_year,
        ),
    )
    service = PlanningService(cast(object, _SeasonDb(season)), uuid4())  # type: ignore[arg-type]
    with pytest.raises(PlanningConflictError, match="cannot be edited"):
        service.update_season(season.id, SeasonUpdate(name="Changed"))


def test_delete_season_removes_only_requested_unused_draft() -> None:
    target = SimpleNamespace(id=uuid4(), status=PlanningStatus.DRAFT, name="Test", club_year=None)
    unrelated = SimpleNamespace(id=uuid4(), status=PlanningStatus.DRAFT, name="Other")
    db = _DeleteDb(target, [0, 0])

    PlanningService(cast(object, db), uuid4()).delete_season(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == [target]
    assert unrelated not in db.deleted
    assert db.commits == 1


def test_delete_dependency_free_archived_season() -> None:
    target = SimpleNamespace(id=uuid4(), status=PlanningStatus.ARCHIVED, name="Historical")
    db = _DeleteDb(target, [0, 0])

    PlanningService(cast(object, db), uuid4()).delete_season(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == [target]
    assert db.commits == 1


def test_delete_dependency_free_archived_club_year() -> None:
    target = SimpleNamespace(id=uuid4(), status=PlanningStatus.ARCHIVED, label="2024/25")
    db = _DeleteDb(target, [0, 0, 0])

    PlanningService(cast(object, db), uuid4()).delete_club_year(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == [target]
    assert db.commits == 1


@pytest.mark.parametrize(
    ("counts", "reason"),
    [([1, 0], "Anlass"), ([0, 2], "Importzeile")],
)
def test_delete_season_reports_concrete_dependency(counts: list[int], reason: str) -> None:
    target = SimpleNamespace(id=uuid4(), status=PlanningStatus.DRAFT, name="Historical")
    db = _DeleteDb(target, counts)

    with pytest.raises(PlanningConflictError, match=reason):
        PlanningService(cast(object, db), uuid4()).delete_season(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == []
    assert db.commits == 0


@pytest.mark.parametrize(
    ("counts", "reason"),
    [([1, 0, 0], "Saison"), ([0, 1, 0], "Anlass"), ([0, 0, 1], "Import")],
)
def test_delete_club_year_blocks_each_dependency(counts: list[int], reason: str) -> None:
    target = SimpleNamespace(id=uuid4(), status=PlanningStatus.DRAFT, label="2026/27")
    db = _DeleteDb(target, counts)

    with pytest.raises(PlanningConflictError, match=reason):
        PlanningService(cast(object, db), uuid4()).delete_club_year(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == []


def test_delete_dependency_free_completed_event_and_its_shifts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = SimpleNamespace(
        id=uuid4(),
        status=EventStatus.COMPLETED,
        title="Testspiel",
        date=date(2026, 8, 1),
        season=SimpleNamespace(),
    )
    shifts: list[object] = [SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())]
    db = _EventDeleteDb(target, shifts, [0, 0, 0])
    monkeypatch.setattr(PlanningService, "_planning_reference_counts", lambda *_args: (0, 0))

    PlanningService(cast(object, db), uuid4()).delete_event(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == [target]
    assert db.commits == 1
    audit = next(item for item in db.added if isinstance(item, AuditEvent))
    assert audit.action == "EVENT_DELETED"
    assert audit.event_metadata["shift_count"] == "2"


@pytest.mark.parametrize(
    ("counts", "reason"),
    [
        ([2, 0, 0, 0, 0], "2 Anmeldung"),
        ([0, 1, 0, 0, 0], "1 Arbeitsnachweis"),
        ([0, 0, 3, 0, 0], "3 Spielplan-Importzeile"),
        ([0, 0, 0, 1, 0], "1 manuelle Planungsreferenz"),
        ([0, 0, 0, 0, 4], "4 externe Vergleichszeile"),
    ],
)
def test_delete_event_blocks_each_historical_dependency(
    counts: list[int], reason: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = SimpleNamespace(
        id=uuid4(),
        status=EventStatus.CANCELLED,
        title="Historisch",
        date=date(2026, 8, 1),
        season=SimpleNamespace(),
    )
    db = _EventDeleteDb(target, [SimpleNamespace(id=uuid4())], counts[:3])
    monkeypatch.setattr(
        PlanningService, "_planning_reference_counts", lambda *_args: tuple(counts[3:])
    )

    with pytest.raises(PlanningConflictError, match=reason):
        PlanningService(cast(object, db), uuid4()).delete_event(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == []
    assert db.commits == 0


def test_delete_event_is_tenant_isolated_and_idempotent_when_missing() -> None:
    db = _EventDeleteDb(None, [], [])
    PlanningService(cast(object, db), uuid4()).delete_event(uuid4(), uuid4())  # type: ignore[arg-type]
    assert db.deleted == []
    assert db.commits == 0


def test_delete_event_rejects_active_event() -> None:
    target = SimpleNamespace(
        id=uuid4(),
        status=EventStatus.PUBLISHED,
        title="Aktiv",
        date=date(2026, 8, 1),
        season=SimpleNamespace(),
    )
    db = _EventDeleteDb(target, [], [])
    with pytest.raises(PlanningConflictError, match="erledigte oder abgesagte"):
        PlanningService(cast(object, db), uuid4()).delete_event(target.id, uuid4())  # type: ignore[arg-type]
    assert db.commits == 0


def test_force_delete_historical_event_removes_five_signups_and_owned_records(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = SimpleNamespace(
        id=uuid4(), status=EventStatus.COMPLETED, title="Historisch", date=date(2026, 8, 1)
    )
    shifts = [SimpleNamespace(id=uuid4())]
    signups = [SimpleNamespace(id=uuid4()) for _ in range(5)]
    work_records = [SimpleNamespace(id=uuid4()), SimpleNamespace(id=uuid4())]
    import_rows = [SimpleNamespace(id=uuid4())]
    override = SimpleNamespace(id=uuid4())
    comparison = SimpleNamespace(id=uuid4(), batch_id=uuid4())
    db = _ForceEventDeleteDb(target, [shifts, signups, work_records, import_rows])
    monkeypatch.setattr(
        PlanningService,
        "_owned_planning_references",
        lambda *_args: ([override], [comparison]),
    )

    PlanningService(cast(object, db), uuid4()).force_delete_historical_event(  # type: ignore[arg-type]
        target.id, uuid4()
    )

    assert db.deleted == [*work_records, *signups, *shifts, override, comparison, target]
    assert db.commits == 1
    audit = next(item for item in db.added if isinstance(item, AuditEvent))
    assert audit.action == "EVENT_FORCE_DELETED"
    assert audit.entity_id == target.id
    assert audit.event_metadata["signup_count"] == "5"
    assert audit.event_metadata["work_record_count"] == "2"
    assert audit.event_metadata["explicit_force_delete"] == "True"
    assert audit not in db.deleted
    assert any("UPDATE import_row" in str(statement) for statement in db.executed)
    assert any("UPDATE external_kiosk_batch" in str(statement) for statement in db.executed)


def test_force_delete_empty_historical_event(monkeypatch: pytest.MonkeyPatch) -> None:
    target = SimpleNamespace(
        id=uuid4(), status=EventStatus.CANCELLED, title="Leer", date=date(2026, 8, 1)
    )
    db = _ForceEventDeleteDb(target, [[], []])
    monkeypatch.setattr(PlanningService, "_owned_planning_references", lambda *_args: ([], []))

    PlanningService(cast(object, db), uuid4()).force_delete_historical_event(  # type: ignore[arg-type]
        target.id, uuid4()
    )

    assert db.deleted == [target]
    assert db.commits == 1


def test_force_delete_is_tenant_isolated() -> None:
    db = _ForceEventDeleteDb(None, [])
    with pytest.raises(PlanningNotFoundError):
        PlanningService(cast(object, db), uuid4()).force_delete_historical_event(  # type: ignore[arg-type]
            uuid4(), uuid4()
        )
    assert db.deleted == []
    assert db.commits == 0


def test_force_delete_rejects_active_event() -> None:
    target = SimpleNamespace(
        id=uuid4(), status=EventStatus.PUBLISHED, title="Aktiv", date=date(2026, 8, 1)
    )
    db = _ForceEventDeleteDb(target, [])
    with pytest.raises(PlanningConflictError, match="erledigte oder abgesagte"):
        PlanningService(cast(object, db), uuid4()).force_delete_historical_event(  # type: ignore[arg-type]
            target.id, uuid4()
        )
    assert db.commits == 0


def test_force_delete_reference_plan_retains_shared_and_unrelated_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = cast(Event, SimpleNamespace(id=uuid4(), date=date(2026, 8, 1)))
    exclusive = SimpleNamespace(id="exclusive", covered_event_ids=[target.id])
    shared = SimpleNamespace(id="shared", covered_event_ids=[target.id, uuid4()])
    unrelated = SimpleNamespace(id="unrelated", covered_event_ids=[uuid4()])
    override = SimpleNamespace(id=uuid4())
    exclusive_row = SimpleNamespace(id=uuid4(), matches={"exclusive"})
    shared_row = SimpleNamespace(id=uuid4(), matches={"exclusive", "unrelated"})
    unrelated_row = SimpleNamespace(id=uuid4(), matches={"unrelated"})

    class FakeProposalService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def list_windows(self) -> list[object]:
            return [exclusive, shared, unrelated]

    db = _OwnedReferenceDb([override], [exclusive_row, shared_row, unrelated_row])
    monkeypatch.setattr("app.services.proposals.ProposalService", FakeProposalService)
    monkeypatch.setattr(
        PlanningService,
        "_comparison_row_matches",
        staticmethod(lambda row, window, _timezone: window.id in row.matches),
    )

    overrides, rows = PlanningService(
        cast(Session, db), db.organization.id
    )._owned_planning_references(target)

    assert overrides == [override]
    assert rows == [exclusive_row]


def test_force_delete_blocks_ambiguous_orphaned_proposal_reference(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = cast(Event, SimpleNamespace(id=uuid4(), date=date(2026, 8, 1)))

    class EmptyProposalService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def list_windows(self) -> list[object]:
            return []

    class AmbiguousReferenceDb:
        def scalar(self, _statement: object) -> int:
            return 1

    monkeypatch.setattr("app.services.proposals.ProposalService", EmptyProposalService)

    with pytest.raises(PlanningConflictError, match="nicht eindeutig"):
        PlanningService(cast(Session, AmbiguousReferenceDb()), uuid4())._owned_planning_references(
            target
        )


def test_planning_reference_counts_ignore_unrelated_same_date_windows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    target = cast(Event, SimpleNamespace(id=uuid4(), date=date(2026, 8, 1)))
    target_window = SimpleNamespace(
        covered_event_ids=[target.id],
        is_overridden=False,
        start_at=datetime(2026, 8, 1, 10, tzinfo=UTC),
        end_at=datetime(2026, 8, 1, 12, tzinfo=UTC),
        grill_required=True,
    )
    unrelated_window = SimpleNamespace(
        covered_event_ids=[uuid4()],
        is_overridden=True,
        start_at=datetime(2026, 8, 1, 16, tzinfo=UTC),
        end_at=datetime(2026, 8, 1, 18, tzinfo=UTC),
        grill_required=True,
    )
    unrelated_row = SimpleNamespace(
        id=uuid4(),
        category="KIOSK",
        plan_date=target.date,
        start_time=datetime(2026, 8, 1, 16).time(),
        end_time=datetime(2026, 8, 1, 18).time(),
    )
    db = _DerivedReferenceDb([unrelated_row])
    monkeypatch.setattr(
        "app.services.proposals.ProposalService.list_windows",
        lambda _self: [target_window, unrelated_window],
    )

    assert PlanningService(cast(object, db), db.organization.id)._planning_reference_counts(  # type: ignore[arg-type]
        target
    ) == (0, 0)
    assert "LOCK TABLE proposal_override, external_kiosk_row IN SHARE MODE" in str(db.executed[0])


def test_delete_lookups_remain_tenant_scoped() -> None:
    service = PlanningService(cast(object, _MissingDb()), uuid4())  # type: ignore[arg-type]
    with pytest.raises(PlanningNotFoundError):
        service.delete_season(uuid4(), uuid4())
    with pytest.raises(PlanningNotFoundError):
        service.delete_club_year(uuid4(), uuid4())


def test_client_payload_has_no_organization_id() -> None:
    payload = SeasonCreate(
        type=SeasonType.AUTUMN,
        name="Autumn",
        start_date=date(2026, 8, 1),
        end_date=date(2026, 12, 31),
    )
    assert "organization_id" not in payload.model_dump()


def test_attendance_payload_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        SignupAttendanceUpdate.model_validate(
            {"outcome": "ATTENDED", "organization_id": str(uuid4())}
        )


@pytest.mark.parametrize(
    "outcome",
    [
        SignupOutcome.OPEN,
        SignupOutcome.ATTENDED,
        SignupOutcome.EXCUSED_CANCELLED,
        SignupOutcome.LATE_CANCELLED,
        SignupOutcome.NO_SHOW,
        SignupOutcome.SUBSTITUTE_ORGANIZED,
    ],
)
def test_attendance_payload_accepts_all_outcomes(outcome: SignupOutcome) -> None:
    payload = SignupAttendanceUpdate.model_validate({"outcome": outcome.value})

    assert payload.outcome == outcome


def test_attendance_api_accepts_new_outcome_and_passes_actor(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    user = SimpleNamespace(id=uuid4())
    current = cast(CurrentStaffMembership, SimpleNamespace(organization=organization, user=user))
    changed = SimpleNamespace(
        id=uuid4(),
        public_name_snapshot="Mia Muster",
        volunteer=SimpleNamespace(
            first_name="Mia",
            last_name="Muster",
            phone_display="+41 79 123 45 67",
            email_display="mia@example.test",
        ),
        outcome=SignupOutcome.LATE_CANCELLED,
        created_at=datetime.now(UTC),
    )
    calls: list[tuple[object, SignupOutcome, object]] = []

    class FakePlanningService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def update_signup_attendance(
            self, signup_id: object, outcome: SignupOutcome, actor_user_id: object
        ) -> object:
            calls.append((signup_id, outcome, actor_user_id))
            return changed

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _ListDb()
    monkeypatch.setattr(planning, "PlanningService", FakePlanningService)
    monkeypatch.setattr(planning, "_ensure_origin_and_host", lambda *_args: None)
    signup_id = uuid4()
    try:
        response = client.patch(
            f"/api/admin/tenant-a/signups/{signup_id}/attendance",
            json={"outcome": SignupOutcome.LATE_CANCELLED.value},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert calls == [(signup_id, SignupOutcome.LATE_CANCELLED, user.id)]


@pytest.mark.parametrize(
    ("schema", "parent_field"), [(EventCreate, "season_id"), (ShiftCreate, "event_id")]
)
def test_child_create_payloads_reject_parent_overrides(schema: object, parent_field: str) -> None:
    values: dict[str, object]
    if schema is EventCreate:
        values = {
            "title": "Match",
            "date": date(2026, 9, 1),
            "location": "Pitch",
            "event_type": "MATCH",
        }
    else:
        values = {
            "starts_at": datetime(2026, 9, 1, 10, tzinfo=UTC),
            "ends_at": datetime(2026, 9, 1, 12, tzinfo=UTC),
            "required_volunteers": 2,
        }
    values[parent_field] = uuid4()
    values["organization_id"] = uuid4()
    with pytest.raises(ValidationError):
        schema.model_validate(values)  # type: ignore[attr-defined]


def test_event_date_must_be_inside_season() -> None:
    season = cast(Season, SimpleNamespace(start_date=date(2026, 8, 1), end_date=date(2026, 12, 31)))
    with pytest.raises(PlanningValidationError, match="inside its season"):
        PlanningService._validate_event_date(date(2027, 1, 1), season)


def test_shift_time_rules() -> None:
    with pytest.raises(PlanningValidationError, match="before"):
        PlanningService._validate_shift_times(
            datetime(2026, 9, 1, 12, tzinfo=UTC),
            datetime(2026, 9, 1, 10, tzinfo=UTC),
            date(2026, 9, 1),
        )
    with pytest.raises(PlanningValidationError, match="event date"):
        PlanningService._validate_shift_times(
            datetime(2026, 9, 1, 22, tzinfo=UTC),
            datetime(2026, 9, 2, 1, tzinfo=UTC),
            date(2026, 9, 1),
        )
    with pytest.raises(ValidationError):
        ShiftCreate(
            starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC),
            ends_at=datetime(2026, 9, 1, 11, tzinfo=UTC),
            required_volunteers=0,
        )


def test_update_shift_persists_new_time_window_and_required_volunteers() -> None:
    """PATCH /shifts/{shift_id} (via PlanningService.update_shift) already existed
    and is exercised by test_updates_reject_null_for_required_columns for its
    schema-level validation, but had no direct coverage of a successful update.
    The admin Kiosk panel is about to start relying on it to let an admin adjust
    an already-materialised shift's time window and headcount after confirmation."""
    event = SimpleNamespace(date=date(2026, 9, 1), title="Spiel 1", public_description=None)
    shift = SimpleNamespace(
        id=uuid4(),
        event=event,
        starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC),
        ends_at=datetime(2026, 9, 1, 12, tzinfo=UTC),
        required_volunteers=2,
        menu_type=None,
        crew_suggestion_overridden=False,
    )
    db = _ShiftUpdateDb(shift)

    result = PlanningService(cast(object, db), uuid4()).update_shift(  # type: ignore[arg-type]
        shift.id,
        ShiftUpdate(
            starts_at=datetime(2026, 9, 1, 11, tzinfo=UTC),
            ends_at=datetime(2026, 9, 1, 15, tzinfo=UTC),
            required_volunteers=4,
        ),
    )

    assert result.starts_at == datetime(2026, 9, 1, 11, tzinfo=UTC)
    assert result.ends_at == datetime(2026, 9, 1, 15, tzinfo=UTC)
    assert result.required_volunteers == 4
    assert db.commits == 1
    assert db.refreshes == 1


def test_delete_shift_removes_row_when_no_signups() -> None:
    target = SimpleNamespace(
        id=uuid4(), event_id=uuid4(), starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC)
    )
    db = _EventDeleteDb(target, [], [0])

    PlanningService(cast(object, db), uuid4()).delete_shift(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == [target]
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "SHIFT_DELETED"
    assert audit.entity_id == target.id


def test_delete_shift_blocks_when_signups_exist() -> None:
    target = SimpleNamespace(
        id=uuid4(), event_id=uuid4(), starts_at=datetime(2026, 9, 1, 10, tzinfo=UTC)
    )
    db = _EventDeleteDb(target, [], [2])

    with pytest.raises(PlanningConflictError, match="2 Anmeldung"):
        PlanningService(cast(object, db), uuid4()).delete_shift(target.id, uuid4())  # type: ignore[arg-type]

    assert db.deleted == []
    assert db.commits == 0


def test_delete_shift_is_tenant_isolated_and_raises_when_missing() -> None:
    db = _EventDeleteDb(None, [], [])

    with pytest.raises(PlanningNotFoundError):
        PlanningService(cast(object, db), uuid4()).delete_shift(uuid4(), uuid4())  # type: ignore[arg-type]

    assert db.commits == 0


@pytest.mark.parametrize(
    ("schema", "values"),
    [(EventUpdate, {"date": None}), (ShiftUpdate, {"required_volunteers": None})],
)
def test_updates_reject_null_for_required_columns(
    schema: object, values: dict[str, object]
) -> None:
    with pytest.raises(ValidationError):
        schema.model_validate(values)  # type: ignore[attr-defined]


def test_tenant_scoped_event_and_shift_lookups_reject_missing_chain() -> None:
    service = PlanningService(cast(object, _MissingDb()), uuid4())  # type: ignore[arg-type]
    with pytest.raises(PlanningNotFoundError):
        service._get_event(uuid4())
    with pytest.raises(PlanningNotFoundError):
        service._get_shift(uuid4())


class _EventsWithShiftsDb:
    def __init__(self, season: Season, events: list[Event]) -> None:
        self.season = season
        self.events = events
        self.statements: list[object] = []

    def scalar(self, statement: object) -> Season:
        self.statements.append(statement)
        return self.season

    def scalars(self, statement: object) -> list[Event]:
        self.statements.append(statement)
        return self.events


def _fake_shift(*, sort_order: int, starts_at: datetime) -> Shift:
    return cast(
        Shift,
        SimpleNamespace(
            id=uuid4(),
            event_id=uuid4(),
            starts_at=starts_at,
            ends_at=starts_at + timedelta(hours=1),
            required_volunteers=1,
            public_note=None,
            internal_note=None,
            status=ShiftStatus.OPEN,
            sort_order=sort_order,
            shift_type=ShiftType.GRILL,
            assignment_mode=ShiftAssignmentMode.OPEN_SIGNUP,
            menu_type=None,
            crew_suggestion_overridden=False,
            created_at=starts_at,
            updated_at=starts_at,
            signups=[],
        ),
    )


def test_list_events_with_shifts_scopes_to_the_requested_season() -> None:
    season = cast(Season, SimpleNamespace(id=uuid4()))
    now = datetime.now(UTC)
    event = cast(
        Event,
        SimpleNamespace(
            id=uuid4(),
            season_id=season.id,
            title="Meisterschaft",
            date=now.date(),
            location="Platz 1",
            event_type="Meisterschaft",
            public_description=None,
            internal_note=None,
            status=EventStatus.PUBLISHED,
            published_at=now,
            source_import_id=None,
            kickoff_time=None,
            duration_minutes=None,
            kiosk_requested=None,
            grill_requested=None,
            external_game_number=None,
            import_match_key=None,
            created_at=now,
            updated_at=now,
            shifts=[
                _fake_shift(sort_order=1, starts_at=now + timedelta(hours=2)),
                _fake_shift(sort_order=0, starts_at=now),
            ],
        ),
    )
    db = _EventsWithShiftsDb(season, [event])

    result = PlanningService(cast(object, db), uuid4()).list_events_with_shifts(  # type: ignore[arg-type]
        season.id
    )

    assert result == [event]
    # The season lookup must be scoped to this season id, matching list_events().
    assert "season.id" in str(db.statements[0])
    assert "event.season_id" in str(db.statements[1])


def test_events_with_shifts_route_nests_and_sorts_shifts(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = cast(
        CurrentStaffMembership,
        SimpleNamespace(organization=SimpleNamespace(id=uuid4(), slug="tenant-a")),
    )
    now = datetime.now(UTC)
    season_id = uuid4()
    event = cast(
        Event,
        SimpleNamespace(
            id=uuid4(),
            season_id=season_id,
            title="Meisterschaft",
            date=now.date(),
            location="Platz 1",
            event_type="Meisterschaft",
            public_description=None,
            internal_note=None,
            status=EventStatus.PUBLISHED,
            published_at=now,
            source_import_id=None,
            kickoff_time=None,
            duration_minutes=None,
            kiosk_requested=None,
            grill_requested=None,
            external_game_number=None,
            import_match_key=None,
            created_at=now,
            updated_at=now,
            shifts=[
                _fake_shift(sort_order=1, starts_at=now + timedelta(hours=2)),
                _fake_shift(sort_order=0, starts_at=now),
            ],
        ),
    )

    class FakeService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def list_events_with_shifts(self, received_season_id: object) -> list[Event]:
            assert received_season_id == season_id
            return [event]

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _ListDb()
    monkeypatch.setattr(planning, "PlanningService", FakeService)
    try:
        response = client.get(f"/api/admin/tenant-a/seasons/{season_id}/events-with-shifts")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    shift_ids = [shift["id"] for shift in body[0]["shifts"]]
    # Shifts come back sorted by sort_order regardless of the ORM relationship's
    # unspecified load order (the event was built with sort_order 1 before 0).
    assert shift_ids == [str(event.shifts[1].id), str(event.shifts[0].id)]


def test_event_shift_routes_are_registered_with_manage_guard() -> None:
    expected = {
        ("GET", "/api/admin/{organization_slug}/seasons/{season_id}/events"),
        ("GET", "/api/admin/{organization_slug}/seasons/{season_id}/events-with-shifts"),
        ("POST", "/api/admin/{organization_slug}/seasons/{season_id}/events"),
        ("PATCH", "/api/admin/{organization_slug}/events/{event_id}"),
        ("DELETE", "/api/admin/{organization_slug}/events/{event_id}"),
        ("GET", "/api/admin/{organization_slug}/events/{event_id}/shifts"),
        ("POST", "/api/admin/{organization_slug}/events/{event_id}/shifts"),
        ("PATCH", "/api/admin/{organization_slug}/shifts/{shift_id}"),
        ("POST", "/api/admin/{organization_slug}/signups/{signup_id}/cancel"),
        ("PATCH", "/api/admin/{organization_slug}/signups/{signup_id}/attendance"),
        ("GET", "/api/admin/{organization_slug}/signups/{signup_id}/work-record"),
        ("PATCH", "/api/admin/{organization_slug}/signups/{signup_id}/work-record"),
        (
            "PATCH",
            "/api/admin/{organization_slug}/signups/{signup_id}/work-record/payout-status",
        ),
    }
    actual = {
        (method, getattr(route, "path", ""))
        for route in planning.router.routes
        for method in getattr(route, "methods", set())
    }
    assert expected <= actual


def test_wrong_organization_slug_is_forbidden(client: TestClient) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(CurrentStaffMembership, SimpleNamespace(organization=organization))
    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _ListDb()
    try:
        response = client.get("/api/admin/tenant-b/club-years")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


@pytest.mark.parametrize(("blocked", "expected_status"), [(False, 204), (True, 409)])
def test_delete_event_endpoint_returns_success_or_concrete_conflict(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    blocked: bool,
    expected_status: int,
) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(
        CurrentStaffMembership,
        SimpleNamespace(organization=organization, user=SimpleNamespace(id=uuid4())),
    )

    class FakePlanningService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def delete_event(self, _event_id: object, _actor_id: object) -> None:
            if blocked:
                raise PlanningConflictError(
                    "Dieser Anlass kann nicht gelöscht werden: abhängig sind 2 Anmeldung(en)."
                )

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _ListDb()
    monkeypatch.setattr(planning, "PlanningService", FakePlanningService)
    monkeypatch.setattr(planning, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.request(
            "DELETE",
            f"/api/admin/tenant-a/events/{uuid4()}",
            json={"confirmation": "ANLASS_ENDGUELTIG_LOESCHEN"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == expected_status
    if blocked:
        assert "2 Anmeldung" in response.json()["detail"]


@pytest.mark.parametrize(("blocked", "expected_status"), [(False, 204), (True, 409)])
def test_delete_shift_endpoint_returns_success_or_concrete_conflict(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    blocked: bool,
    expected_status: int,
) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(
        CurrentStaffMembership,
        SimpleNamespace(organization=organization, user=SimpleNamespace(id=uuid4())),
    )

    class FakePlanningService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def delete_shift(self, _shift_id: object, _actor_id: object) -> None:
            if blocked:
                raise PlanningConflictError(
                    "Dieser Einsatz kann nicht gelöscht werden: es bestehen 1 Anmeldung(en). "
                    "Bitte zuerst absagen."
                )

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _ListDb()
    monkeypatch.setattr(planning, "PlanningService", FakePlanningService)
    monkeypatch.setattr(planning, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.request("DELETE", f"/api/admin/tenant-a/shifts/{uuid4()}")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == expected_status
    if blocked:
        assert "1 Anmeldung" in response.json()["detail"]


@pytest.mark.parametrize(
    "payload",
    [None, {"confirmation": "LOESCHEN"}],
)
def test_delete_event_endpoint_requires_exact_confirmation(
    client: TestClient, payload: dict[str, str] | None
) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(
        CurrentStaffMembership,
        SimpleNamespace(organization=organization, user=SimpleNamespace(id=uuid4())),
    )
    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _ListDb()
    try:
        response = client.request("DELETE", f"/api/admin/tenant-a/events/{uuid4()}", json=payload)
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


@pytest.mark.parametrize("payload", [None, {"confirmation": "LOESCHEN"}])
def test_force_delete_event_endpoint_requires_exact_confirmation(
    client: TestClient, payload: dict[str, str] | None
) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(
        CurrentStaffMembership,
        SimpleNamespace(organization=organization, user=SimpleNamespace(id=uuid4())),
    )
    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _ListDb()
    try:
        response = client.post(f"/api/admin/tenant-a/events/{uuid4()}/force-delete", json=payload)
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_admin_and_coordination_role_dependency_is_configured() -> None:
    assert callable(planning.manage)


def test_admin_cancel_sets_stable_metadata_and_returns_updated_shift() -> None:
    now = datetime.now(UTC)
    shift = SimpleNamespace(id=uuid4())
    signup = SimpleNamespace(
        id=uuid4(),
        status=SignupStatus.ACTIVE,
        cancelled_at=None,
        cancellation_reason=None,
        shift=shift,
    )
    db = _SignupDb(signup)

    result = PlanningService(cast(object, db), uuid4()).cancel_signup(  # type: ignore[arg-type]
        signup.id, now
    )

    assert result.id == shift.id
    assert signup.status == SignupStatus.CANCELLED_BY_ADMIN
    assert signup.cancelled_at == now
    assert signup.cancellation_reason == "ADMIN_MANUAL"
    assert db.commits == 1


def test_admin_cancel_is_idempotent_for_admin_cancellation() -> None:
    cancelled_at = datetime.now(UTC)
    signup = SimpleNamespace(
        id=uuid4(),
        status=SignupStatus.CANCELLED_BY_ADMIN,
        cancelled_at=cancelled_at,
        cancellation_reason="ADMIN_MANUAL",
        shift=SimpleNamespace(id=uuid4()),
    )
    db = _SignupDb(signup)

    PlanningService(cast(object, db), uuid4()).cancel_signup(  # type: ignore[arg-type]
        signup.id
    )

    assert signup.cancelled_at == cancelled_at
    assert db.commits == 0


def test_admin_cancel_does_not_overwrite_volunteer_cancellation() -> None:
    signup = SimpleNamespace(
        id=uuid4(),
        status=SignupStatus.CANCELLED_BY_VOLUNTEER,
        shift=SimpleNamespace(id=uuid4()),
    )
    db = _SignupDb(signup)

    with pytest.raises(PlanningConflictError, match="volunteer"):
        PlanningService(cast(object, db), uuid4()).cancel_signup(  # type: ignore[arg-type]
            signup.id
        )

    assert db.commits == 0


def test_attendance_update_audits_real_change_and_is_idempotent() -> None:
    signup = SimpleNamespace(
        id=uuid4(),
        status=SignupStatus.ACTIVE,
        outcome=SignupOutcome.OPEN,
        volunteer=SimpleNamespace(),
    )
    db = _SignupDb(signup)
    actor_user_id = uuid4()
    organization_id = uuid4()
    service = PlanningService(cast(object, db), organization_id)  # type: ignore[arg-type]

    result = service.update_signup_attendance(
        signup.id, SignupOutcome.SUBSTITUTE_ORGANIZED, actor_user_id
    )
    assert result.outcome == SignupOutcome.SUBSTITUTE_ORGANIZED
    assert db.commits == 1
    assert db.refreshes == 1
    assert len(db.added) == 1
    audit = db.added[0]
    assert isinstance(audit, AuditEvent)
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_user_id
    assert audit.action == "ATTENDANCE_OUTCOME_CHANGED"
    assert audit.entity_type == "signup"
    assert audit.entity_id == signup.id
    assert audit.event_metadata == {
        "previous_outcome": "OPEN",
        "new_outcome": "SUBSTITUTE_ORGANIZED",
    }

    service.update_signup_attendance(signup.id, SignupOutcome.SUBSTITUTE_ORGANIZED, actor_user_id)
    assert db.commits == 1
    assert db.refreshes == 1
    assert len(db.added) == 1


@pytest.mark.parametrize(
    "signup_status",
    [SignupStatus.CANCELLED_BY_VOLUNTEER, SignupStatus.CANCELLED_BY_ADMIN],
)
def test_cancelled_signup_rejects_attendance_update(signup_status: SignupStatus) -> None:
    signup = SimpleNamespace(id=uuid4(), status=signup_status, outcome=SignupOutcome.OPEN)
    db = _SignupDb(signup)

    with pytest.raises(PlanningConflictError, match="active signup"):
        PlanningService(cast(object, db), uuid4()).update_signup_attendance(  # type: ignore[arg-type]
            signup.id, SignupOutcome.NO_SHOW, uuid4()
        )

    assert db.commits == 0


def test_wrong_tenant_or_missing_signup_attendance_returns_not_found() -> None:
    with pytest.raises(PlanningNotFoundError):
        PlanningService(cast(object, _SignupDb(None)), uuid4()).update_signup_attendance(  # type: ignore[arg-type]
            uuid4(), SignupOutcome.ATTENDED, uuid4()
        )


def test_assign_volunteer_creates_active_admin_signup_and_returns_shift() -> None:
    shift = SimpleNamespace(id=uuid4(), status=ShiftStatus.OPEN, required_volunteers=2)
    volunteer = SimpleNamespace(id=uuid4(), first_name="Lea", last_name="Beispiel")
    db = _AssignVolunteerDb(shift, volunteer, occupied=1, duplicate=None)

    result = PlanningService(cast(object, db), uuid4()).assign_volunteer(  # type: ignore[arg-type]
        shift.id, volunteer.id
    )

    assert result.shift.id == shift.id
    assert result.signup is db.added[0]
    assert result.management_token
    assert db.commits == 1
    assert db.refreshes == 2
    assert len(db.added) == 1
    signup = db.added[0]
    assert isinstance(signup, Signup)
    assert signup.shift_id == shift.id
    assert signup.volunteer_id == volunteer.id
    assert signup.public_name_snapshot == "Lea Beispiel"
    assert signup.status == SignupStatus.ACTIVE
    assert signup.outcome == SignupOutcome.OPEN
    assert signup.source == SignupSource.ADMIN
    assert signup.management_token_hash


def test_assign_volunteer_works_for_a_closed_shift_regardless_of_assignment_mode() -> None:
    """Admin-assign bypasses public self-signup entirely: CLOSED shifts (used to lock the
    public flow while staff allocate manually) and assignment_mode are irrelevant here."""
    shift = SimpleNamespace(id=uuid4(), status=ShiftStatus.CLOSED, required_volunteers=1)
    volunteer = SimpleNamespace(id=uuid4(), first_name="Lea", last_name="Beispiel")
    db = _AssignVolunteerDb(shift, volunteer, occupied=0, duplicate=None)

    result = PlanningService(cast(object, db), uuid4()).assign_volunteer(  # type: ignore[arg-type]
        shift.id, volunteer.id
    )

    assert result.shift.id == shift.id
    assert db.commits == 1


def test_assign_volunteer_rejects_cancelled_shift() -> None:
    shift = SimpleNamespace(id=uuid4(), status=ShiftStatus.CANCELLED, required_volunteers=3)
    db = _AssignVolunteerDb(shift, None, occupied=0, duplicate=None)

    with pytest.raises(PlanningConflictError, match="abgesagte"):
        PlanningService(cast(object, db), uuid4()).assign_volunteer(  # type: ignore[arg-type]
            shift.id, uuid4()
        )
    assert db.commits == 0


def test_assign_volunteer_rejects_full_shift() -> None:
    shift = SimpleNamespace(id=uuid4(), status=ShiftStatus.OPEN, required_volunteers=2)
    volunteer = SimpleNamespace(id=uuid4(), first_name="Lea", last_name="Beispiel")
    db = _AssignVolunteerDb(shift, volunteer, occupied=2, duplicate=None)

    with pytest.raises(PlanningConflictError, match="vollständig besetzt"):
        PlanningService(cast(object, db), uuid4()).assign_volunteer(  # type: ignore[arg-type]
            shift.id, volunteer.id
        )
    assert db.commits == 0


def test_assign_volunteer_rejects_duplicate_signup() -> None:
    shift = SimpleNamespace(id=uuid4(), status=ShiftStatus.OPEN, required_volunteers=3)
    volunteer = SimpleNamespace(id=uuid4(), first_name="Lea", last_name="Beispiel")
    db = _AssignVolunteerDb(shift, volunteer, occupied=1, duplicate=uuid4())

    with pytest.raises(PlanningConflictError, match="bereits eingetragen"):
        PlanningService(cast(object, db), uuid4()).assign_volunteer(  # type: ignore[arg-type]
            shift.id, volunteer.id
        )
    assert db.commits == 0


def test_assign_volunteer_rejects_missing_shift() -> None:
    db = _AssignVolunteerDb(None, None, occupied=0, duplicate=None)

    with pytest.raises(PlanningNotFoundError):
        PlanningService(cast(object, db), uuid4()).assign_volunteer(  # type: ignore[arg-type]
            uuid4(), uuid4()
        )
    assert db.commits == 0


def test_assign_volunteer_is_tenant_isolated_for_a_volunteer_in_another_organization() -> None:
    """The volunteer lookup is scoped by organization_id, so a volunteer id that belongs to
    another tenant (or does not exist at all) is indistinguishable from "not found" here."""
    shift = SimpleNamespace(id=uuid4(), status=ShiftStatus.OPEN, required_volunteers=3)
    db = _AssignVolunteerDb(shift, None, occupied=0, duplicate=None)

    with pytest.raises(PlanningNotFoundError):
        PlanningService(cast(object, db), uuid4()).assign_volunteer(  # type: ignore[arg-type]
            shift.id, uuid4()
        )
    assert db.commits == 0


def test_assign_volunteer_route_calls_service_and_returns_admin_shift_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = cast(
        Organization,
        SimpleNamespace(
            id=uuid4(),
            slug="tenant-a",
            name="Tenant A",
            timezone="Europe/Zurich",
        ),
    )
    current = cast(CurrentStaffMembership, SimpleNamespace(organization=organization))
    now = datetime.now(UTC)
    shift_id = uuid4()
    volunteer_id = uuid4()
    returned_shift = SimpleNamespace(
        id=shift_id,
        event_id=uuid4(),
        starts_at=now,
        ends_at=now + timedelta(hours=1),
        required_volunteers=2,
        public_note=None,
        internal_note=None,
        status=ShiftStatus.OPEN,
        sort_order=0,
        shift_type=ShiftType.GRILL,
        assignment_mode=ShiftAssignmentMode.OPEN_SIGNUP,
        menu_type=None,
        crew_suggestion_overridden=False,
        created_at=now,
        updated_at=now,
        signups=[],
    )
    returned_signup = SimpleNamespace(
        id=uuid4(),
        public_name_snapshot="Lea Beispiel",
        volunteer=SimpleNamespace(email_display="lea@example.test"),
        shift=SimpleNamespace(
            starts_at=returned_shift.starts_at,
            ends_at=returned_shift.ends_at,
            shift_type=returned_shift.shift_type,
            event=SimpleNamespace(title="Heimspiel", event_type="Match"),
        ),
    )
    returned_result = SimpleNamespace(
        shift=returned_shift, signup=returned_signup, management_token="secret-token"
    )
    calls: list[tuple[object, object]] = []
    dispatched: list[dict[str, object]] = []

    class FakePlanningService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def assign_volunteer(
            self, received_shift_id: object, received_volunteer_id: object
        ) -> object:
            calls.append((received_shift_id, received_volunteer_id))
            return returned_result

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _ListDb()
    monkeypatch.setattr(planning, "PlanningService", FakePlanningService)
    monkeypatch.setattr(planning, "_ensure_origin_and_host", lambda *_args: None)
    monkeypatch.setattr(planning, "resolve_organization_branding", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        planning,
        "dispatch_signup_confirmation_email",
        lambda _settings, **kwargs: dispatched.append(kwargs),
    )
    try:
        response = client.post(
            f"/api/admin/tenant-a/shifts/{shift_id}/assign",
            json={"volunteer_id": str(volunteer_id)},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert calls == [(shift_id, volunteer_id)]
    assert response.json()["id"] == str(shift_id)
    assert len(dispatched) == 1
    assert dispatched[0]["recipient"] == "lea@example.test"
    assert dispatched[0]["management_token"] == "secret-token"
    assert dispatched[0]["organization_name"] == "Tenant A"


def test_admin_shift_response_includes_only_active_contact_details_in_stable_order() -> None:
    now = datetime.now(UTC)
    volunteer = SimpleNamespace(
        first_name="Mia",
        last_name="Muster",
        phone_display="+41 79 123 45 67",
        email_display="mia@example.test",
    )
    first_id = uuid4()
    second_id = uuid4()
    active_signups = [
        SimpleNamespace(
            id=signup_id,
            status=SignupStatus.ACTIVE,
            outcome=SignupOutcome.OPEN,
            public_name_snapshot=public_name,
            volunteer=volunteer,
            created_at=created_at,
        )
        for signup_id, public_name, created_at in [
            (second_id, "Zweite Person", now),
            (first_id, "Mia Muster", now - timedelta(seconds=1)),
        ]
    ]
    cancelled = SimpleNamespace(
        id=uuid4(),
        status=SignupStatus.CANCELLED_BY_ADMIN,
        public_name_snapshot="Nicht anzeigen",
        volunteer=volunteer,
        created_at=now,
    )
    shift = cast(
        Shift,
        SimpleNamespace(
            id=uuid4(),
            event_id=uuid4(),
            starts_at=now,
            ends_at=now + timedelta(hours=1),
            required_volunteers=3,
            public_note=None,
            internal_note=None,
            status=ShiftStatus.OPEN,
            sort_order=0,
            shift_type=ShiftType.GRILL,
            assignment_mode=ShiftAssignmentMode.OPEN_SIGNUP,
            menu_type=None,
            crew_suggestion_overridden=False,
            created_at=now,
            updated_at=now,
            signups=[active_signups[0], cancelled, active_signups[1]],
        ),
    )

    response = planning._admin_shift_response(shift)

    assert response.occupied_volunteers == 2
    assert response.open_places == 1
    assert [signup.public_name for signup in response.signups] == ["Mia Muster", "Zweite Person"]
    assert response.signups[0].phone == "+41 79 123 45 67"
    assert response.signups[0].email == "mia@example.test"
    assert response.signups[0].outcome == SignupOutcome.OPEN
    assert "internal_note" not in response.signups[0].model_dump()


@pytest.mark.parametrize(
    ("csrf_token_kind", "expected_status"),
    [("valid", 201), ("missing", 403), ("invalid", 403)],
)
def test_admin_planning_write_enforces_csrf_with_api_scoped_refresh_cookie(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    csrf_token_kind: str,
    expected_status: int,
) -> None:
    """Regression: the refresh cookie must reach /api/admin for family-bound CSRF."""
    family_id = uuid4()
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(CurrentStaffMembership, SimpleNamespace(organization=organization))
    now = datetime.now(UTC)
    created = SimpleNamespace(
        id=uuid4(),
        label="2026/27",
        start_date=date(2026, 7, 1),
        end_date=date(2027, 6, 30),
        status=PlanningStatus.DRAFT,
        created_at=now,
        updated_at=now,
    )

    class FakeRefreshService:
        def __init__(self, _db: object, _settings: object) -> None:
            pass

        def validate(self, *, refresh_token: str | None) -> object:
            if refresh_token != "valid-refresh":
                raise AssertionError("the /api-scoped refresh cookie must reach the admin route")
            return SimpleNamespace(token=SimpleNamespace(family_id=family_id))

    class FakePlanningService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def create_club_year(self, _payload: ClubYearCreate) -> object:
            return created

    valid_token = generate_csrf_token(
        binding_key=str(family_id),
        secret=derive_csrf_secret(get_settings().jwt_secret_key),
    )
    headers = {"Origin": "http://testserver"}
    if csrf_token_kind == "valid":
        headers[CSRF_HEADER_NAME] = valid_token
    elif csrf_token_kind == "invalid":
        headers[CSRF_HEADER_NAME] = "invalid-token"

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _ListDb()
    monkeypatch.setattr(dependencies, "RefreshService", FakeRefreshService)
    monkeypatch.setattr(planning, "PlanningService", FakePlanningService)
    monkeypatch.setattr(planning, "_ensure_origin_and_host", lambda *_args: None)
    client.cookies.set(REFRESH_TOKEN_COOKIE_NAME, "valid-refresh", path="/api")
    try:
        response = client.post(
            "/api/admin/tenant-a/club-years",
            headers=headers,
            json={
                "label": "2026/27",
                "start_date": "2026-07-01",
                "end_date": "2027-06-30",
            },
        )
    finally:
        app.dependency_overrides.clear()
        client.cookies.clear()

    assert response.status_code == expected_status


class _ListDb:
    def scalars(self, _statement: object) -> list[object]:
        return []


class _SeasonDb:
    def __init__(self, season: Season) -> None:
        self.season = season

    def scalar(self, _statement: object) -> Season:
        return self.season


class _MissingDb:
    def scalar(self, _statement: object) -> None:
        return None


class _DeleteDb:
    def __init__(self, item: object, counts: list[int]) -> None:
        self.item = item
        self.counts = iter(counts)
        self.deleted: list[object] = []
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, statement: object) -> object:
        # Entity lookups select a mapped model; dependency checks select count().
        if "count(" not in str(statement).lower():
            return self.item
        return next(self.counts)

    def add(self, item: object) -> None:
        self.added.append(item)

    def delete(self, item: object) -> None:
        self.deleted.append(item)

    def commit(self) -> None:
        self.commits += 1


class _SignupDb:
    def __init__(self, signup: object | None) -> None:
        self.signup = signup
        self.added: list[object] = []
        self.commits = 0
        self.refreshes = 0

    def scalar(self, _statement: object) -> object | None:
        return self.signup

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _item: object) -> None:
        self.refreshes += 1


class _AssignVolunteerDb:
    """Fake session for PlanningService.assign_volunteer.

    scalar() is called in a fixed order by the service: shift lookup, volunteer lookup,
    occupied-count, duplicate-signup lookup. Each test supplies exactly those results; a
    rejection raised partway through simply means the later values are never consumed.
    """

    def __init__(
        self,
        shift: object | None,
        volunteer: object | None,
        *,
        occupied: int,
        duplicate: object | None,
    ) -> None:
        self.results = iter([shift, volunteer, occupied, duplicate])
        self.added: list[object] = []
        self.commits = 0
        self.refreshes = 0

    def scalar(self, _statement: object) -> object:
        return next(self.results)

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _item: object) -> None:
        self.refreshes += 1


class _ShiftUpdateDb:
    """Fake session for PlanningService.update_shift: scalar() resolves the
    Shift lookup (via _get_shift); scalars() resolves the crew-size-rule lookup
    that a required_volunteers/menu_type change triggers via SettingsService."""

    def __init__(self, shift: object) -> None:
        self.shift = shift
        self.commits = 0
        self.refreshes = 0

    def scalar(self, _statement: object) -> object:
        return self.shift

    def scalars(self, _statement: object) -> list[object]:
        return []

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _item: object) -> None:
        self.refreshes += 1


class _EventDeleteDb:
    def __init__(self, event: object | None, shifts: list[object], counts: list[int]) -> None:
        self.event = event
        self.shifts = shifts
        self.counts = iter(counts)
        self.deleted: list[object] = []
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, statement: object) -> object | None:
        if "count(" in str(statement).lower():
            return next(self.counts)
        return self.event

    def scalars(self, _statement: object) -> list[object]:
        return self.shifts

    def add(self, item: object) -> None:
        self.added.append(item)

    def delete(self, item: object) -> None:
        self.deleted.append(item)

    def commit(self) -> None:
        self.commits += 1


class _ForceEventDeleteDb:
    def __init__(self, event: object | None, scalar_lists: list[Sequence[object]]) -> None:
        self.event = event
        self.scalar_lists = iter(scalar_lists)
        self.deleted: list[object] = []
        self.added: list[object] = []
        self.executed: list[object] = []
        self.commits = 0

    def scalar(self, _statement: object) -> object | None:
        return self.event

    def scalars(self, _statement: object) -> list[object]:
        return list(next(self.scalar_lists))

    def execute(self, statement: object) -> None:
        self.executed.append(statement)

    def add(self, item: object) -> None:
        self.added.append(item)

    def delete(self, item: object) -> None:
        self.deleted.append(item)

    def commit(self) -> None:
        self.commits += 1


class _DerivedReferenceDb:
    def __init__(self, rows: list[object]) -> None:
        self.organization = SimpleNamespace(id=uuid4(), timezone="UTC")
        self.rows = rows
        self.executed: list[object] = []

    def execute(self, statement: object) -> None:
        self.executed.append(statement)

    def get(self, _model: object, _identifier: object) -> object:
        return self.organization

    def scalars(self, _statement: object) -> list[object]:
        return self.rows


class _OwnedReferenceDb:
    def __init__(self, overrides: list[object], rows: list[object]) -> None:
        self.organization = SimpleNamespace(id=uuid4(), timezone="UTC")
        self.results = iter([overrides, rows])

    def scalars(self, _statement: object) -> list[object]:
        return next(self.results)

    def get(self, _model: object, _identifier: object) -> object:
        return self.organization


# -- Crew-size suggestion --------------------------------------------------------


class _EventAndRulesDb:
    def __init__(self, event: Event | None, rules: list[CrewSizeRule]) -> None:
        self.event = event
        self.rules = rules

    def scalar(self, _statement: object) -> Event | None:
        return self.event

    def scalars(self, _statement: object) -> list[CrewSizeRule]:
        return self.rules


def _crew_rule(**overrides: object) -> CrewSizeRule:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "sort_order": 0,
        "pattern": "Junioren",
        "menu_type": MenuType.FRIES_NUGGETS,
        "required_griller_count": 1,
        "min_games_per_shift": 1,
        "is_active": True,
    }
    defaults.update(overrides)
    return CrewSizeRule(**defaults)


def _event(**overrides: object) -> Event:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "season_id": uuid4(),
        "title": "FCTC Junioren D-9c",
        "date": date(2026, 8, 15),
        "location": "St. Martin, Cazis",
        "event_type": "Meisterschaft",
        "public_description": "Team Mittelbünden c - FC Orion Chur a",
        "status": EventStatus.DRAFT,
    }
    defaults.update(overrides)
    return Event(**defaults)


def test_is_crew_suggestion_overridden_false_when_matches_suggestion() -> None:
    rule = _crew_rule(pattern="Junioren", required_griller_count=1)
    db = _EventAndRulesDb(None, [rule])
    service = PlanningService(cast(object, db), uuid4())  # type: ignore[arg-type]
    event = _event(public_description="Junioren D-9c Team A - Team B")
    overridden = service._is_crew_suggestion_overridden(event, MenuType.FRIES_NUGGETS, 1)
    assert overridden is False


def test_is_crew_suggestion_overridden_true_when_count_differs() -> None:
    rule = _crew_rule(pattern="Junioren", required_griller_count=1)
    db = _EventAndRulesDb(None, [rule])
    service = PlanningService(cast(object, db), uuid4())  # type: ignore[arg-type]
    event = _event(public_description="Junioren D-9c Team A - Team B")
    overridden = service._is_crew_suggestion_overridden(event, MenuType.FRIES_NUGGETS, 2)
    assert overridden is True


def test_is_crew_suggestion_overridden_true_when_menu_type_set_without_a_suggestion() -> None:
    db = _EventAndRulesDb(None, [])
    service = PlanningService(cast(object, db), uuid4())  # type: ignore[arg-type]
    event = _event()
    overridden = service._is_crew_suggestion_overridden(event, MenuType.FRIES_NUGGETS, 2)
    assert overridden is True


def test_is_crew_suggestion_overridden_false_without_suggestion_or_menu_type() -> None:
    db = _EventAndRulesDb(None, [])
    service = PlanningService(cast(object, db), uuid4())  # type: ignore[arg-type]
    event = _event()
    overridden = service._is_crew_suggestion_overridden(event, None, 2)
    assert overridden is False


def test_suggest_shift_crew_returns_matched_rule() -> None:
    rule = _crew_rule(pattern="Junioren")
    event = _event(public_description="Junioren D-9c Team A - Team B")
    db = _EventAndRulesDb(event, [rule])
    service = PlanningService(cast(object, db), uuid4())  # type: ignore[arg-type]
    assert service.suggest_shift_crew(event.id) is rule


def test_suggest_shift_crew_raises_not_found_for_missing_event() -> None:
    db = _EventAndRulesDb(None, [])
    service = PlanningService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(PlanningNotFoundError):
        service.suggest_shift_crew(uuid4())


def test_shift_suggestion_route_is_forbidden_for_wrong_tenant_slug(client: TestClient) -> None:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug="tenant-a"))
    current = cast(
        CurrentStaffMembership,
        SimpleNamespace(organization=organization, user=SimpleNamespace(id=uuid4())),
    )
    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _ListDb()
    try:
        response = client.get(f"/api/admin/tenant-b/events/{uuid4()}/shift-suggestion")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403
