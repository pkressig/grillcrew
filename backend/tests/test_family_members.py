"""F007 Step 2 family-member model, service, API, and security tests."""

from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import auth, dependencies, families
from app.api.dependencies import CurrentStaffMembership
from app.db.session import get_db
from app.main import app
from app.models.family import Family, FamilyMember, FamilyMemberType, FamilyStatus
from app.models.identity import StaffMembership, StaffRole, User
from app.models.organization import Organization
from app.schemas.family import FamilyMemberCreate
from app.services.family import FamilyNotFoundError, FamilyService


def _current(slug: str = "tenant-a") -> CurrentStaffMembership:
    return CurrentStaffMembership(
        organization=cast(Organization, SimpleNamespace(id=uuid4(), slug=slug)),
        user=cast(User, SimpleNamespace(id=uuid4())),
        membership=cast(StaffMembership, SimpleNamespace(role=StaffRole.KOORDINATION)),
    )


@pytest.mark.parametrize("member_type", list(FamilyMemberType))
def test_member_payload_trims_and_accepts_both_types(member_type: FamilyMemberType) -> None:
    payload = FamilyMemberCreate(
        member_type=member_type, first_name="  Mia ", last_name=" Muster  "
    )
    assert payload.first_name == "Mia"
    assert payload.last_name == "Muster"


@pytest.mark.parametrize(
    "payload",
    [
        {"member_type": "OTHER", "first_name": "Mia", "last_name": "Muster"},
        {"member_type": "CHILD", "first_name": " ", "last_name": "Muster"},
        {"member_type": "HELPER", "first_name": "Mia", "last_name": "x" * 101},
        {
            "member_type": "CHILD",
            "first_name": "Mia",
            "last_name": "Muster",
            "family_id": str(uuid4()),
        },
        {
            "member_type": "CHILD",
            "first_name": "Mia",
            "last_name": "Muster",
            "organization_id": str(uuid4()),
        },
        {
            "member_type": "CHILD",
            "first_name": "Mia",
            "last_name": "Muster",
            "team": "U12",
        },
    ],
)
def test_member_payload_is_strict(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        FamilyMemberCreate.model_validate(payload)


class _MemberDb:
    def __init__(self, family: Family | None, rows: list[FamilyMember] | None = None) -> None:
        self.family = family
        self.rows = rows or []
        self.statements: list[object] = []
        self.added: list[FamilyMember] = []
        self.commits = 0

    def scalar(self, statement: object) -> Family | None:
        self.statements.append(statement)
        return self.family

    def scalars(self, statement: object) -> list[FamilyMember]:
        self.statements.append(statement)
        return self.rows

    def add(self, member: FamilyMember) -> None:
        self.added.append(member)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, member: FamilyMember) -> None:
        member.id = uuid4()


def _family(family_id: UUID | None = None) -> Family:
    return cast(
        Family,
        SimpleNamespace(id=family_id or uuid4(), status=FamilyStatus.ACTIVE),
    )


def test_member_lookup_is_scoped_to_active_family_and_sorted() -> None:
    family_id = uuid4()
    organization_id = uuid4()
    db = _MemberDb(_family(family_id))
    FamilyService(cast(object, db), organization_id).list_members(family_id)  # type: ignore[arg-type]
    family_sql = str(db.statements[0])
    member_sql = str(db.statements[1])
    assert "family.id" in family_sql
    assert "family.organization_id" in family_sql
    assert "family.status" in family_sql
    assert "ORDER BY family_member.last_name, family_member.first_name" in member_sql


def test_foreign_inactive_or_missing_family_is_not_found() -> None:
    service = FamilyService(cast(object, _MemberDb(None)), uuid4())  # type: ignore[arg-type]
    with pytest.raises(FamilyNotFoundError):
        service.list_members(uuid4())
    with pytest.raises(FamilyNotFoundError):
        service.create_member(
            uuid4(),
            FamilyMemberCreate(member_type="CHILD", first_name="Mia", last_name="Muster"),
        )


def test_duplicate_member_names_are_allowed() -> None:
    family_id = uuid4()
    db = _MemberDb(_family(family_id))
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    for member_type in FamilyMemberType:
        service.create_member(
            family_id,
            FamilyMemberCreate(member_type=member_type, first_name="Mia", last_name="Muster"),
        )
    assert [(item.first_name, item.last_name) for item in db.added] == [
        ("Mia", "Muster"),
        ("Mia", "Muster"),
    ]
    assert db.commits == 2


def test_member_routes_reject_foreign_slug_and_family(client: TestClient) -> None:
    current = _current()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _MemberDb(None)
    try:
        foreign_slug = client.get(f"/api/admin/tenant-b/families/{uuid4()}/members")
        foreign_family = client.get(f"/api/admin/tenant-a/families/{uuid4()}/members")
    finally:
        app.dependency_overrides.clear()
    assert foreign_slug.status_code == 403
    assert foreign_family.status_code == 404


def test_member_create_requires_csrf_and_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    family_id = uuid4()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _MemberDb(_family(family_id))
    monkeypatch.setattr(auth, "_organization_domains", lambda _db: set())
    payload = {"member_type": "CHILD", "first_name": "Mia", "last_name": "Muster"}
    try:
        missing_csrf = client.post(
            f"/api/admin/tenant-a/families/{family_id}/members", json=payload
        )
        app.dependency_overrides[dependencies.validate_csrf] = lambda: None
        missing_origin = client.post(
            f"/api/admin/tenant-a/families/{family_id}/members", json=payload
        )
    finally:
        app.dependency_overrides.clear()
    assert missing_csrf.status_code == 403
    assert missing_origin.status_code == 403


def test_member_api_returns_exact_private_fields(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    family_id = uuid4()
    item = SimpleNamespace(
        id=uuid4(),
        family_id=family_id,
        member_type=FamilyMemberType.HELPER,
        first_name="Mia",
        last_name="Andere",
        phone="must not leak",
        team="must not leak",
    )

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def list_members(self, received_family_id: UUID) -> list[object]:
            assert received_family_id == family_id
            return [item]

        def create_member(self, received_family_id: UUID, payload: FamilyMemberCreate) -> object:
            assert received_family_id == family_id
            assert payload.first_name == "Mia"
            return item

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _MemberDb(_family(family_id))
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        listed = client.get(f"/api/admin/tenant-a/families/{family_id}/members")
        created = client.post(
            f"/api/admin/tenant-a/families/{family_id}/members",
            json={"member_type": "HELPER", "first_name": " Mia ", "last_name": "Andere"},
        )
    finally:
        app.dependency_overrides.clear()
    expected = {"id", "family_id", "member_type", "first_name", "last_name"}
    assert listed.status_code == 200
    assert created.status_code == 201
    assert set(listed.json()[0]) == expected
    assert set(created.json()) == expected
    assert "phone" not in listed.text
    assert "team" not in listed.text
