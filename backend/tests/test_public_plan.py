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
from app.models.planning import ShiftStatus, SignupStatus


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
        ],
    )
    captured: list[UUID] = []

    class FakeService:
        def __init__(self, _db: object, organization_id: UUID) -> None:
            captured.append(organization_id)

        def list_public_events(self, _from_date: date) -> list[object]:
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
    ):
        assert forbidden not in serialized
    assert body["events"][0]["shifts"][0]["occupied_volunteers"] == 1
    assert body["events"][0]["shifts"][0]["volunteer_names"] == ["Mia Muster"]
    assert "cancelled person" not in serialized


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
        sort_order=order,
        signups=[
            SimpleNamespace(status=SignupStatus.ACTIVE, public_name_snapshot="Mia Muster"),
            SimpleNamespace(
                status=SignupStatus.CANCELLED_BY_ADMIN,
                public_name_snapshot="cancelled person",
            ),
        ],
    )
