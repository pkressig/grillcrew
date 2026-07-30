"""Organization settings, home-venue allowlist, and crew-size rule tests."""

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import dependencies
from app.api import settings as settings_api
from app.api.dependencies import CurrentStaffMembership
from app.db.session import get_db
from app.main import app
from app.models.identity import StaffMembership, StaffRole, User
from app.models.organization import (
    CrewSizeRule,
    HomeVenue,
    MenuType,
    Organization,
    OrganizationSettings,
)
from app.schemas.settings import (
    CrewSizeRuleCreate,
    CrewSizeRuleUpdate,
    HomeVenueCreate,
    HomeVenueUpdate,
    OrganizationSettingsUpdate,
)
from app.services.settings import (
    SettingsConflictError,
    SettingsNotFoundError,
    SettingsService,
    SettingsValidationError,
    normalize_venue_name,
)


def _current(role: StaffRole, slug: str = "tenant-a") -> CurrentStaffMembership:
    organization = cast(Organization, SimpleNamespace(id=uuid4(), slug=slug))
    return CurrentStaffMembership(
        organization=organization,
        user=cast(User, SimpleNamespace(id=uuid4())),
        membership=cast(StaffMembership, SimpleNamespace(role=role)),
    )


class _FakeDb:
    def __init__(
        self,
        scalar_results: list[object] | None = None,
        scalars_results: list[list[object]] | None = None,
    ) -> None:
        self._scalar_results = list(scalar_results or [])
        self._scalars_results = list(scalars_results or [])
        self.added: list[object] = []
        self.commits = 0
        self.refreshes = 0

    def scalar(self, _statement: object) -> object:
        return self._scalar_results.pop(0) if self._scalar_results else None

    def scalars(self, _statement: object) -> list[object]:
        return self._scalars_results.pop(0) if self._scalars_results else []

    def add(self, item: object) -> None:
        self.added.append(item)

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, item: OrganizationSettings | HomeVenue | CrewSizeRule) -> None:
        self.refreshes += 1
        if getattr(item, "id", None) is None:
            item.id = uuid4()
        now = datetime.now(UTC)
        if getattr(item, "created_at", None) is None:
            item.created_at = now
        item.updated_at = now


# -- Role guard --------------------------------------------------------------


@pytest.mark.parametrize("role", [StaffRole.ADMIN])
def test_settings_manage_allows_admin(role: StaffRole) -> None:
    current = _current(role)
    assert settings_api.manage(current) is current


@pytest.mark.parametrize(
    "role", [StaffRole.KOORDINATION, StaffRole.KIOSK, StaffRole.VORSTAND_LESEN]
)
def test_settings_manage_denies_non_admin_roles(role: StaffRole) -> None:
    with pytest.raises(HTTPException) as error:
        settings_api.manage(_current(role))
    assert error.value.status_code == 403


# -- Schema validation ---------------------------------------------------------


def test_organization_settings_update_rejects_null_required_fields() -> None:
    OrganizationSettingsUpdate(payout_rate_minor_per_hour=1000)
    with pytest.raises(ValidationError):
        OrganizationSettingsUpdate.model_validate({"payout_rate_minor_per_hour": None})


def test_home_venue_create_trims_name() -> None:
    payload = HomeVenueCreate(name="  Cazis / St. Martin  ")
    assert payload.name == "Cazis / St. Martin"
    with pytest.raises(ValidationError):
        HomeVenueCreate(name="   ")


def test_home_venue_update_rejects_null_is_active() -> None:
    HomeVenueUpdate(is_active=False)
    with pytest.raises(ValidationError):
        HomeVenueUpdate.model_validate({"is_active": None})


def test_crew_size_rule_create_defaults_min_games_to_one() -> None:
    payload = CrewSizeRuleCreate(
        pattern="Junioren", menu_type=MenuType.FRIES_NUGGETS, required_griller_count=1
    )
    assert payload.min_games_per_shift == 1
    with pytest.raises(ValidationError):
        CrewSizeRuleCreate(pattern="x", menu_type=MenuType.FRIES_NUGGETS, required_griller_count=0)


