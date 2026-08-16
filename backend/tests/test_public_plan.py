"""Public read-only planning API privacy and tenancy tests."""

from collections.abc import Iterator
from datetime import date, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.api import public
from app.db.session import get_db
from app.main import app
from app.models.organization import Organization
from app.models.planning import ShiftStatus, ShiftType, SignupStatus


def test_public_plan_is_unauthenticated_sorted_and_public_safe(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = _organization("tenant-a")
    later_id = UUID("00000000-0000-0000-0000-000000000002")
    earlier_id = UUID("00000000-0000-0000-0000-000000000001")
    event = SimpleNamespace(
        id=uuid4(),
        title="Grill",
        date=date(2099, 8, 1),
        location="Sportplatz",
        event_type="Match",
        public_description="Beim Eingang",
        kickoff_time=None,
        internal_note="staff secret",
        shifts=[
            _shift(later_id, 2, "12:00", internal_note="private phone +41 79 000 00 00"),
            _shift(earlier_id, 1, "10:00", internal_note="private@example.test"),
            _shift(
                uuid4(),
                0,
                "08:00",
                internal_note="cancelled secret",
                status=ShiftStatus.CANCELLED,
            ),
            _shift(
                uuid4(),
                3,
                "14:00",
                internal_note="fixed-assignment kiosk roster",
                shift_type=ShiftType.KIOSK,
            ),
        ],
    )
    captured: list[UUID] = []

    class FakeService:
        def __init__(self, _db: object, organization_id: UUID) -> None:
            captured.append(organization_id)

        def list_public_events(
            self, _from_date: date, shift_type: ShiftType = ShiftType.GRILL
        ) -> list[object]:
            event.shifts.sort(key=lambda item: (item.sort_order, item.starts_at, item.id))
            return [event]

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PlanningService", FakeService)
    try:
        response = client.get("/api/public/tenant-a/plan")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured == [organization.id]
    body = response.json()
    # Only the open (non-cancelled) GRILL shifts belong on the public page; the
    # fixed-assignment KIOSK shift on the same event must never be exposed here.
    assert [shift["id"] for shift in body["events"][0]["shifts"]] == [
        str(earlier_id),
        str(later_id),
    ]
    serialized = response.text
    for forbidden in (
        "internal_note",
        "staff secret",
        "private@example.test",
        "+41 79",
        "organization_id",
        "event_id",
        "fixed-assignment kiosk roster",
    ):
        assert forbidden not in serialized
    assert body["events"][0]["shifts"][0]["occupied_volunteers"] == 1
    assert body["events"][0]["shifts"][0]["volunteer_names"] == ["Mia Muster"]
    assert "cancelled person" not in serialized


def test_public_plan_selects_kiosk_shifts_and_excludes_grill_when_requested(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = _organization("tenant-a")
    kiosk_id = UUID("00000000-0000-0000-0000-000000000003")
    grill_id = UUID("00000000-0000-0000-0000-000000000004")
    event = SimpleNamespace(
        id=uuid4(),
        title="Grill",
        date=date(2099, 8, 1),
        location="Sportplatz",
        event_type="Match",
        public_description="Beim Eingang",
        kickoff_time=None,
        internal_note="staff secret",
        shifts=[
            _shift(kiosk_id, 0, "10:00", internal_note="kiosk note", shift_type=ShiftType.KIOSK),
            _shift(grill_id, 1, "12:00", internal_note="grill note", shift_type=ShiftType.GRILL),
        ],
    )
    captured_shift_types: list[ShiftType] = []

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def list_public_events(
            self, _from_date: date, shift_type: ShiftType = ShiftType.GRILL
        ) -> list[object]:
            captured_shift_types.append(shift_type)
            return [event]

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PlanningService", FakeService)
    try:
        response = client.get("/api/public/tenant-a/plan?shift_type=KIOSK")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_shift_types == [ShiftType.KIOSK]
    body = response.json()
    assert [shift["id"] for shift in body["events"][0]["shifts"]] == [str(kiosk_id)]


def test_public_plan_omitting_shift_type_stays_grill_only(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = _organization("tenant-a")
    kiosk_id = UUID("00000000-0000-0000-0000-000000000005")
    grill_id = UUID("00000000-0000-0000-0000-000000000006")
    event = SimpleNamespace(
        id=uuid4(),
        title="Grill",
        date=date(2099, 8, 1),
        location="Sportplatz",
        event_type="Match",
        public_description="Beim Eingang",
        kickoff_time=None,
        internal_note="staff secret",
        shifts=[
            _shift(kiosk_id, 0, "10:00", internal_note="kiosk note", shift_type=ShiftType.KIOSK),
            _shift(grill_id, 1, "12:00", internal_note="grill note", shift_type=ShiftType.GRILL),
        ],
    )
    captured_shift_types: list[ShiftType] = []

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def list_public_events(
            self, _from_date: date, shift_type: ShiftType = ShiftType.GRILL
        ) -> list[object]:
            captured_shift_types.append(shift_type)
            return [event]

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PlanningService", FakeService)
    try:
        response = client.get("/api/public/tenant-a/plan")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert captured_shift_types == [ShiftType.GRILL]
    body = response.json()
    assert [shift["id"] for shift in body["events"][0]["shifts"]] == [str(grill_id)]


def test_public_plan_invalid_shift_type_returns_422(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = _organization("tenant-a")
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    try:
        response = client.get("/api/public/tenant-a/plan?shift_type=NOT_A_TYPE")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_public_plan_unknown_organization_returns_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: None)
    try:
        response = client.get("/api/public/missing/plan")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


def test_public_plan_serializes_all_games_but_only_existing_grill_shifts(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization = _organization("tenant-a")
    game_date = date(2099, 8, 2)
    events: list[object] = [
        SimpleNamespace(
            id=uuid4(),
            title=title,
            date=game_date,
            location="Sportplatz",
            event_type="Match",
            public_description=teams,
            kickoff_time=datetime.strptime(kickoff, "%H:%M").time(),
            shifts=[_shift(uuid4(), 1, "08:00", "private")] if index == 0 else [],
        )
        for index, (title, teams, kickoff) in enumerate(
            [
                ("Spiel A", "Heim - Alpha", "10:00"),
                ("Spiel B", "Heim - Beta", "12:00"),
                ("Spiel C", "Heim - Gamma", "14:00"),
            ]
        )
    ]

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def list_public_events(
            self, _from_date: date, shift_type: ShiftType = ShiftType.GRILL
        ) -> list[object]:
            return events

    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "PlanningService", FakeService)
    try:
        response = client.get("/api/public/tenant-a/plan")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()["events"]
    assert [event["title"] for event in body] == ["Spiel A", "Spiel B", "Spiel C"]
    assert [event["kickoff_time"] for event in body] == ["10:00:00", "12:00:00", "14:00:00"]
    assert [len(event["shifts"]) for event in body] == [1, 0, 0]


def test_public_service_query_filters_tenant_published_and_upcoming() -> None:
    from app.services.planning import PlanningService

    class FakeScalars:
        def __iter__(self) -> Iterator[object]:
            return iter([])

    class FakeDb:
        statement: object | None = None

        def scalars(self, statement: object) -> FakeScalars:
            self.statement = statement
            return FakeScalars()

    db = FakeDb()
    PlanningService(cast(object, db), uuid4()).list_public_events(date(2026, 7, 21))  # type: ignore[arg-type]
    sql = str(db.statement)
    assert "club_year.organization_id" in sql
    assert "event.status" in sql
    assert "event.date >=" in sql
    assert "EXISTS" in sql
    assert "event_1.date = event.date" in sql
    assert "shift.status !=" in sql
    assert "shift.shift_type" in sql
    assert "ORDER BY event.date, event.id" in sql


def test_path_slug_resolves_plan_route_slug_not_literal_suffix() -> None:
    from app.services.organization_context import _path_slug

    assert _path_slug("/api/public/tenant-a/plan") == "tenant-a"
    assert _path_slug("/api/public/organization/tenant-a") == "tenant-a"
    assert _path_slug("/api/public/organization") is None


def _organization(slug: str) -> Organization:
    return cast(Organization, SimpleNamespace(id=uuid4(), slug=slug, timezone="Europe/Zurich"))


def _shift(
    identifier: UUID,
    order: int,
    hour: str,
    internal_note: str,
    status: ShiftStatus = ShiftStatus.OPEN,
    shift_type: ShiftType = ShiftType.GRILL,
) -> SimpleNamespace:
    start = datetime.fromisoformat(f"2099-08-01T{hour}:00+00:00")
    return SimpleNamespace(
        id=identifier,
        starts_at=start,
        ends_at=start.replace(hour=start.hour + 2),
        required_volunteers=3,
        public_note="Schürze mitbringen",
        internal_note=internal_note,
        status=status,
        shift_type=shift_type,
        sort_order=order,
        signups=[
            SimpleNamespace(status=SignupStatus.ACTIVE, public_name_snapshot="Mia Muster"),
            SimpleNamespace(
                status=SignupStatus.CANCELLED_BY_ADMIN,
                public_name_snapshot="cancelled person",
            ),
        ],
    )
