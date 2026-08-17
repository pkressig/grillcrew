"""F007 Step 2 family-member model, service, API, and security tests."""

from datetime import UTC, datetime
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
from app.models.planning import Volunteer, VolunteerCompensation, VolunteerStatus
from app.schemas.family import (
    FamilyMemberCreate,
    FamilyMemberVolunteerUpdate,
    FamilyUpdate,
    VolunteerAdminUpdate,
)
from app.services.family import (
    FamilyHasMembersError,
    FamilyMemberLinkError,
    FamilyMemberNotFoundError,
    FamilyMergeError,
    FamilyNotFoundError,
    FamilyService,
    VolunteerNotFoundError,
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
        team_name=None,
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
    expected = {
        "id",
        "family_id",
        "member_type",
        "first_name",
        "last_name",
        "volunteer_id",
        "team_name",
    }
    assert listed.status_code == 200
    assert created.status_code == 201
    assert set(listed.json()[0]) == expected
    assert set(created.json()) == expected
    assert "phone" not in listed.text
    assert '"team":' not in listed.text


class _LinkDb:
    def __init__(
        self, scalars: list[object | None], volunteers: list[object] | None = None
    ) -> None:
        self.scalar_results = iter(scalars)
        self.volunteers = volunteers or []
        self.statements: list[object] = []
        self.executed: list[object] = []
        self.added: list[object] = []
        self.deleted: list[object] = []
        self.commits = 0

    def scalar(self, statement: object) -> object | None:
        self.statements.append(statement)
        return next(self.scalar_results)

    def scalars(self, statement: object) -> list[object]:
        self.statements.append(statement)
        return self.volunteers

    def execute(self, statement: object) -> SimpleNamespace:
        self.executed.append(statement)
        return SimpleNamespace(rowcount=0)

    def add(self, item: object) -> None:
        self.added.append(item)

    def delete(self, item: object) -> None:
        self.deleted.append(item)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, _item: object) -> None:
        pass


def _helper(
    family_id: UUID, volunteer_id: UUID | None = None, team_name: str | None = None
) -> FamilyMember:
    return cast(
        FamilyMember,
        SimpleNamespace(
            id=uuid4(),
            family_id=family_id,
            member_type=FamilyMemberType.HELPER,
            first_name="Snapshot",
            last_name="Name",
            volunteer_id=volunteer_id,
            team_name=team_name,
        ),
    )


def test_lists_active_and_linked_inactive_tenant_volunteers_by_name() -> None:
    db = _LinkDb([], [SimpleNamespace(id=uuid4(), first_name="Anna", last_name="Zeta")])
    result = FamilyService(cast(object, db), uuid4()).list_family_volunteers()  # type: ignore[arg-type]
    assert len(result) == 1
    sql = str(db.statements[0])
    assert "volunteer.organization_id" in sql
    assert "volunteer.status" in sql
    assert "family_member.volunteer_id = volunteer.id" in sql
    assert "family.organization_id" in sql
    assert " OR (EXISTS " in sql
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
    member = _helper(family.id, team_name="U12")
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
            "team_name": "U12",
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


def _volunteer() -> Volunteer:
    return cast(
        Volunteer,
        SimpleNamespace(
            id=uuid4(),
            first_name="Old",
            last_name="Name",
            phone_normalized="+41791234567",
            phone_display="+41 79 123 45 67",
            email_normalized="old@example.invalid",
            email_display="old@example.invalid",
            compensation_preference=VolunteerCompensation.WORK_HOURS,
            compensation_family_member_id=None,
            internal_note=None,
            status=VolunteerStatus.ACTIVE,
            is_grill_helper=True,
            is_kiosk_helper=False,
        ),
    )


def test_update_volunteer_applies_changes_and_audits() -> None:
    organization_id = uuid4()
    actor_id = uuid4()
    volunteer = _volunteer()
    child_id = uuid4()
    db = _LinkDb([volunteer, SimpleNamespace(id=child_id)])
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    updated = service.update_volunteer(
        volunteer.id,
        VolunteerAdminUpdate(
            first_name="New",
            last_name="Name",
            phone="079 999 88 77",
            email="new@example.invalid",
            compensation_preference=VolunteerCompensation.PAYOUT,
            compensation_family_member_id=child_id,
            internal_note="  Notiz  ",
            status=VolunteerStatus.ACTIVE,
        ),
        actor_id,
    )

    assert updated.first_name == "New"
    assert updated.phone_normalized == "0799998877"
    assert updated.email_normalized == "new@example.invalid"
    assert updated.compensation_preference == VolunteerCompensation.PAYOUT
    assert updated.compensation_family_member_id == child_id
    assert updated.internal_note == "Notiz"
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id
    assert audit.action == "VOLUNTEER_PROFILE_UPDATED_BY_ADMIN"
    assert audit.entity_id == volunteer.id
    assert set(cast(list[str], audit.event_metadata["changed_fields"])) == {
        "first_name",
        "phone",
        "email",
        "compensation_preference",
        "compensation_family_member_id",
        "internal_note",
    }
    assert len(db.executed) == 2
    assert "family_member" in str(db.executed[0]).lower()
    assert "signup" in str(db.executed[1]).lower()


