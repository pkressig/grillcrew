"""F007 Step 1 family model, service, API, validation, and authorization tests."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import dependencies, families
from app.api.dependencies import CurrentStaffMembership
from app.db.session import get_db
from app.main import app
from app.models.family import Family, FamilyStatus
from app.models.identity import StaffMembership, StaffRole, User
from app.models.organization import Organization
from app.schemas.family import FamilyCreate, FamilyUpdate
from app.services.family import FamilyService


def _current(role: StaffRole, slug: str = "tenant-a") -> CurrentStaffMembership:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug=slug))
    return CurrentStaffMembership(
        organization=organization,
        user=cast(User, SimpleNamespace(id=uuid4())),
        membership=cast(StaffMembership, SimpleNamespace(role=role)),
    )


@pytest.mark.parametrize("role", [StaffRole.ADMIN, StaffRole.KOORDINATION])
def test_family_manage_allows_admin_and_coordination(role: StaffRole) -> None:
    current = _current(role)
    assert families.manage(current) is current


@pytest.mark.parametrize("role", [StaffRole.KIOSK, StaffRole.VORSTAND_LESEN])
def test_family_manage_denies_other_roles(role: StaffRole) -> None:
    with pytest.raises(HTTPException) as error:
        families.manage(_current(role))
    assert error.value.status_code == 403


def test_family_name_is_trimmed_and_payload_rejects_tenant_or_status() -> None:
    payload = FamilyCreate(display_name="  Familie Muster  ", internal_note="intern")
    assert payload.display_name == "Familie Muster"
    with pytest.raises(ValidationError):
        FamilyCreate(display_name="   ")
    with pytest.raises(ValidationError):
        FamilyCreate(display_name="x" * 161)
    with pytest.raises(ValidationError):
        FamilyCreate.model_validate(
            {"display_name": "Muster", "organization_id": str(uuid4()), "status": "ACTIVE"}
        )


def test_family_update_payload_is_trimmed_and_rejects_blank_or_extra_fields() -> None:
    payload = FamilyUpdate(display_name="  Familie Neu  ")
    assert payload.display_name == "Familie Neu"
    with pytest.raises(ValidationError):
        FamilyUpdate(display_name="   ")
    with pytest.raises(ValidationError):
        FamilyUpdate(display_name="x" * 161)
    with pytest.raises(ValidationError):
        FamilyUpdate.model_validate({"display_name": "Muster", "internal_note": "not allowed"})


class _FamilyDb:
    def __init__(self, rows: list[tuple[Family, int, int]] | None = None) -> None:
        self.rows = rows or []
        self.added: list[Family] = []
        self.statements: list[object] = []
        self.commits = 0

    def execute(self, statement: object) -> list[tuple[Family, int, int]]:
        self.statements.append(statement)
        return self.rows

    def add(self, family: Family) -> None:
        self.added.append(family)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, family: Family) -> None:
        family.id = uuid4()
        family.created_at = datetime.now(UTC)
        family.updated_at = datetime.now(UTC)


def test_service_lists_only_active_families_for_its_tenant() -> None:
    db = _FamilyDb()
    organization_id = uuid4()
    FamilyService(cast(object, db), organization_id).list_active()  # type: ignore[arg-type]
    sql = str(db.statements[0])
    assert "family.organization_id" in sql
    assert "family.status" in sql
    assert "family_member" in sql
    assert "FILTER (WHERE family_member.member_type" in sql
    assert "LEFT OUTER JOIN" in sql
    assert "ORDER BY family.display_name, family.id" in sql


def test_service_preserves_zero_member_counts() -> None:
    family = Family(
        organization_id=uuid4(),
        display_name="Familie Leer",
        status=FamilyStatus.ACTIVE,
        internal_note=None,
    )
    db = _FamilyDb([(family, 0, 0)])
    assert FamilyService(cast(object, db), family.organization_id).list_active() == [(family, 0, 0)]  # type: ignore[arg-type]


def test_duplicate_names_are_allowed_and_always_created_active() -> None:
    db = _FamilyDb()
    organization_id = uuid4()
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]
    for note in ("erste", "zweite"):
        result = service.create(FamilyCreate(display_name="Muster", internal_note=note))
        assert result.organization_id == organization_id
        assert result.status == FamilyStatus.ACTIVE
    assert [item.display_name for item in db.added] == ["Muster", "Muster"]
    assert db.commits == 2


def test_wrong_organization_slug_is_forbidden(client: TestClient) -> None:
    app.dependency_overrides[families.manage] = lambda: _current(StaffRole.ADMIN)
    app.dependency_overrides[get_db] = lambda: _FamilyDb()
    try:
        response = client.get("/api/admin/tenant-b/families")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_create_and_list_return_only_admin_family_fields(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization_id = uuid4()
    family_id = uuid4()
    now = datetime.now(UTC)
    item = SimpleNamespace(
        id=family_id,
        organization_id=organization_id,
        display_name="Familie Muster",
        status=FamilyStatus.ACTIVE,
        internal_note="Nur intern",
        created_at=now,
        updated_at=now,
        child_data="must never leak",
    )

    class FakeService:
        def __init__(self, _db: object, received_organization_id: UUID) -> None:
            assert received_organization_id == organization_id

        def list_active(self) -> list[tuple[object, int, int]]:
            return [(item, 2, 1)]

        def create(self, payload: FamilyCreate) -> object:
            assert payload.display_name == "Familie Muster"
            return item

    current = _current(StaffRole.KOORDINATION)
    current.organization.id = organization_id
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _FamilyDb()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        listed = client.get("/api/admin/tenant-a/families")
        created = client.post(
            "/api/admin/tenant-a/families",
            json={"display_name": "  Familie Muster  ", "internal_note": "Nur intern"},
        )
    finally:
        app.dependency_overrides.clear()

    assert listed.status_code == 200
    assert created.status_code == 201
    family_keys = {
        "id",
        "organization_id",
        "display_name",
        "status",
        "internal_note",
        "created_at",
        "updated_at",
    }
    assert set(listed.json()[0]) == family_keys | {"children_count", "helpers_count"}
    assert set(created.json()) == family_keys
    assert listed.json()[0]["children_count"] == 2
    assert listed.json()[0]["helpers_count"] == 1
    assert listed.json()[0]["internal_note"] == "Nur intern"
    assert "child_data" not in listed.text
