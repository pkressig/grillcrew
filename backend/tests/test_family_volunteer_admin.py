"""Tests for the volunteer-primary admin surface: direct volunteer creation, the reverse

family lookup, admin-triggered password actions, the broader all-volunteers directory, and
the `team_name` (Mannschaft) field on CHILD family members.
"""

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import app.services.family as family_service_module
from app.api import auth, dependencies, families
from app.api.dependencies import CurrentStaffMembership
from app.core.config import get_settings
from app.core.security.password import PasswordPolicyError
from app.db.session import get_db
from app.main import app
from app.models.family import FamilyMemberType, FamilyStatus
from app.models.identity import AuditEvent, StaffMembership, StaffRole, User, UserStatus
from app.models.organization import Organization
from app.models.planning import SignupSource, Volunteer, VolunteerCompensation, VolunteerStatus
from app.schemas.auth import VolunteerRegisterRequest
from app.schemas.family import FamilyMemberCreate, VolunteerCreate
from app.services.family import (
    FamilyMemberLinkError,
    FamilyService,
    VolunteerHasNoAccountError,
    VolunteerHasRecordsError,
    VolunteerNotFoundError,
)


def _current(slug: str = "tenant-a") -> CurrentStaffMembership:
    return CurrentStaffMembership(
        organization=cast(Organization, SimpleNamespace(id=uuid4(), slug=slug)),
        user=cast(User, SimpleNamespace(id=uuid4())),
        membership=cast(StaffMembership, SimpleNamespace(role=StaffRole.KOORDINATION)),
    )


# ---------------------------------------------------------------------------
# Schema-level validation
# ---------------------------------------------------------------------------


def test_family_member_create_rejects_team_name_on_helper() -> None:
    with pytest.raises(ValidationError, match="team_name is only allowed"):
        FamilyMemberCreate(
            member_type="HELPER", first_name="Mia", last_name="Muster", team_name="U12"
        )


def test_family_member_create_trims_team_name_on_child() -> None:
    payload = FamilyMemberCreate(
        member_type="CHILD", first_name="Mia", last_name="Muster", team_name="  U12  "
    )
    assert payload.team_name == "U12"


def test_family_member_create_blank_team_name_becomes_none() -> None:
    payload = FamilyMemberCreate(
        member_type="CHILD", first_name="Mia", last_name="Muster", team_name="   "
    )
    assert payload.team_name is None


def test_volunteer_create_requires_valid_email_and_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        VolunteerCreate(
            first_name="Anna",
            last_name="Zeta",
            phone="0791111111",
            email="not-an-email",
        )
    with pytest.raises(ValidationError):
        VolunteerCreate.model_validate(
            {
                "first_name": "Anna",
                "last_name": "Zeta",
                "phone": "0791111111",
                "email": "anna@example.invalid",
                "user_id": str(uuid4()),
            }
        )


def test_volunteer_register_request_accepts_and_trims_child_team_name() -> None:
    payload = VolunteerRegisterRequest(
        organization_slug="tenant-a",
        first_name="Anna",
        last_name="Zeta",
        phone="0791111111",
        email="anna@example.invalid",
        password="a-very-long-password",
        child_first_name="Lina",
        child_last_name="Zeta",
        child_team_name="  U12  ",
    )
    assert payload.child_team_name == "  U12  "  # trimming happens in the endpoint, like the names


# ---------------------------------------------------------------------------
# FamilyService.create_volunteer
# ---------------------------------------------------------------------------


class _CreateVolunteerDb:
    def __init__(self, child: object | None = "unused") -> None:
        self._child = child
        self.added: list[object] = []
        self.flushes = 0
        self.commits = 0
        self.refreshed: list[object] = []

    def scalar(self, _statement: object) -> object | None:
        return self._child

    def add(self, item: object) -> None:
        self.added.append(item)

    def flush(self) -> None:
        self.flushes += 1
        for item in self.added:
            if isinstance(item, Volunteer):
                item.id = uuid4()

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, item: object) -> None:
        self.refreshed.append(item)