def test_update_volunteer_identical_payload_skips_audit_but_still_syncs_denormalized_name() -> None:
    # No Volunteer field changed, but the FamilyMember/signup name copies are always
    # re-synced (and thus committed) -- reopening and saving self-heals a name left
    # stale by an edit made before this sync existed.
    volunteer = _volunteer()
    db = _LinkDb([volunteer])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]

    service.update_volunteer(
        volunteer.id,
        VolunteerAdminUpdate(
            first_name=volunteer.first_name,
            last_name=volunteer.last_name,
            phone=volunteer.phone_normalized,
            email=volunteer.email_normalized,
            compensation_preference=volunteer.compensation_preference,
            compensation_family_member_id=None,
            internal_note=None,
            status=volunteer.status,
        ),
        uuid4(),
    )
    assert db.added == []
    assert db.commits == 1
    assert len(db.executed) == 2


def test_update_volunteer_rejects_missing_volunteer() -> None:
    db = _LinkDb([None])
    with pytest.raises(VolunteerNotFoundError):
        FamilyService(cast(object, db), uuid4()).update_volunteer(  # type: ignore[arg-type]
            uuid4(),
            VolunteerAdminUpdate(
                first_name="New",
                last_name="Name",
                phone="0799998877",
                email="new@example.invalid",
                compensation_preference=VolunteerCompensation.VOLUNTARY,
                compensation_family_member_id=None,
                internal_note=None,
                status=VolunteerStatus.ACTIVE,
            ),
            uuid4(),
        )
    assert db.commits == 0 and db.added == []


def test_update_volunteer_rejects_invalid_child() -> None:
    volunteer = _volunteer()
    db = _LinkDb([volunteer, None])
    with pytest.raises(FamilyMemberLinkError, match="invalid child member"):
        FamilyService(cast(object, db), uuid4()).update_volunteer(  # type: ignore[arg-type]
            volunteer.id,
            VolunteerAdminUpdate(
                first_name="New",
                last_name="Name",
                phone="0799998877",
                email="new@example.invalid",
                compensation_preference=VolunteerCompensation.VOLUNTARY,
                compensation_family_member_id=uuid4(),
                internal_note=None,
                status=VolunteerStatus.ACTIVE,
            ),
            uuid4(),
        )
    assert db.commits == 0 and db.added == []


def test_volunteer_update_route_requires_csrf_and_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    volunteer_id = uuid4()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _MemberDb(None)
    monkeypatch.setattr(auth, "_organization_domains", lambda _db: set())
    payload = {
        "first_name": "New",
        "last_name": "Name",
        "phone": "0799998877",
        "email": "new@example.invalid",
        "compensation_preference": "WORK_HOURS",
        "compensation_family_member_id": None,
        "internal_note": None,
        "status": "ACTIVE",
    }
    try:
        missing_csrf = client.patch(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}", json=payload
        )
        app.dependency_overrides[dependencies.validate_csrf] = lambda: None
        missing_origin = client.patch(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}", json=payload
        )
    finally:
        app.dependency_overrides.clear()
    assert missing_csrf.status_code == 403
    assert missing_origin.status_code == 403


