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
from app.models.identity import AuditEvent, StaffMembership, StaffRole, User
from app.models.organization import Organization
from app.models.planning import Volunteer, VolunteerStatus
from app.schemas.family import FamilyMemberCreate, FamilyMemberVolunteerUpdate
from app.services.family import (
    FamilyMemberLinkError,
    FamilyMemberNotFoundError,
    FamilyNotFoundError,
    FamilyService,
)


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
        volunteer_id=None,
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
    expected = {"id", "family_id", "member_type", "first_name", "last_name", "volunteer_id"}
    assert listed.status_code == 200
    assert created.status_code == 201
    assert set(listed.json()[0]) == expected
    assert set(created.json()) == expected
    assert "phone" not in listed.text
    assert "team" not in listed.text


class _LinkDb:
    def __init__(
        self, scalars: list[object | None], volunteers: list[object] | None = None
    ) -> None:
        self.scalar_results = iter(scalars)
        self.volunteers = volunteers or []
        self.statements: list[object] = []
        self.added: list[object] = []
        self.commits = 0

    def scalar(self, statement: object) -> object | None:
        self.statements.append(statement)
        return next(self.scalar_results)

    def scalars(self, statement: object) -> list[object]:
        self.statements.append(statement)
        return self.volunteers

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _item: object) -> None:
        pass


def _helper(family_id: UUID, volunteer_id: UUID | None = None) -> FamilyMember:
    return cast(
        FamilyMember,
        SimpleNamespace(
            id=uuid4(),
            family_id=family_id,
            member_type=FamilyMemberType.HELPER,
            first_name="Snapshot",
            last_name="Name",
            volunteer_id=volunteer_id,
        ),
    )


def test_lists_only_active_tenant_volunteers_by_name() -> None:
    db = _LinkDb([], [SimpleNamespace(id=uuid4(), first_name="Anna", last_name="Zeta")])
    result = FamilyService(cast(object, db), uuid4()).list_active_volunteers()  # type: ignore[arg-type]
    assert len(result) == 1
    sql = str(db.statements[0])
    assert "volunteer.organization_id" in sql
    assert "volunteer.status" in sql
    assert "ORDER BY volunteer.last_name, volunteer.first_name" in sql


def test_links_replaces_removes_and_audits_real_changes_only() -> None:
    family_id = uuid4()
    organization_id = uuid4()
    actor_id = uuid4()
    first_id = uuid4()
    second_id = uuid4()
    member = _helper(family_id)
    family = _family(family_id)
    active = cast(Volunteer, SimpleNamespace(id=first_id, status=VolunteerStatus.ACTIVE))
    db = _LinkDb(
        [
            family,
            member,
            active,
            family,
            member,
            family,
            member,
            active,
            family,
            member,
        ]
    )
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    linked = service.update_member_volunteer(
        family_id, member.id, FamilyMemberVolunteerUpdate(volunteer_id=first_id), actor_id
    )
    assert linked.volunteer_id == first_id
    audit = cast(AuditEvent, db.added[-1])
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id
    assert audit.action == "FAMILY_MEMBER_VOLUNTEER_LINK_CHANGED"
    assert audit.entity_id == member.id
    assert audit.event_metadata == {
        "family_id": str(family_id),
        "previous_volunteer_id": None,
        "new_volunteer_id": str(first_id),
    }

    # An idempotent repeat neither commits nor audits.
    service.update_member_volunteer(
        family_id, member.id, FamilyMemberVolunteerUpdate(volunteer_id=first_id), actor_id
    )
    assert db.commits == 1
    assert len(db.added) == 1

    # Replace uses another active same-tenant volunteer.
    active.id = second_id
    service.update_member_volunteer(
        family_id, member.id, FamilyMemberVolunteerUpdate(volunteer_id=second_id), actor_id
    )
    assert cast(AuditEvent, db.added[-1]).event_metadata["previous_volunteer_id"] == str(first_id)

    service.update_member_volunteer(
        family_id, member.id, FamilyMemberVolunteerUpdate(volunteer_id=None), actor_id
    )
    assert member.volunteer_id is None
    assert cast(AuditEvent, db.added[-1]).event_metadata["new_volunteer_id"] is None
    assert db.commits == 3
    assert member.first_name == "Snapshot" and member.last_name == "Name"


@pytest.mark.parametrize("member_type", [FamilyMemberType.CHILD])
def test_rejects_child_and_foreign_missing_or_inactive_volunteer(
    member_type: FamilyMemberType,
) -> None:
    family_id = uuid4()
    child = _helper(family_id)
    child.member_type = member_type
    child_db = _LinkDb([_family(family_id), child])
    with pytest.raises(FamilyMemberLinkError, match="only helper"):
        FamilyService(cast(object, child_db), uuid4()).update_member_volunteer(  # type: ignore[arg-type]
            family_id,
            child.id,
            FamilyMemberVolunteerUpdate(volunteer_id=uuid4()),
            uuid4(),
        )

    helper = _helper(family_id)
    missing_db = _LinkDb([_family(family_id), helper, None])
    with pytest.raises(FamilyMemberLinkError, match="active volunteer not found"):
        FamilyService(cast(object, missing_db), uuid4()).update_member_volunteer(  # type: ignore[arg-type]
            family_id,
            helper.id,
            FamilyMemberVolunteerUpdate(volunteer_id=uuid4()),
            uuid4(),
        )
    assert missing_db.commits == 0 and missing_db.added == []


class _ChildrenDb:
    def __init__(self, rows: list[tuple[object, object]]) -> None:
        self.rows = rows
        self.statements: list[object] = []

    def execute(self, statement: object) -> list[tuple[object, object]]:
        self.statements.append(statement)
        return self.rows


def test_lists_only_active_children_ordered_by_family_and_name() -> None:
    family = _family()
    member = _helper(family.id)
    member.member_type = FamilyMemberType.CHILD
    db = _ChildrenDb([(member, family)])
    result = FamilyService(cast(object, db), uuid4()).list_active_children()  # type: ignore[arg-type]
    assert result == [(member, family)]
    sql = str(db.statements[0])
    assert "family.organization_id" in sql
    assert "family.status" in sql
    assert "family_member.member_type" in sql
    assert "ORDER BY family.display_name" in sql


def test_children_route_lists_across_families_and_rejects_foreign_slug(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    family = _family()
    member = _helper(family.id)
    member.member_type = FamilyMemberType.CHILD
    member.first_name = "Mia"
    member.last_name = "Muster"
    family.display_name = "Familie Muster"

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def list_active_children(self) -> list[object]:
            return [(member, family)]

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    try:
        listed = client.get("/api/admin/tenant-a/families/children")
        foreign = client.get("/api/admin/tenant-b/families/children")
    finally:
        app.dependency_overrides.clear()
    assert listed.status_code == 200
    assert listed.json() == [
        {
            "id": str(member.id),
            "family_id": str(family.id),
            "family_display_name": "Familie Muster",
            "first_name": "Mia",
            "last_name": "Muster",
        }
    ]
    assert foreign.status_code == 403


def test_rejects_missing_member_without_audit() -> None:
    family_id = uuid4()
    db = _LinkDb([_family(family_id), None])
    with pytest.raises(FamilyMemberNotFoundError):
        FamilyService(cast(object, db), uuid4()).update_member_volunteer(  # type: ignore[arg-type]
            family_id,
            uuid4(),
            FamilyMemberVolunteerUpdate(volunteer_id=None),
            uuid4(),
        )
    assert db.commits == 0 and db.added == []