def test_crew_size_rule_update_rejects_null_required_fields() -> None:
    with pytest.raises(ValidationError):
        CrewSizeRuleUpdate.model_validate({"is_active": None})


# -- Service: normalization ----------------------------------------------------


def test_normalize_venue_name_collapses_whitespace_and_case() -> None:
    assert normalize_venue_name("  Cazis   /  St.   Martin ") == "cazis / st. martin"
    assert normalize_venue_name("CAZIS / ST. MARTIN") == normalize_venue_name("Cazis / St. Martin")


# -- Service: organization settings --------------------------------------------


def test_get_organization_settings_raises_when_missing() -> None:
    service = SettingsService(cast(object, _FakeDb(scalar_results=[None])), uuid4())  # type: ignore[arg-type]
    with pytest.raises(SettingsNotFoundError):
        service.get_organization_settings()


def test_update_organization_settings_only_applies_provided_fields() -> None:
    existing = cast(
        OrganizationSettings,
        SimpleNamespace(
            id=uuid4(),
            organization_id=uuid4(),
            payout_rate_minor_per_hour=900,
            signup_rate_limit_per_contact=5,
            signup_rate_limit_window_minutes=60,
            coordination_contact_label=None,
        ),
    )
    db = _FakeDb(scalar_results=[existing])
    service = SettingsService(cast(object, db), existing.organization_id)  # type: ignore[arg-type]
    result = service.update_organization_settings(
        OrganizationSettingsUpdate(payout_rate_minor_per_hour=1000)
    )
    assert result.payout_rate_minor_per_hour == 1000
    assert result.signup_rate_limit_per_contact == 5
    assert db.commits == 1


# -- Service: home venues -------------------------------------------------------


def test_create_home_venue_creates_new_when_no_match() -> None:
    organization_id = uuid4()
    db = _FakeDb(scalar_results=[None])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    venue = service.create_home_venue(HomeVenueCreate(name="Cazis / St. Martin"))
    assert venue.organization_id == organization_id
    assert venue.name_normalized == "cazis / st. martin"
    assert venue.is_active is True
    assert db.commits == 1


def test_create_home_venue_reactivates_existing_inactive_match() -> None:
    organization_id = uuid4()
    existing = HomeVenue(
        organization_id=organization_id,
        name="Cazis",
        name_normalized="cazis",
        is_active=False,
    )
    db = _FakeDb(scalar_results=[existing])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    result = service.create_home_venue(HomeVenueCreate(name="Cazis"))
    assert result is existing
    assert result.is_active is True
    assert db.added == []


def test_update_home_venue_raises_not_found() -> None:
    service = SettingsService(cast(object, _FakeDb(scalar_results=[None])), uuid4())  # type: ignore[arg-type]
    with pytest.raises(SettingsNotFoundError):
        service.update_home_venue(uuid4(), HomeVenueUpdate(name="Thusis"))


def test_update_home_venue_raises_conflict_on_duplicate_name() -> None:
    organization_id = uuid4()
    venue = HomeVenue(
        id=uuid4(), organization_id=organization_id, name="Cazis", name_normalized="cazis"
    )
    other = HomeVenue(
        id=uuid4(), organization_id=organization_id, name="Thusis", name_normalized="thusis"
    )
    db = _FakeDb(scalar_results=[venue, other])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    with pytest.raises(SettingsConflictError):
        service.update_home_venue(venue.id, HomeVenueUpdate(name="Thusis"))


# -- Service: crew-size rules ---------------------------------------------------


def test_ensure_catchall_creates_default_when_missing() -> None:
    organization_id = uuid4()
    db = _FakeDb(scalar_results=[None])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    catchall = service._ensure_catchall_rule()
    assert catchall.pattern is None
    assert catchall.organization_id == organization_id
    assert db.commits == 1