def test_volunteer_update_route_returns_404_for_unknown_volunteer(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    volunteer_id = uuid4()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def update_volunteer(
            self, received_id: UUID, _payload: VolunteerAdminUpdate, _actor_id: UUID
        ) -> object:
            assert received_id == volunteer_id
            raise VolunteerNotFoundError

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    payload = {
        "first_name": "New",
        "last_name": "Name",
        "phone": "0799998877",
        "email": "new@example.invalid",
        "compensation_preference": "WORK_HOURS",
        "compensation_family_member_id": None,
        "internal_note": None,
        "status": "ACTIVE",
    }
    try:
        response = client.patch(
            f"/api/admin/tenant-a/families/volunteers/{volunteer_id}", json=payload
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


def test_delete_member_removes_row_and_audits() -> None:
    family_id = uuid4()
    organization_id = uuid4()
    actor_id = uuid4()
    member = _helper(family_id)
    db = _LinkDb([_family(family_id), member])
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    service.delete_member(family_id, member.id, actor_id)

    assert db.deleted == [member]
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "FAMILY_MEMBER_DELETED_BY_ADMIN"
    assert audit.entity_id == member.id
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id


def test_delete_member_rejects_missing_member() -> None:
    family_id = uuid4()
    db = _LinkDb([_family(family_id), None])
    with pytest.raises(FamilyMemberNotFoundError):
        FamilyService(cast(object, db), uuid4()).delete_member(  # type: ignore[arg-type]
            family_id, uuid4(), uuid4()
        )
    assert db.commits == 0 and db.added == []


def test_delete_member_route_requires_csrf_and_origin(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: _MemberDb(None)
    monkeypatch.setattr(auth, "_organization_domains", lambda _db: set())
    try:
        missing_csrf = client.delete(f"/api/admin/tenant-a/families/{uuid4()}/members/{uuid4()}")
        app.dependency_overrides[dependencies.validate_csrf] = lambda: None
        missing_origin = client.delete(f"/api/admin/tenant-a/families/{uuid4()}/members/{uuid4()}")
    finally:
        app.dependency_overrides.clear()
    assert missing_csrf.status_code == 403
    assert missing_origin.status_code == 403


def test_delete_member_route_returns_404_for_unknown_member(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def delete_member(self, _family_id: UUID, _member_id: UUID, _actor_id: UUID) -> None:
            raise FamilyMemberNotFoundError

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.delete(f"/api/admin/tenant-a/families/{uuid4()}/members/{uuid4()}")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


def test_delete_family_removes_row_when_empty() -> None:
    family_id = uuid4()
    organization_id = uuid4()
    actor_id = uuid4()
    family = _family(family_id)
    db = _LinkDb([family, 0])
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    service.delete_family(family_id, actor_id)

    assert db.deleted == [family]
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "FAMILY_DELETED_BY_ADMIN"
    assert audit.entity_id == family_id
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id


def test_delete_family_rejects_when_members_remain() -> None:
    family_id = uuid4()
    family = _family(family_id)
    db = _LinkDb([family, 2])
    with pytest.raises(FamilyHasMembersError):
        FamilyService(cast(object, db), uuid4()).delete_family(  # type: ignore[arg-type]
            family_id, uuid4()
        )
    assert db.commits == 0 and db.added == []


def test_delete_family_route_returns_409_when_members_remain(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def delete_family(self, _family_id: UUID, _actor_id: UUID) -> None:
            raise FamilyHasMembersError("Die Familie hat noch Mitglieder.")

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.delete(f"/api/admin/tenant-a/families/{uuid4()}")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 409


def test_update_family_renames_and_audits() -> None:
    family_id = uuid4()
    organization_id = uuid4()
    actor_id = uuid4()
    family = cast(
        Family,
        SimpleNamespace(id=family_id, status=FamilyStatus.ACTIVE, display_name="Alt"),
    )
    db = _LinkDb([family])
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    updated = service.update(family_id, FamilyUpdate(display_name="Neu"), actor_id)

    assert updated.display_name == "Neu"
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "FAMILY_RENAMED_BY_ADMIN"
    assert audit.entity_id == family_id
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id


def test_update_family_is_a_noop_when_name_is_unchanged() -> None:
    family_id = uuid4()
    family = cast(
        Family,
        SimpleNamespace(id=family_id, status=FamilyStatus.ACTIVE, display_name="Gleich"),
    )
    db = _LinkDb([family])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]

    service.update(family_id, FamilyUpdate(display_name="Gleich"), uuid4())

    assert db.commits == 0
    assert db.added == []


def test_update_family_raises_not_found_for_an_unknown_family() -> None:
    db = _LinkDb([None])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(FamilyNotFoundError):
        service.update(uuid4(), FamilyUpdate(display_name="Neu"), uuid4())


def test_update_family_route_returns_the_renamed_family(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    family_id = uuid4()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def update(
            self, received_family_id: UUID, payload: FamilyUpdate, _actor_id: UUID
        ) -> object:
            assert received_family_id == family_id
            now = datetime.now(UTC)
            return SimpleNamespace(
                id=family_id,
                organization_id=uuid4(),
                display_name=payload.display_name,
                status=FamilyStatus.ACTIVE,
                internal_note=None,
                created_at=now,
                updated_at=now,
            )

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.patch(
            f"/api/admin/tenant-a/families/{family_id}", json={"display_name": "Neuer Name"}
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["display_name"] == "Neuer Name"


def test_update_family_route_returns_404_for_unknown_family(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def update(self, _family_id: UUID, _payload: FamilyUpdate, _actor_id: UUID) -> object:
            raise FamilyNotFoundError

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.patch(
            f"/api/admin/tenant-a/families/{uuid4()}", json={"display_name": "Neu"}
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


def test_merge_moves_members_and_deletes_the_source_family() -> None:
    organization_id = uuid4()
    actor_id = uuid4()
    target_id = uuid4()
    source_id = uuid4()
    target = _family(target_id)
    source = _family(source_id)
    db = _LinkDb([target, source])
    service = FamilyService(cast(object, db), organization_id)  # type: ignore[arg-type]

    merged = service.merge(target_id, source_id, actor_id)

    assert merged is target
    assert len(db.executed) == 1
    move_statement = str(db.executed[0])
    assert "UPDATE family_member" in move_statement
    assert db.deleted == [source]
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "FAMILY_MERGED_BY_ADMIN"
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id
    assert audit.entity_id == target_id
    assert audit.event_metadata["merged_family_id"] == str(source_id)


def test_merge_rejects_merging_a_family_into_itself() -> None:
    family_id = uuid4()
    db = _LinkDb([])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]

    with pytest.raises(FamilyMergeError):
        service.merge(family_id, family_id, uuid4())
    assert db.commits == 0 and db.added == [] and db.deleted == []


def test_merge_raises_not_found_when_the_source_family_is_missing() -> None:
    target = _family(uuid4())
    db = _LinkDb([target, None])
    service = FamilyService(cast(object, db), uuid4())  # type: ignore[arg-type]

    with pytest.raises(FamilyNotFoundError):
        service.merge(target.id, uuid4(), uuid4())


def test_merge_family_route_returns_the_merged_family(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    target_id = uuid4()
    source_id = uuid4()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def merge(
            self, received_target_id: UUID, received_source_id: UUID, _actor_id: UUID
        ) -> object:
            assert received_target_id == target_id
            assert received_source_id == source_id
            now = datetime.now(UTC)
            return SimpleNamespace(
                id=target_id,
                organization_id=uuid4(),
                display_name="Familie Muster",
                status=FamilyStatus.ACTIVE,
                internal_note=None,
                created_at=now,
                updated_at=now,
            )

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.post(
            f"/api/admin/tenant-a/families/{target_id}/merge",
            json={"source_family_id": str(source_id)},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["id"] == str(target_id)


def test_merge_family_route_returns_422_for_a_self_merge(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    family_id = uuid4()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def merge(self, _target_id: UUID, _source_id: UUID, _actor_id: UUID) -> object:
            raise FamilyMergeError(
                "Eine Familie kann nicht mit sich selbst zusammengeführt werden."
            )

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.post(
            f"/api/admin/tenant-a/families/{family_id}/merge",
            json={"source_family_id": str(family_id)},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 422


def test_merge_family_route_returns_404_for_an_unknown_family(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def merge(self, _target_id: UUID, _source_id: UUID, _actor_id: UUID) -> object:
            raise FamilyNotFoundError

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    monkeypatch.setattr(families, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.post(
            f"/api/admin/tenant-a/families/{uuid4()}/merge",
            json={"source_family_id": str(uuid4())},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404


def test_volunteer_list_api_returns_exact_fields(
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
        internal_note="secret note",
        status=VolunteerStatus.ACTIVE,
        is_grill_helper=True,
        is_kiosk_helper=False,
        user_id="must not leak",
    )

    class FakeService:
        def __init__(self, _db: object, _organization_id: UUID) -> None:
            pass

        def list_family_volunteers(self) -> list[object]:
            return [item]

    app.dependency_overrides[families.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(families, "FamilyService", FakeService)
    try:
        listed = client.get("/api/admin/tenant-a/families/volunteers")
    finally:
        app.dependency_overrides.clear()
    expected = {
        "id",
        "first_name",
        "last_name",
        "phone",
        "email",
        "compensation_preference",
        "compensation_family_member_id",
        "internal_note",
        "status",
        "is_grill_helper",
        "is_kiosk_helper",
    }
    assert listed.status_code == 200
    assert set(listed.json()[0]) == expected
    assert "must not leak" not in listed.text
