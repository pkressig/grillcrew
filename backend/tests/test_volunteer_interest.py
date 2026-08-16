"""API tests for the public volunteer-interest ('Bewerbung') notification endpoint.

Exercises the endpoint's staff-recipient lookup against a real SQLAlchemy session
(SQLite standing in for Postgres) rather than a mocked query, so tenant isolation and
role filtering run against the actual query logic instead of a stand-in duplicating
that logic in the test.
"""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Table, create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api import public
from app.core.security.rate_limit import InMemoryRateLimiter
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.identity import StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization

_TABLES = cast("list[Table]", [User.__table__, StaffMembership.__table__])


@pytest.fixture
def engine() -> Iterator[Engine]:
    # The FastAPI TestClient executes the endpoint in a worker thread, so the single
    # in-memory SQLite connection must be shared across threads via StaticPool.
    sqlite_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(sqlite_engine, "connect")
    def _register_uuid_function(dbapi_connection: object, _record: object) -> None:
        dbapi_connection.create_function(  # type: ignore[attr-defined]
            "gen_random_uuid", 0, lambda: uuid.uuid4().hex
        )

    Base.metadata.create_all(sqlite_engine, tables=_TABLES)
    yield sqlite_engine
    sqlite_engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    with Session(engine) as session:
        yield session


def _seed_staff(
    db_session: Session,
    *,
    organization_id: uuid.UUID,
    role: StaffRole,
    active: bool = True,
    email: str | None = None,
) -> str:
    email_normalized = email or f"{uuid.uuid4().hex[:8]}@example.test"
    user = User(email_normalized=email_normalized, status=UserStatus.ACTIVE)
    db_session.add(user)
    db_session.flush()
    db_session.add(
        StaffMembership(
            organization_id=organization_id,
            user_id=user.id,
            role=role,
            active=active,
        )
    )
    db_session.flush()
    return email_normalized


def _organization(organization_id: uuid.UUID, slug: str = "example") -> Organization:
    return cast(
        Organization,
        SimpleNamespace(
            id=organization_id,
            slug=slug,
            name="Example Organization",
            settings=SimpleNamespace(
                signup_rate_limit_per_contact=5,
                signup_rate_limit_window_minutes=60,
            ),
        ),
    )


def payload(**overrides: object) -> dict[str, object]:
    result: dict[str, object] = {
        "first_name": "Jamie",
        "last_name": "Beispiel",
        "contact": "jamie@example.test",
        "message": "Ich möchte gerne helfen.",
        "area": "GRILL",
        "website": "",
        "form_started_at": (datetime.now(UTC) - timedelta(seconds=3)).isoformat(),
    }
    result.update(overrides)
    return result


def _prepare(
    monkeypatch: pytest.MonkeyPatch,
    db_session: Session,
    organization: Organization,
    dispatched: list[dict[str, object]],
) -> None:
    app.dependency_overrides[get_db] = lambda: db_session
    monkeypatch.setattr(public, "resolve_organization", lambda *_args: organization)
    monkeypatch.setattr(public, "resolve_organization_branding", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(public, "signup_rate_limiter", InMemoryRateLimiter())
    monkeypatch.setattr(
        public,
        "dispatch_volunteer_interest_email",
        lambda _settings, **kwargs: dispatched.append(kwargs),
    )


def test_volunteer_interest_notifies_only_active_admin_and_koordination_staff_in_tenant(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    organization_id = uuid4()
    other_organization_id = uuid4()
    organization = _organization(organization_id)

    admin_email = _seed_staff(
        db_session,
        organization_id=organization_id,
        role=StaffRole.ADMIN,
        email="admin@example.test",
    )
    koordination_email = _seed_staff(
        db_session,
        organization_id=organization_id,
        role=StaffRole.KOORDINATION,
        email="koordination@example.test",
    )
    # Must NOT be notified: wrong role, inactive membership, different organization.
    _seed_staff(
        db_session,
        organization_id=organization_id,
        role=StaffRole.KIOSK,
        email="kiosk@example.test",
    )
    _seed_staff(
        db_session,
        organization_id=organization_id,
        role=StaffRole.VORSTAND_LESEN,
        email="vorstand@example.test",
    )
    _seed_staff(
        db_session,
        organization_id=organization_id,
        role=StaffRole.ADMIN,
        active=False,
        email="inactive-admin@example.test",
    )
    _seed_staff(
        db_session,
        organization_id=other_organization_id,
        role=StaffRole.ADMIN,
        email="other-org-admin@example.test",
    )

    dispatched: list[dict[str, object]] = []
    _prepare(monkeypatch, db_session, organization, dispatched)
    try:
        response = client.post("/api/public/example/volunteer-interest", json=payload())
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    recipients = {call["recipient"] for call in dispatched}
    assert recipients == {admin_email, koordination_email}
    for call in dispatched:
        assert call["first_name"] == "Jamie"
        assert call["last_name"] == "Beispiel"
        assert call["contact"] == "jamie@example.test"
        assert call["area"] == "GRILL"


def test_volunteer_interest_honeypot_is_silent_and_sends_nothing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    organization_id = uuid4()
    organization = _organization(organization_id)
    _seed_staff(db_session, organization_id=organization_id, role=StaffRole.ADMIN)

    dispatched: list[dict[str, object]] = []
    _prepare(monkeypatch, db_session, organization, dispatched)
    try:
        response = client.post(
            "/api/public/example/volunteer-interest", json=payload(website="spam")
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert dispatched == []


def test_volunteer_interest_rejects_too_fast_submission(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    organization_id = uuid4()
    organization = _organization(organization_id)
    _seed_staff(db_session, organization_id=organization_id, role=StaffRole.ADMIN)

    dispatched: list[dict[str, object]] = []
    _prepare(monkeypatch, db_session, organization, dispatched)
    try:
        response = client.post(
            "/api/public/example/volunteer-interest",
            json=payload(form_started_at=datetime.now(UTC).isoformat()),
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 429
    assert dispatched == []


def test_volunteer_interest_rate_limits_repeated_requests_per_contact(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, db_session: Session
) -> None:
    organization_id = uuid4()
    organization = _organization(organization_id)
    organization.settings.signup_rate_limit_per_contact = 1
    _seed_staff(db_session, organization_id=organization_id, role=StaffRole.ADMIN)

    dispatched: list[dict[str, object]] = []
    _prepare(monkeypatch, db_session, organization, dispatched)
    try:
        first = client.post("/api/public/example/volunteer-interest", json=payload())
        second = client.post("/api/public/example/volunteer-interest", json=payload())
    finally:
        app.dependency_overrides.clear()

    assert first.status_code == 200
    assert second.status_code == 429
    assert len(dispatched) == 1