def test_create_volunteer_normalizes_contact_and_audits() -> None:
    organization_id = uuid4()
    actor_id = uuid4()
    db = _CreateVolunteerDb()
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    volunteer = service.create_volunteer(
        VolunteerCreate(
            first_name=" Anna ",
            last_name=" Zeta ",
            phone=" 079 111 11 11 ",
            email=" ANNA@Example.INVALID ",
            compensation_preference=VolunteerCompensation.VOLUNTARY,
        ),
        actor_id,
    )

    assert volunteer.first_name == "Anna"
    assert volunteer.last_name == "Zeta"
    assert volunteer.phone_normalized == "0791111111"
    assert volunteer.email_normalized == "anna@example.invalid"
    assert volunteer.user_id is None
    assert volunteer.created_from == SignupSource.ADMIN
    assert volunteer.organization_id == organization_id
    assert db.commits == 1
    audit = next(item for item in db.added if isinstance(item, AuditEvent))
    assert audit.action == "VOLUNTEER_CREATED_BY_ADMIN"
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id


def test_create_volunteer_rejects_invalid_child() -> None:
    db = _CreateVolunteerDb(child=None)
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(FamilyMemberLinkError, match="invalid child member"):
        service.create_volunteer(
            VolunteerCreate(
                first_name="Anna",
                last_name="Zeta",
                phone="0791111111",
                email="anna@example.invalid",
                compensation_family_member_id=uuid4(),
            ),
            uuid4(),
        )
    assert db.commits == 0 and db.added == []


