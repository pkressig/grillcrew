"""F015 Phase 4A work-record model, schema, service, and API tests."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import dependencies, planning
from app.api.dependencies import CurrentStaffMembership
from app.db.session import get_db
from app.main import app
from app.models.family import FamilyMemberType
from app.models.identity import AuditEvent, StaffMembership, StaffRole, User
from app.models.organization import Organization
from app.models.planning import SignupOutcome, SignupStatus
from app.models.work_record import CompensationType, PayoutStatus, WorkRecord
from app.schemas.work_record import WorkRecordClassify, WorkRecordPayoutStatusUpdate
from app.services.settings import SettingsNotFoundError
from app.services.work_record import (
    WorkRecordConflictError,
    WorkRecordNotFoundError,
    WorkRecordService,
    WorkRecordValidationError,
    round_half_up_minor,
)


def _current(
    slug: str = "tenant-a", role: StaffRole = StaffRole.KOORDINATION
) -> CurrentStaffMembership:
    return CurrentStaffMembership(
        organization=cast(Organization, SimpleNamespace(id=uuid4(), slug=slug)),
        user=cast(User, SimpleNamespace(id=uuid4())),
        membership=cast(StaffMembership, SimpleNamespace(role=role)),
    )


# -- Rounding ------------------------------------------------------------------


def test_round_half_up_minor_matches_commercial_rounding_not_bankers_rounding() -> None:
    # 1 minute at 870 minor/hour = 14.5 minor exactly; Python's round() gives 14 (round-to-even).
    assert round_half_up_minor(1, 870) == 15
    assert round_half_up_minor(90, 900) == 1350
    assert round_half_up_minor(1, 930) == 16


# -- Schema validation -----------------------------------------------------------


def test_classify_payload_rejects_payout_without_duration() -> None:
    with pytest.raises(ValidationError):
        WorkRecordClassify(compensation_type=CompensationType.PAYOUT)
    with pytest.raises(ValidationError):
        WorkRecordClassify(compensation_type=CompensationType.PAYOUT, duration_minutes=0)


@pytest.mark.parametrize(
    "compensation_type", [CompensationType.WORK_HOURS, CompensationType.VOLUNTARY]
)
def test_classify_payload_allows_non_payout_without_duration(
    compensation_type: CompensationType,
) -> None:
    payload = WorkRecordClassify(compensation_type=compensation_type)
    assert payload.duration_minutes is None


def test_classify_payload_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        WorkRecordClassify.model_validate(
            {"compensation_type": "VOLUNTARY", "organization_id": str(uuid4())}
        )


def test_payout_status_payload_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        WorkRecordPayoutStatusUpdate.model_validate({"payout_status": "APPROVED", "note": "x"})


# -- Service: fake DB ------------------------------------------------------------


class _WorkRecordDb:
    def __init__(self, scalars: list[object | None]) -> None:
        self.scalar_results = iter(scalars)
        self.added: list[object] = []
        self.commits = 0
        self.refreshes = 0

    def scalar(self, _statement: object) -> object | None:
        return next(self.scalar_results)

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, item: object) -> None:
        self.refreshes += 1
        if getattr(item, "id", None) is None:
            setattr(item, "id", uuid4())  # noqa: B010


def _signup(
    signup_id: UUID | None = None,
    volunteer_id: UUID | None = None,
    status: SignupStatus = SignupStatus.ACTIVE,
    outcome: SignupOutcome = SignupOutcome.ATTENDED,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=signup_id or uuid4(),
        volunteer_id=volunteer_id or uuid4(),
        status=status,
        outcome=outcome,
    )


def _family_member(member_id: UUID | None = None) -> SimpleNamespace:
    return SimpleNamespace(id=member_id or uuid4(), member_type=FamilyMemberType.CHILD)


def _settings(rate: int = 900) -> SimpleNamespace:
    return SimpleNamespace(payout_rate_minor_per_hour=rate)


def _record(**overrides: object) -> WorkRecord:
    now = datetime.now(UTC)
    defaults: dict[str, object] = {
        "id": uuid4(),
        "organization_id": uuid4(),
        "signup_id": uuid4(),
        "volunteer_id": uuid4(),
        "credited_family_member_id": None,
        "compensation_type": CompensationType.VOLUNTARY,
        "duration_minutes": None,
        "payout_rate_minor_per_hour": None,
        "payout_amount_minor": None,
        "payout_status": None,
        "signature_received_at": None,
        "signature_confirmed_by_user_id": None,
        "note": None,
        "created_at": now,
        "updated_at": now,
    }
    defaults.update(overrides)
    return WorkRecord(**defaults)


def test_classify_requires_active_attended_signup() -> None:
    signup = _signup(status=SignupStatus.CANCELLED_BY_VOLUNTEER)
    db = _WorkRecordDb([signup])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordConflictError, match="attended"):
        service.classify(
            signup.id, WorkRecordClassify(compensation_type=CompensationType.VOLUNTARY), uuid4()
        )
    assert db.commits == 0


def test_classify_missing_signup_is_not_found() -> None:
    db = _WorkRecordDb([None])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordNotFoundError):
        service.classify(
            uuid4(), WorkRecordClassify(compensation_type=CompensationType.VOLUNTARY), uuid4()
        )


def test_classify_rejects_non_child_or_foreign_family_member() -> None:
    signup = _signup()
    db = _WorkRecordDb([signup, None])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordValidationError, match="child"):
        service.classify(
            signup.id,
            WorkRecordClassify(
                compensation_type=CompensationType.WORK_HOURS,
                credited_family_member_id=uuid4(),
            ),
            uuid4(),
        )
    assert db.commits == 0


def test_classify_creates_work_hours_record_and_audits() -> None:
    signup = _signup()
    member = _family_member()
    organization_id = uuid4()
    actor_id = uuid4()
    db = _WorkRecordDb([signup, member, None])
    service = WorkRecordService(cast(object, db), organization_id)  # type: ignore[arg-type]

    record = service.classify(
        signup.id,
        WorkRecordClassify(
            compensation_type=CompensationType.WORK_HOURS,
            credited_family_member_id=member.id,
            duration_minutes=120,
        ),
        actor_id,
    )

    assert record.compensation_type == CompensationType.WORK_HOURS
    assert record.credited_family_member_id == member.id
    assert record.duration_minutes == 120
    assert record.payout_amount_minor is None
    assert record.payout_status is None
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.organization_id == organization_id
    assert audit.actor_user_id == actor_id
    assert audit.action == "WORK_RECORD_CLASSIFIED"
    assert audit.entity_type == "signup"
    assert audit.entity_id == signup.id
    assert audit.event_metadata == {
        "previous_compensation_type": None,
        "new_compensation_type": "WORK_HOURS",
        "previous_credited_family_member_id": None,
        "new_credited_family_member_id": str(member.id),
    }


def test_classify_explicit_unassignment_is_allowed() -> None:
    signup = _signup()
    db = _WorkRecordDb([signup, None])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]

    record = service.classify(
        signup.id, WorkRecordClassify(compensation_type=CompensationType.VOLUNTARY), uuid4()
    )

    assert record.credited_family_member_id is None
    assert record.compensation_type == CompensationType.VOLUNTARY
    assert db.commits == 1


def test_classify_payout_computes_rate_and_commercial_rounding() -> None:
    signup = _signup()
    settings = _settings(rate=870)
    db = _WorkRecordDb([signup, None, settings])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]

    record = service.classify(
        signup.id,
        WorkRecordClassify(compensation_type=CompensationType.PAYOUT, duration_minutes=1),
        uuid4(),
    )

    assert record.payout_rate_minor_per_hour == 870
    assert record.payout_amount_minor == 15
    assert record.payout_status == PayoutStatus.OPEN


def test_classify_payout_without_organization_settings_raises() -> None:
    signup = _signup()
    db = _WorkRecordDb([signup, None, None])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(SettingsNotFoundError):
        service.classify(
            signup.id,
            WorkRecordClassify(compensation_type=CompensationType.PAYOUT, duration_minutes=60),
            uuid4(),
        )


def test_classify_is_idempotent_for_unchanged_input() -> None:
    signup = _signup()
    existing = _record(
        signup_id=signup.id,
        compensation_type=CompensationType.VOLUNTARY,
        credited_family_member_id=None,
        duration_minutes=None,
        note=None,
    )
    db = _WorkRecordDb([signup, existing])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]

    result = service.classify(
        signup.id, WorkRecordClassify(compensation_type=CompensationType.VOLUNTARY), uuid4()
    )

    assert result is existing
    assert db.commits == 0
    assert db.added == []


def test_classify_switching_away_from_payout_clears_payout_and_signature_fields() -> None:
    signup = _signup()
    existing = _record(
        signup_id=signup.id,
        compensation_type=CompensationType.PAYOUT,
        duration_minutes=60,
        payout_rate_minor_per_hour=900,
        payout_amount_minor=900,
        payout_status=PayoutStatus.OPEN,
        signature_received_at=datetime.now(UTC),
        signature_confirmed_by_user_id=uuid4(),
    )
    db = _WorkRecordDb([signup, existing])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]

    record = service.classify(
        signup.id, WorkRecordClassify(compensation_type=CompensationType.VOLUNTARY), uuid4()
    )

    assert record.payout_rate_minor_per_hour is None
    assert record.payout_amount_minor is None
    assert record.payout_status is None
    assert record.signature_received_at is None
    assert record.signature_confirmed_by_user_id is None


def test_classify_blocked_once_payout_approved_or_paid() -> None:
    signup = _signup()
    for blocked_status in (PayoutStatus.APPROVED, PayoutStatus.PAID):
        existing = _record(
            signup_id=signup.id,
            compensation_type=CompensationType.PAYOUT,
            duration_minutes=60,
            payout_rate_minor_per_hour=900,
            payout_amount_minor=900,
            payout_status=blocked_status,
        )
        db = _WorkRecordDb([signup, existing])
        service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
        with pytest.raises(WorkRecordConflictError, match="approved or paid"):
            service.classify(
                signup.id,
                WorkRecordClassify(compensation_type=CompensationType.VOLUNTARY),
                uuid4(),
            )


def test_get_for_signup_raises_not_found_when_unclassified() -> None:
    signup = _signup()
    db = _WorkRecordDb([signup, None])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordNotFoundError):
        service.get_for_signup(signup.id)


def test_get_for_signup_wrong_tenant_or_missing_signup_raises_not_found() -> None:
    db = _WorkRecordDb([None])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordNotFoundError):
        service.get_for_signup(uuid4())


# -- Payout status transitions ---------------------------------------------------


def test_payout_status_requires_payout_classification() -> None:
    signup = _signup()
    non_payout = _record(signup_id=signup.id, compensation_type=CompensationType.VOLUNTARY)
    db = _WorkRecordDb([signup, non_payout])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordConflictError, match="PAYOUT"):
        service.update_payout_status(
            signup.id, WorkRecordPayoutStatusUpdate(payout_status=PayoutStatus.APPROVED), uuid4()
        )


def test_payout_status_missing_record_is_not_found() -> None:
    signup = _signup()
    db = _WorkRecordDb([signup, None])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordNotFoundError):
        service.update_payout_status(
            signup.id, WorkRecordPayoutStatusUpdate(payout_status=PayoutStatus.APPROVED), uuid4()
        )


@pytest.mark.parametrize(
    ("current", "requested"),
    [
        (PayoutStatus.OPEN, PayoutStatus.PAID),
        (PayoutStatus.APPROVED, PayoutStatus.OPEN),
        (PayoutStatus.PAID, PayoutStatus.OPEN),
    ],
)
def test_payout_status_rejects_invalid_transitions(
    current: PayoutStatus, requested: PayoutStatus
) -> None:
    signup = _signup()
    record = _record(
        signup_id=signup.id,
        compensation_type=CompensationType.PAYOUT,
        payout_status=current,
        duration_minutes=60,
        payout_rate_minor_per_hour=900,
        payout_amount_minor=900,
    )
    db = _WorkRecordDb([signup, record])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(WorkRecordConflictError, match="invalid payout status transition"):
        service.update_payout_status(
            signup.id, WorkRecordPayoutStatusUpdate(payout_status=requested), uuid4()
        )
    assert db.commits == 0


def test_payout_status_advances_and_records_signature_receipt() -> None:
    signup = _signup()
    actor_id = uuid4()
    organization_id = uuid4()
    now = datetime.now(UTC)
    record = _record(
        signup_id=signup.id,
        compensation_type=CompensationType.PAYOUT,
        payout_status=PayoutStatus.OPEN,
        duration_minutes=60,
        payout_rate_minor_per_hour=900,
        payout_amount_minor=900,
    )
    db = _WorkRecordDb([signup, record])
    service = WorkRecordService(cast(object, db), organization_id)  # type: ignore[arg-type]

    updated = service.update_payout_status(
        signup.id,
        WorkRecordPayoutStatusUpdate(payout_status=PayoutStatus.APPROVED),
        actor_id,
        now=now,
    )
    assert updated.payout_status == PayoutStatus.APPROVED
    assert updated.signature_received_at is None
    assert db.commits == 1
    audit = cast(AuditEvent, db.added[-1])
    assert audit.action == "WORK_RECORD_PAYOUT_STATUS_CHANGED"
    assert audit.event_metadata == {
        "previous_payout_status": "OPEN",
        "new_payout_status": "APPROVED",
        "signature_received": False,
    }


def test_payout_status_paid_with_signature_sets_receipt_metadata() -> None:
    signup = _signup()
    actor_id = uuid4()
    now = datetime.now(UTC)
    record = _record(
        signup_id=signup.id,
        compensation_type=CompensationType.PAYOUT,
        payout_status=PayoutStatus.APPROVED,
        duration_minutes=60,
        payout_rate_minor_per_hour=900,
        payout_amount_minor=900,
    )
    db = _WorkRecordDb([signup, record])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]

    updated = service.update_payout_status(
        signup.id,
        WorkRecordPayoutStatusUpdate(payout_status=PayoutStatus.PAID, mark_signature_received=True),
        actor_id,
        now=now,
    )
    assert updated.payout_status == PayoutStatus.PAID
    assert updated.signature_received_at == now
    assert updated.signature_confirmed_by_user_id == actor_id


def test_payout_status_idempotent_repeat_does_not_commit_or_audit() -> None:
    signup = _signup()
    record = _record(
        signup_id=signup.id,
        compensation_type=CompensationType.PAYOUT,
        payout_status=PayoutStatus.OPEN,
        duration_minutes=60,
        payout_rate_minor_per_hour=900,
        payout_amount_minor=900,
    )
    db = _WorkRecordDb([signup, record])
    service = WorkRecordService(cast(object, db), uuid4())  # type: ignore[arg-type]

    result = service.update_payout_status(
        signup.id, WorkRecordPayoutStatusUpdate(payout_status=PayoutStatus.OPEN), uuid4()
    )
    assert result is record
    assert db.commits == 0
    assert db.added == []


# -- API ---------------------------------------------------------------------


def test_work_record_routes_use_manage_or_admin_only_guards() -> None:
    assert callable(planning.manage)
    assert callable(planning.admin_only)


def test_work_record_route_forbidden_for_wrong_tenant_slug(client: TestClient) -> None:
    current = _current(slug="tenant-a")
    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    try:
        response = client.get(f"/api/admin/tenant-b/signups/{uuid4()}/work-record")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_classify_api_passes_actor_and_returns_response(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()
    signup_id = uuid4()
    record = _record(signup_id=signup_id, compensation_type=CompensationType.WORK_HOURS)
    calls: list[tuple[object, object, object]] = []

    class FakeWorkRecordService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def classify(
            self, received_signup_id: object, payload: object, actor_user_id: object
        ) -> object:
            calls.append((received_signup_id, payload, actor_user_id))
            return record

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(planning, "WorkRecordService", FakeWorkRecordService)
    monkeypatch.setattr(planning, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.patch(
            f"/api/admin/tenant-a/signups/{signup_id}/work-record",
            json={"compensation_type": "WORK_HOURS"},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()["compensation_type"] == "WORK_HOURS"
    assert calls[0][0] == signup_id
    assert calls[0][2] == current.user.id


def test_payout_status_api_requires_admin_only_guard(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    signup_id = uuid4()
    record = _record(signup_id=signup_id, compensation_type=CompensationType.PAYOUT)

    class FakeWorkRecordService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def update_payout_status(self, *_args: object, **_kwargs: object) -> object:
            return record

    current = _current()
    app.dependency_overrides[planning.admin_only] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(planning, "WorkRecordService", FakeWorkRecordService)
    monkeypatch.setattr(planning, "_ensure_origin_and_host", lambda *_args: None)
    try:
        response = client.patch(
            f"/api/admin/tenant-a/signups/{signup_id}/work-record/payout-status",
            json={"payout_status": "APPROVED"},
        )
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200


def test_get_work_record_not_found_returns_404(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    current = _current()

    class FakeWorkRecordService:
        def __init__(self, _db: object, _organization_id: object) -> None:
            pass

        def get_for_signup(self, _signup_id: object) -> object:
            raise WorkRecordNotFoundError

    app.dependency_overrides[planning.manage] = lambda: current
    app.dependency_overrides[get_db] = lambda: object()
    monkeypatch.setattr(planning, "WorkRecordService", FakeWorkRecordService)
    try:
        response = client.get(f"/api/admin/tenant-a/signups/{uuid4()}/work-record")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 404