def test_ordered_rules_always_places_catchall_last_regardless_of_sort_order() -> None:
    organization_id = uuid4()
    catchall = CrewSizeRule(
        organization_id=organization_id,
        sort_order=0,
        pattern=None,
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    named = CrewSizeRule(
        organization_id=organization_id,
        sort_order=5,
        pattern="Junioren",
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    db = _FakeDb(scalars_results=[[named, catchall]])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    ordered = service._ordered_rules()
    assert ordered == [named, catchall]


def test_update_crew_size_rule_forbids_clearing_pattern_on_normal_rule() -> None:
    organization_id = uuid4()
    rule = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=0,
        pattern="Junioren",
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    db = _FakeDb(scalar_results=[rule])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    with pytest.raises(SettingsValidationError):
        service.update_crew_size_rule(rule.id, CrewSizeRuleUpdate(pattern=None))


def test_update_crew_size_rule_forbids_setting_pattern_on_catchall() -> None:
    organization_id = uuid4()
    catchall = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=0,
        pattern=None,
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    db = _FakeDb(scalar_results=[catchall])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    with pytest.raises(SettingsValidationError):
        service.update_crew_size_rule(catchall.id, CrewSizeRuleUpdate(pattern="Herren"))


def test_update_crew_size_rule_forbids_deactivating_catchall() -> None:
    organization_id = uuid4()
    catchall = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=0,
        pattern=None,
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    db = _FakeDb(scalar_results=[catchall])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    with pytest.raises(SettingsValidationError):
        service.update_crew_size_rule(catchall.id, CrewSizeRuleUpdate(is_active=False))


def test_reorder_crew_size_rules_rejects_mismatched_id_set() -> None:
    organization_id = uuid4()
    rule = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=0,
        pattern="Junioren",
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    catchall = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=1,
        pattern=None,
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    db = _FakeDb(scalar_results=[catchall], scalars_results=[[rule]])
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    with pytest.raises(SettingsValidationError):
        service.reorder_crew_size_rules([uuid4()])


def test_reorder_crew_size_rules_assigns_sequential_sort_order() -> None:
    organization_id = uuid4()
    catchall = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=0,
        pattern=None,
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    rule_a = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=3,
        pattern="A",
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    rule_b = CrewSizeRule(
        id=uuid4(),
        organization_id=organization_id,
        sort_order=1,
        pattern="B",
        menu_type=MenuType.FRIES_NUGGETS,
        required_griller_count=1,
        min_games_per_shift=1,
    )
    db = _FakeDb(
        scalar_results=[catchall],
        scalars_results=[[rule_a, rule_b], [rule_b, rule_a, catchall]],
    )
    service = SettingsService(cast(object, db), organization_id)  # type: ignore[arg-type]
    result = service.reorder_crew_size_rules([rule_b.id, rule_a.id])
    assert rule_b.sort_order == 0
    assert rule_a.sort_order == 1
    assert result == [rule_b, rule_a, catchall]


# -- API: tenant isolation -------------------------------------------------------


def test_wrong_organization_slug_is_forbidden(client: TestClient) -> None:
    app.dependency_overrides[settings_api.manage] = lambda: _current(StaffRole.ADMIN)
    app.dependency_overrides[get_db] = lambda: _FakeDb()
    try:
        response = client.get("/api/admin/tenant-b/settings/home-venues")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_list_home_venues_returns_admin_fields(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization_id = uuid4()
    now = datetime.now(UTC)
    item = SimpleNamespace(
        id=uuid4(),
        organization_id=organization_id,
        name="Cazis / St. Martin",
        name_normalized="cazis / st. martin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )

    class FakeService:
        def __init__(self, _db: object, received_organization_id: UUID) -> None:
            assert received_organization_id == organization_id

        def list_home_venues(self) -> list[object]:
            return [item]

    current = _current(StaffRole.ADMIN)
    current.organization.id = organization_id
    app.dependency_overrides[settings_api.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _FakeDb()
    monkeypatch.setattr(settings_api, "SettingsService", FakeService)
    try:
        response = client.get("/api/admin/tenant-a/settings/home-venues")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    assert response.json()[0]["name"] == "Cazis / St. Martin"