def test_create_volunteer_route_returns_created_volunteer(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    created = SimpleNamespace(
        id=uuid4(),
        first_name="Anna",
        last_name="Zeta",
        phone_display="079 111 11 11",
        email_display="anna@example.invalid",
        compensation_preference=VolunteerCompensation.WORK_HOURS,
        compensation_family_member_id=None,
        internal_note=None,
        status=VolunteerStatus.ACTIVE,
    )

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def create_volunteer(self, payload: VolunteerCreate, _actor_id: UUID) -> object:
            assert payload.first_name == "Anna"
            return created

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    payload = {
        "first_name": "Anna",
        "last_name": "Zeta",
        "phone": "0791111111",
        "email": "anna@example.invalid",
        "compensation_preference": "WORK_HOURS",
    }
    try:
        response = client.post("/api/admin/tenant-a/families/volunteers", json=payload)
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 201
    assert response.json()["first_name"] == "Anna"


def test_create_volunteer_route_requires_csrf_and_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(auth, "_organization_domains", lambda _db: set())
    payload = {
        "first_name": "Anna",
        "last_name": "Zeta",
        "phone": "0791111111",
        "email": "anna@example.invalid",
        "compensation_preference": "WORK_HOURS",
    }
    try:
        missing_csrf = client.post("/api/admin/tenant-a/families/volunteers", json=payload)
        app.dependency_overrides[dependencies.validate_csrf] = lambda: None
        missing_origin = client.post("/api/admin/tenant-a/families/volunteers", json=payload)
    finally:
        app.dependency_overrides.clear()
    assert missing_csrf.status_code == 403
    assert missing_origin.status_code == 403


# ---------------------------------------------------------------------------
# FamilyService.list_all_volunteers
# ---------------------------------------------------------------------------


class _ExecDb:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows
        self.statements: list[object] = []

    def execute(self, statement: object) -> list[object]:
        self.statements.append(statement)
        return self.rows


def test_list_all_volunteers_has_no_status_or_family_link_filter() -> None:
    organization_id = uuid4()
    volunteer = SimpleNamespace(id=uuid4(), first_name="Anna", last_name="Zeta")
    db = _ExecDb([(volunteer, "Familie Zeta")])
    result = FamilyService(cast(object, db), organization_id).list_all_volunteers()  # type: ignore[arg-type]
    assert result == cast(object, [(volunteer, "Familie Zeta")])
    sql = str(db.statements[0])
    assert "volunteer.organization_id" in sql
    assert "ORDER BY volunteer.last_name, volunteer.first_name" in sql
    # Unlike list_family_volunteers, there is no status or family-link WHERE condition.
    assert "EXISTS" not in sql
    assert " OR " not in sql


def test_all_volunteers_route_returns_directory_fields_and_rejects_foreign_slug(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    item = SimpleNamespace(
        id=uuid4(),
        first_name="Mia",
        last_name="Andere",
        phone_display="079 123 45 67",
        email_display="mia@example.invalid",
        compensation_preference=VolunteerCompensation.WORK_HOURS,
        compensation_family_member_id=None,
        internal_note=None,
        status=VolunteerStatus.INACTIVE,
        user_id=None,
    )

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def list_all_volunteers(self) -> list[object]:
            return [(item, "Familie Muster")]

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    try:
        response = client.get("/api/admin/tenant-a/families/all-volunteers")
        foreign = client.get("/api/admin/tenant-b/families/all-volunteers")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()[0]
    assert body["status"] == "INACTIVE"
    assert body["has_account"] is False
    assert body["family_display_name"] == "Familie Muster"
    assert foreign.status_code == 403


# ---------------------------------------------------------------------------
# FamilyService.get_volunteer_family (reverse lookup)
# ---------------------------------------------------------------------------


class _ReverseDb:
    def __init__(self, scalars: list[object | None], rows: list[object] | None = None) -> None:
        self.scalar_results = iter(scalars)
        self.rows = rows or []
        self.statements: list[object] = []

    def scalar(self, statement: object) -> object | None:
        self.statements.append(statement)
        return next(self.scalar_results)

    def execute(self, statement: object) -> list[object]:
        self.statements.append(statement)
        return self.rows


def test_get_volunteer_family_returns_none_when_unlinked() -> None:
    volunteer = SimpleNamespace(id=uuid4())
    db = _ReverseDb([volunteer, None])
    result = FamilyService(cast(object, db), uuid4()).get_volunteer_family(volunteer.id)  # type: ignore[arg-type]
    assert result is None


def test_get_volunteer_family_returns_family_and_members_with_linked_volunteer_names() -> None:
    volunteer_id = uuid4()
    family_id = uuid4()
    volunteer = SimpleNamespace(id=volunteer_id)
    membership = SimpleNamespace(family_id=family_id)
    family = SimpleNamespace(
        id=family_id, display_name="Familie Muster", internal_note=None, status=FamilyStatus.ACTIVE
    )
    child_member = SimpleNamespace(
        id=uuid4(),
        member_type=FamilyMemberType.CHILD,
        first_name="Lina",
        last_name="Muster",
        team_name="U12",
        volunteer_id=None,
    )
    helper_member = SimpleNamespace(
        id=uuid4(),
        member_type=FamilyMemberType.HELPER,
        first_name="Anna",
        last_name="Muster",
        team_name=None,
        volunteer_id=volunteer_id,
    )
    linked_volunteer = SimpleNamespace(first_name="Anna", last_name="Muster")
    db = _ReverseDb(
        [volunteer, membership, family],
        rows=[(child_member, None), (helper_member, linked_volunteer)],
    )
    result = FamilyService(cast(object, db), uuid4()).get_volunteer_family(volunteer_id)  # type: ignore[arg-type]
    assert result is not None
    returned_family, members = result
    assert cast(object, returned_family) is family
    assert members == cast(object, [(child_member, None), (helper_member, linked_volunteer)])


def test_volunteer_family_route_returns_null_when_unlinked(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def get_volunteer_family(self, _volunteer_id: UUID) -> object | None:
            return None

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    try:
        response = client.get(f"/api/admin/tenant-a/families/volunteers/{uuid4()}/family")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json() is None


def test_volunteer_family_route_returns_members_and_linked_names(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    family = SimpleNamespace(id=uuid4(), display_name="Familie Muster", internal_note="Notiz")
    child = SimpleNamespace(
        id=uuid4(),
        member_type=FamilyMemberType.CHILD,
        first_name="Lina",
        last_name="Muster",
        team_name="U12",
        volunteer_id=None,
    )
    helper = SimpleNamespace(
        id=uuid4(),
        member_type=FamilyMemberType.HELPER,
        first_name="Anna",
        last_name="Muster",
        team_name=None,
        volunteer_id=uuid4(),
    )
    linked = SimpleNamespace(first_name="Anna", last_name="Muster")

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def get_volunteer_family(self, _volunteer_id: UUID) -> object:
            return family, [(child, None), (helper, linked)]

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    try:
        response = client.get(f"/api/admin/tenant-a/families/volunteers/{uuid4()}/family")
    finally:
        app.dependency_overrides.clear()
    body = response.json()
    assert body["family_display_name"] == "Familie Muster"
    assert body["members"][0]["team_name"] == "U12"
    assert body["members"][1]["volunteer_first_name"] == "Anna"
    assert body["members"][1]["volunteer_last_name"] == "Muster"


def test_volunteer_family_route_returns_404_for_unknown_volunteer(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def get_volunteer_family(self, _volunteer_id: UUID) -> object:
            raise VolunteerNotFoundError

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    try:
        response = client.get(f"/api/admin/tenant-a/families/volunteers/{uuid4()}/family")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# FamilyService.send_volunteer_password_reset / set_volunteer_password
# ---------------------------------------------------------------------------


class _PasswordDb:
    def __init__(self, scalars: list[object | None]) -> None:
        self.scalar_results = iter(scalars)
        self.executed: list[object] = []
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, _statement: object) -> object | None:
        return next(self.scalar_results)

    def execute(self, statement: object) -> SimpleNamespace:
        self.executed.append(statement)
        return SimpleNamespace(rowcount=0)

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1


def test_send_volunteer_password_reset_wraps_issue_and_audits(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    organization_id = uuid4()
    actor_id = uuid4()
    volunteer = SimpleNamespace(
        id=uuid4(), organization_id=organization_id, user_id=uuid4(), email_normalized="a@b.test"
    )
    db = _PasswordDb([volunteer])
    captured: dict[str, object] = {}

    class FakePasswordResetService:
        def __init__(self, db_arg: object, settings_arg: object) -> None:
            captured["db"] = db_arg
            captured["settings"] = settings_arg

        def request_reset(self, *, email: str) -> object:
            captured["email"] = email
            return SimpleNamespace(recipient=email, raw_token="tok")

    monkeypatch.setattr(family_service_module, "PasswordResetService", FakePasswordResetService)
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    issue = service.send_volunteer_password_reset(volunteer.id, actor_id, get_settings())

    assert issue is not None
    assert issue.raw_token == "tok"
    assert captured["email"] == "a@b.test"
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "VOLUNTEER_PASSWORD_RESET_REQUESTED_BY_ADMIN"
    assert audit.entity_id == volunteer.id
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id


def test_send_volunteer_password_reset_rejects_without_account() -> None:
    volunteer = SimpleNamespace(id=uuid4(), user_id=None)
    db = _PasswordDb([volunteer])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(VolunteerHasNoAccountError):
        service.send_volunteer_password_reset(volunteer.id, uuid4(), get_settings())
    assert db.commits == 0


def test_set_volunteer_password_hashes_revokes_tokens_and_audits() -> None:
    organization_id = uuid4()
    actor_id = uuid4()
    user_id = uuid4()
    volunteer = SimpleNamespace(id=uuid4(), organization_id=organization_id, user_id=user_id)
    user = SimpleNamespace(id=user_id, status=UserStatus.ACTIVE, password_hash="old-hash")
    db = _PasswordDb([volunteer, user])
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    service.set_volunteer_password(volunteer.id, "a-very-long-password", actor_id)

    assert user.password_hash != "old-hash"
    assert db.commits == 1
    assert len(db.executed) == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "VOLUNTEER_PASSWORD_SET_BY_ADMIN"
    assert audit.entity_id == volunteer.id


def test_set_volunteer_password_rejects_when_no_account() -> None:
    volunteer = SimpleNamespace(id=uuid4(), user_id=None)
    db = _PasswordDb([volunteer])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(VolunteerHasNoAccountError):
        service.set_volunteer_password(volunteer.id, "a-very-long-password", uuid4())
    assert db.commits == 0


def test_set_volunteer_password_enforces_policy() -> None:
    volunteer = SimpleNamespace(id=uuid4(), user_id=uuid4())
    db = _PasswordDb([volunteer])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(PasswordPolicyError):
        service.set_volunteer_password(volunteer.id, "short", uuid4())
    assert db.commits == 0


def test_set_volunteer_password_rejects_disabled_user() -> None:
    volunteer = SimpleNamespace(id=uuid4(), user_id=uuid4())
    disabled_user = SimpleNamespace(
        id=volunteer.user_id, status=UserStatus.DISABLED, password_hash="x"
    )
    db = _PasswordDb([volunteer, disabled_user])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(VolunteerHasNoAccountError):
        service.set_volunteer_password(volunteer.id, "a-very-long-password", uuid4())
    assert db.commits == 0


def test_send_password_reset_route_requires_csrf_and_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(auth, "_organization_domains", lambda _db: set())
    volunteer_id = uuid4()
    try:
        missing_csrf = client.post(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}/send-password-reset"
        )
        app.dependency_overrides[dependencies.validate_csrf] = lambda: None
        missing_origin = client.post(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}/send-password-reset"
        )
    finally:
        app.dependency_overrides.clear()
    assert missing_csrf.status_code == 403
    assert missing_origin.status_code == 403


def test_send_password_reset_route_dispatches_email_in_background(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    captured: dict[str, object] = {}

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def send_volunteer_password_reset(
            self, volunteer_id: UUID, _actor_id: UUID, _settings: object
        ) -> object:
            captured["volunteer_id"] = volunteer_id
            return SimpleNamespace(
                recipient="anna@example.invalid",
                raw_token="tok",
                organization_slug=None,
                branding=None,
            )

    def fake_dispatch(
        _settings: object,
        *,
        recipient: str,
        raw_token: str,
        organization_slug: str | None,
        branding: object = None,
    ) -> None:
        captured["dispatched"] = (recipient, raw_token)

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    monkeypatch.setattr(families, "dispatch_password_reset_email", fake_dispatch)
    volunteer_id = uuid4()
    try:
        response = client.post(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}/send-password-reset"
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 202
    assert captured["volunteer_id"] == volunteer_id
    assert captured["dispatched"] == ("anna@example.invalid", "tok")


def test_send_password_reset_route_returns_409_without_account(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def send_volunteer_password_reset(self, *_args: object, **_kwargs: object) -> object:
            raise VolunteerHasNoAccountError

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.post(
            f"/api/admin/tenant-a/families/volunteers/{uuid4()}/send-password-reset"
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 409


class _SettingsDb:
    def scalar(self, _statement: object) -> None:
        return None


def test_set_password_route_requires_csrf_and_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _SettingsDb()
    monkeypatch.setattr(auth, "_organization_domains", lambda _db: set())
    volunteer_id = uuid4()
    payload = {"new_password": "a-very-long-password"}
    try:
        missing_csrf = client.post(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}/set-password", json=payload
        )
        app.dependency_overrides[dependencies.validate_csrf] = lambda: None
        missing_origin = client.post(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}/set-password", json=payload
        )
    finally:
        app.dependency_overrides.clear()
    assert missing_csrf.status_code == 403
    assert missing_origin.status_code == 403


def test_set_password_route_sets_password_via_service(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    calls: dict[str, object] = {}

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def set_volunteer_password(
            self, volunteer_id: UUID, new_password: str, _actor_id: UUID, *, minimum_length: int
        ) -> None:
            calls["args"] = (volunteer_id, new_password, minimum_length)

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _SettingsDb()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    volunteer_id = uuid4()
    try:
        response = client.post(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}/set-password",
            json={"new_password": "a-very-long-password"},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert calls["args"] == (volunteer_id, "a-very-long-password", 6)


@pytest.mark.parametrize(
    ("raised", "expected_status"),
    [
        (VolunteerNotFoundError, 404),
        (VolunteerHasNoAccountError, 409),
        (PasswordPolicyError, 422),
    ],
)
def test_set_password_route_maps_service_errors(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    raised: type[Exception],
    expected_status: int,
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def set_volunteer_password(self, *_args: object, **_kwargs: object) -> None:
            raise raised

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _SettingsDb()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.post(
            f"/api/admin/tenant-a/families/volunteers/{uuid4()}/set-password",
            json={"new_password": "a-very-long-password"},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == expected_status


# ---------------------------------------------------------------------------
# FamilyService.delete_volunteer
# ---------------------------------------------------------------------------


class _DeleteDb:
    def __init__(
        self,
        scalars: list[object | None],
        blocking_signup: tuple[str, object] | None = None,
    ) -> None:
        self.scalar_results = iter(scalars)
        self.scalar_statements: list[object] = []
        self.blocking_signup = blocking_signup
        self.executed: list[object] = []
        self.execute_statements: list[object] = []
        self.added: list[object] = []
        self.deleted: list[object] = []
        self.commits = 0

    def scalar(self, statement: object) -> object | None:
        self.scalar_statements.append(statement)
        return next(self.scalar_results)

    def execute(self, statement: object) -> SimpleNamespace:
        self.executed.append(statement)
        self.execute_statements.append(statement)
        return SimpleNamespace(rowcount=0, first=lambda: self.blocking_signup)

    def add(self, item: object) -> None:
        self.added.append(item)

    def delete(self, item: object) -> None:
        self.deleted.append(item)

    def commit(self) -> None:
        self.commits += 1


def test_delete_volunteer_removes_row_unlinks_family_member_and_audits() -> None:
    organization_id = uuid4()
    actor_id = uuid4()
    volunteer = SimpleNamespace(id=uuid4(), organization_id=organization_id)
    db = _DeleteDb([volunteer, None])
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    service.delete_volunteer(volunteer.id, actor_id)

    assert db.deleted == [volunteer]
    assert db.commits == 1
    assert len(db.executed) == 3
    signup_query = str(db.executed[0])
    assert "JOIN shift" in signup_query
    assert "shift.status" in signup_query
    assert "family_member" in str(db.executed[1]).lower()
    assert "DELETE FROM signup" in str(db.executed[2])
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "VOLUNTEER_DELETED_BY_ADMIN"
    assert audit.entity_id == volunteer.id
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id


def test_delete_volunteer_blocks_when_volunteer_has_signups_with_detail() -> None:
    volunteer = SimpleNamespace(id=uuid4())
    blocking_date = SimpleNamespace(isoformat=lambda: "2026-08-01")
    db = _DeleteDb([volunteer], blocking_signup=("Freundschaftsspiel", blocking_date))
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(VolunteerHasRecordsError) as excinfo:
        service.delete_volunteer(volunteer.id, uuid4())
    assert "Freundschaftsspiel" in excinfo.value.detail
    assert "2026-08-01" in excinfo.value.detail
    assert db.deleted == []
    assert db.commits == 0


def test_delete_volunteer_blocks_when_volunteer_has_work_records() -> None:
    volunteer = SimpleNamespace(id=uuid4())
    db = _DeleteDb([volunteer, SimpleNamespace()])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(VolunteerHasRecordsError):
        service.delete_volunteer(volunteer.id, uuid4())
    assert db.deleted == []
    assert db.commits == 0


def test_delete_volunteer_raises_not_found() -> None:
    db = _DeleteDb([None])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(VolunteerNotFoundError):
        service.delete_volunteer(uuid4(), uuid4())


def test_delete_volunteer_route_returns_204_on_success(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    captured: dict[str, object] = {}

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def delete_volunteer(self, volunteer_id: UUID, _actor_id: UUID) -> None:
            captured["volunteer_id"] = volunteer_id

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    volunteer_id = uuid4()
    try:
        response = client.delete(f"/api/admin/tenant-a/families/volunteers/{volunteer_id}")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 204
    assert captured["volunteer_id"] == volunteer_id


def test_delete_volunteer_route_requires_csrf_and_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(auth, "_organization_domains", lambda _db: set())
    volunteer_id = uuid4()
    try:
        missing_csrf = client.delete(f"/api/admin/tenant-a/families/volunteers/{volunteer_id}")
        app.dependency_overrides[dependencies.validate_csrf] = lambda: None
        missing_origin = client.delete(f"/api/admin/tenant-a/families/volunteers/{volunteer_id}")
    finally:
        app.dependency_overrides.clear()
    assert missing_csrf.status_code == 403
    assert missing_origin.status_code == 403


@pytest.mark.parametrize(
    ("raised", "expected_status"),
    [
        (VolunteerNotFoundError(), 404),
        (VolunteerHasRecordsError("Anmeldung verhindert das Löschen."), 409),
    ],
)
def test_delete_volunteer_route_maps_service_errors(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    raised: Exception,
    expected_status: int,
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def delete_volunteer(self, *_args: object, **_kwargs: object) -> None:
            raise raised

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.delete(f"/api/admin/tenant-a/families/volunteers/{uuid4()}")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == expected_status
