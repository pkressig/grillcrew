"""Game-plan import service, schema, and API tests."""

import asyncio
import io
from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from typing import cast
from uuid import UUID, uuid4

import openpyxl
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.testclient import TestClient

from app.api import dependencies
from app.api import imports as imports_api
from app.api.dependencies import CurrentStaffMembership
from app.db.session import get_db
from app.main import app
from app.models.identity import StaffMembership, StaffRole, User
from app.models.organization import Organization
from app.models.planning import (
    ClubYear,
    Event,
    EventStatus,
    GrillShiftDecision,
    ImportBatch,
    ImportBatchStatus,
    ImportRow,
    ImportRowClassification,
    ImportRowDecision,
    PlanningStatus,
    Season,
    SeasonType,
    SpielTyp,
)
from app.schemas.imports import ImportRowUpdate
from app.services.game_plan_parser import ParsedRow
from app.services.imports import (
    ImportConflictError,
    ImportNotFoundError,
    ImportService,
    ImportValidationError,
    _dated_note,
    _match_key,
    _matches_home_venue,
)

HEADERS = [
    "SpielTyp",
    "Bezeichnung",
    "Spielnummer",
    "TagKurz",
    "Spieldatum",
    "Spielzeit",
    "Teams",
    "Spielort",
    "Bemerkung",
]


def _workbook_bytes(rows: list[list[object]], sheet_tab: str = "HR 2026 2027") -> bytes:
    workbook = openpyxl.Workbook()
    worksheet = workbook.active
    worksheet.title = sheet_tab
    worksheet.append(HEADERS)
    for row in rows:
        worksheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


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
        get_results: list[object] | None = None,
    ) -> None:
        self._scalar_results = list(scalar_results or [])
        self._scalars_results = list(scalars_results or [])
        self._get_results = list(get_results or [])
        self.added: list[object] = []
        self.commits = 0
        self.flushes = 0

    def scalar(self, _statement: object) -> object:
        return self._scalar_results.pop(0) if self._scalar_results else None

    def scalars(self, _statement: object) -> list[object]:
        return self._scalars_results.pop(0) if self._scalars_results else []

    def get(self, _model: object, _id: object) -> object:
        return self._get_results.pop(0) if self._get_results else None

    def add(self, item: object) -> None:
        self.added.append(item)

    def flush(self) -> None:
        self.flushes += 1

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, item: ImportBatch | ImportRow | Event) -> None:
        if getattr(item, "id", None) is None:
            item.id = uuid4()


# -- Role guard ----------------------------------------------------------------


def test_imports_manage_allows_admin() -> None:
    current = _current(StaffRole.ADMIN)
    assert imports_api.manage(current) is current


@pytest.mark.parametrize(
    "role", [StaffRole.KOORDINATION, StaffRole.KIOSK, StaffRole.VORSTAND_LESEN]
)
def test_imports_manage_denies_non_admin_roles(role: StaffRole) -> None:
    with pytest.raises(HTTPException) as error:
        imports_api.manage(_current(role))
    assert error.value.status_code == 403


# -- Pure helpers ----------------------------------------------------------------


def test_match_key_prefers_spielnummer() -> None:
    assert _match_key("119550", "A - B", date(2026, 8, 15)) == "SN:119550"


def test_match_key_falls_back_to_teams_and_date() -> None:
    key = _match_key(None, "  FC A  -  FC B ", date(2026, 8, 15))
    assert key == "TD:fc a - fc b|2026-08-15"


def test_dated_note_includes_iso_date_and_remark() -> None:
    note = _dated_note("Verschiebung möglich", datetime(2026, 7, 31, tzinfo=UTC))
    assert note == "[Import 2026-07-31] Bemerkung: Verschiebung möglich"


def test_upload_reader_accepts_normal_season_plan() -> None:
    content = _workbook_bytes([])
    upload = UploadFile(filename="plan.xlsx", file=io.BytesIO(content))

    assert asyncio.run(imports_api._read_upload_content(upload)) == content


def test_upload_reader_rejects_file_over_byte_limit() -> None:
    content = b"x" * (imports_api.MAX_IMPORT_UPLOAD_BYTES + 1)
    upload = UploadFile(filename="plan.xlsx", file=io.BytesIO(content))

    with pytest.raises(ImportValidationError, match="maximal 10 MiB"):
        asyncio.run(imports_api._read_upload_content(upload))


# -- _build_row classification --------------------------------------------------


def _parsed_row(**overrides: object) -> ParsedRow:
    defaults: dict[str, object] = {
        "sheet_tab": "HR 2026 2027",
        "spiel_typ": SpielTyp.MEISTERSCHAFT,
        "bezeichnung": "FCTC Herren 1",
        "spielnummer": "119550",
        "weekday_short": "Sa",
        "game_date": date(2026, 8, 15),
        "game_time": time(17, 0),
        "teams": "FC Thusis/Cazis 1 - FC Lusitanos",
        "venue": "St. Martin, Cazis - Platz 1",
        "remark": None,
    }
    defaults.update(overrides)
    return ParsedRow(**defaults)  # type: ignore[arg-type]


def _season(season_type: SeasonType = SeasonType.AUTUMN) -> Season:
    return Season(
        id=uuid4(),
        club_year_id=uuid4(),
        type=season_type,
        name="Herbst 2026",
        start_date=date(2026, 7, 1),
        end_date=date(2026, 12, 31),
        status=PlanningStatus.ACTIVE,
    )


def _existing_event(**overrides: object) -> Event:
    defaults: dict[str, object] = {
        "id": uuid4(),
        "season_id": uuid4(),
        "title": "FCTC Herren 1",
        "date": date(2026, 8, 15),
        "location": "St. Martin, Cazis - Platz 1",
        "event_type": "Meisterschaft",
        "public_description": "FC Thusis/Cazis 1 - FC Lusitanos",
        "status": EventStatus.DRAFT,
        "kickoff_time": time(17, 0),
        "external_game_number": "119550",
        "import_match_key": "SN:119550",
    }
    defaults.update(overrides)
    return Event(**defaults)


def test_build_row_classifies_neu_when_no_existing_match() -> None:
    service = ImportService(cast(object, _FakeDb()), uuid4())  # type: ignore[arg-type]
    row = service._build_row(_parsed_row(), _season(), "SN:119550", {}, set())
    assert row.classification == ImportRowClassification.NEU
    assert row.matched_event_id is None
    assert row.include_decision == ImportRowDecision.EXCLUDE


def test_build_row_includes_when_venue_is_an_active_home_venue() -> None:
    service = ImportService(cast(object, _FakeDb()), uuid4())  # type: ignore[arg-type]
    row = service._build_row(
        _parsed_row(), _season(), "SN:119550", {}, {"st. martin, cazis - platz 1"}
    )
    assert row.include_decision == ImportRowDecision.INCLUDE
    assert row.is_home_venue is True


@pytest.mark.parametrize(
    ("pattern", "venue"),
    [
        ("Cazis", "cazis"),
        ("Cazis*", "Cazis Platz 1"),
        ("*Cazis", "St. Martin, Cazis"),
        ("*Cazis*", "St. Martin, Cazis - Platz 1"),
        ("St.*Cazis*1", "St. Martin, Cazis - Platz 1"),
        ("  *CAZIS*  ", "  St. Martin,   Cazis - Platz 1  "),
    ],
)
def test_home_venue_patterns_match_exact_and_explicit_wildcards(pattern: str, venue: str) -> None:
    assert _matches_home_venue(venue, {pattern}) is True


@pytest.mark.parametrize(
    ("pattern", "venue"),
    [
        ("Cazis", "St. Martin, Cazis - Platz 1"),
        ("Cazis*", "St. Martin, Cazis"),
        ("*Cazis", "Cazis - Platz 1"),
        ("St.[Martin]", "St. M"),
        ("", "Cazis"),
        ("   ", "Cazis"),
        ("*Cazis*", "Thusis"),
    ],
)
def test_home_venue_patterns_do_not_fuzzily_or_regex_match(pattern: str, venue: str) -> None:
    assert _matches_home_venue(venue, {pattern}) is False


def test_home_venue_pattern_matching_ignores_invalid_entries_but_uses_valid_entries() -> None:
    assert _matches_home_venue("Cazis", {"", "   ", "Cazis"}) is True
    assert _matches_home_venue("", {"*"}) is False


def test_build_row_classifies_verschoben_on_date_change() -> None:
    existing = _existing_event(date=date(2026, 8, 22))
    service = ImportService(cast(object, _FakeDb()), uuid4())  # type: ignore[arg-type]
    row = service._build_row(_parsed_row(), _season(), "SN:119550", {"SN:119550": existing}, set())
    assert row.classification == ImportRowClassification.VERSCHOBEN
    assert row.matched_event_id == existing.id
    diff_details = row.diff_details
    assert diff_details is not None
    game_date_diff = cast(dict[str, object], diff_details["game_date"])
    assert game_date_diff["old"] == "2026-08-22"


def test_build_row_classifies_geaendert_on_venue_change() -> None:
    existing = _existing_event(location="Altes Stadion")
    service = ImportService(cast(object, _FakeDb()), uuid4())  # type: ignore[arg-type]
    row = service._build_row(_parsed_row(), _season(), "SN:119550", {"SN:119550": existing}, set())
    assert row.classification == ImportRowClassification.GEAENDERT
    assert row.diff_details == {
        "venue": {"old": "Altes Stadion", "new": "St. Martin, Cazis - Platz 1"}
    }


def test_build_row_classifies_unveraendert_when_nothing_differs() -> None:
    existing = _existing_event()
    service = ImportService(cast(object, _FakeDb()), uuid4())  # type: ignore[arg-type]
    row = service._build_row(_parsed_row(), _season(), "SN:119550", {"SN:119550": existing}, set())
    assert row.classification == ImportRowClassification.UNVERAENDERT
    assert row.diff_details is None


def test_build_removed_rows_synthesizes_entfernt_for_missing_keys() -> None:
    existing = _existing_event()
    service = ImportService(cast(object, _FakeDb()), uuid4())  # type: ignore[arg-type]
    removed = service._build_removed_rows({"SN:119550": existing}, [], set())
    assert len(removed) == 1
    assert removed[0].classification == ImportRowClassification.ENTFERNT
    assert removed[0].matched_event_id == existing.id


def test_build_removed_rows_skips_keys_still_present() -> None:
    existing = _existing_event()
    service = ImportService(cast(object, _FakeDb()), uuid4())  # type: ignore[arg-type]
    removed = service._build_removed_rows({"SN:119550": existing}, ["SN:119550"], set())
    assert removed == []


# -- create_batch orchestration --------------------------------------------------


def test_create_batch_raises_when_club_year_not_found() -> None:
    db = _FakeDb(scalar_results=[None])
    service = ImportService(cast(object, db), uuid4())  # type: ignore[arg-type]
    with pytest.raises(ImportNotFoundError):
        service.create_batch(uuid4(), "plan.xlsx", _workbook_bytes([]), uuid4())


@pytest.mark.parametrize("status", [PlanningStatus.CLOSED, PlanningStatus.ARCHIVED])
def test_create_batch_rejects_retired_club_year(status: PlanningStatus) -> None:
    club_year = ClubYear(
        id=uuid4(),
        organization_id=uuid4(),
        label="2026/2027",
        start_date=date(2026, 7, 1),
        end_date=date(2027, 6, 30),
        status=status,
    )
    service = ImportService(
        cast(object, _FakeDb(scalar_results=[club_year])),  # type: ignore[arg-type]
        club_year.organization_id,
    )
    with pytest.raises(ImportConflictError, match="kein neuer Import"):
        service.create_batch(club_year.id, "plan.xlsx", _workbook_bytes([]), uuid4())


def test_create_batch_raises_when_season_type_missing() -> None:
    content = _workbook_bytes(
        [
            [
                "Cup",
                "Cup Spiel",
                "Ohne",
                "Sa",
                date(2026, 8, 8),
                time(17, 0),
                "A - B",
                "St. Martin, Cazis",
                None,
            ]
        ]
    )
    club_year = ClubYear(
        id=uuid4(),
        organization_id=uuid4(),
        label="2026/2027",
        start_date=date(2026, 7, 1),
        end_date=date(2027, 6, 30),
        status=PlanningStatus.ACTIVE,
    )
    db = _FakeDb(scalar_results=[club_year, None])
    service = ImportService(cast(object, db), club_year.organization_id)  # type: ignore[arg-type]
    with pytest.raises(ImportValidationError):
        service.create_batch(club_year.id, "plan.xlsx", content, uuid4())


def test_create_batch_raises_on_duplicate_match_key_within_batch() -> None:
    row = [
        "Testspiel",
        "Testspiel",
        "Ohne",
        "Sa",
        date(2026, 8, 8),
        time(17, 0),
        "A - B",
        "St. Martin, Cazis",
        None,
    ]
    content = _workbook_bytes([row, row])
    club_year = ClubYear(
        id=uuid4(),
        organization_id=uuid4(),
        label="2026/2027",
        start_date=date(2026, 7, 1),
        end_date=date(2027, 6, 30),
        status=PlanningStatus.ACTIVE,
    )
    season = _season(SeasonType.AUTUMN)
    db = _FakeDb(scalar_results=[club_year, season], scalars_results=[[], []])
    service = ImportService(cast(object, db), club_year.organization_id)  # type: ignore[arg-type]
    with pytest.raises(ImportValidationError):
        service.create_batch(club_year.id, "plan.xlsx", content, uuid4())


def test_create_batch_stages_neu_rows_excluded_without_home_venue() -> None:
    content = _workbook_bytes(
        [
            [
                "Meisterschaft",
                "FCTC Herren 1",
                119550,
                "Sa",
                date(2026, 8, 15),
                time(17, 0),
                "FC Thusis/Cazis 1 - FC Lusitanos",
                "St. Martin, Cazis - Platz 1",
                None,
            ]
        ]
    )
    club_year = ClubYear(
        id=uuid4(),
        organization_id=uuid4(),
        label="2026/2027",
        start_date=date(2026, 7, 1),
        end_date=date(2027, 6, 30),
        status=PlanningStatus.ACTIVE,
    )
    season = _season(SeasonType.AUTUMN)
    db = _FakeDb(scalar_results=[club_year, season], scalars_results=[[], []])
    service = ImportService(cast(object, db), club_year.organization_id)  # type: ignore[arg-type]
    batch = service.create_batch(club_year.id, "plan.xlsx", content, uuid4())
    assert batch.row_count == 1
    assert batch.status == ImportBatchStatus.STAGED
    assert db.commits == 1
    created_row = next(item for item in db.added if isinstance(item, ImportRow))
    assert created_row.classification == ImportRowClassification.NEU
    assert created_row.include_decision == ImportRowDecision.EXCLUDE


# -- confirm orchestration --------------------------------------------------------


def test_confirm_raises_when_batch_not_staged() -> None:
    batch = ImportBatch(
        id=uuid4(),
        organization_id=uuid4(),
        club_year_id=uuid4(),
        source_filename="plan.xlsx",
        uploaded_by_user_id=uuid4(),
        status=ImportBatchStatus.CONFIRMED,
    )
    db = _FakeDb(scalar_results=[batch])
    service = ImportService(cast(object, db), batch.organization_id)  # type: ignore[arg-type]
    with pytest.raises(ImportConflictError):
        service.confirm(batch.id, uuid4())


def test_confirm_creates_event_for_neu_and_updates_event_for_geaendert() -> None:
    organization_id = uuid4()
    season = _season(SeasonType.AUTUMN)
    batch = ImportBatch(
        id=uuid4(),
        organization_id=organization_id,
        club_year_id=uuid4(),
        source_filename="plan.xlsx",
        uploaded_by_user_id=uuid4(),
        status=ImportBatchStatus.STAGED,
    )
    neu_row = ImportRow(
        id=uuid4(),
        import_batch_id=batch.id,
        season_id=season.id,
        sheet_tab="HR 2026 2027",
        spiel_typ=SpielTyp.MEISTERSCHAFT,
        bezeichnung="FCTC Herren 1",
        spielnummer="119550",
        weekday_short="Sa",
        game_date=date(2026, 8, 15),
        game_time=time(17, 0),
        teams="FC Thusis/Cazis 1 - FC Lusitanos",
        venue="St. Martin, Cazis - Platz 1",
        venue_normalized="st. martin, cazis - platz 1",
        remark="Bitte pünktlich",
        is_home_venue=True,
        classification=ImportRowClassification.NEU,
        matched_event_id=None,
        include_decision=ImportRowDecision.INCLUDE,
        grill_shift_decision=GrillShiftDecision.PENDING,
    )
    existing_event = _existing_event(location="Altes Stadion")
    geaendert_row = ImportRow(
        id=uuid4(),
        import_batch_id=batch.id,
        season_id=season.id,
        sheet_tab="HR 2026 2027",
        spiel_typ=SpielTyp.MEISTERSCHAFT,
        bezeichnung="FCTC Herren 2",
        spielnummer="119551",
        weekday_short="Sa",
        game_date=existing_event.date,
        game_time=existing_event.kickoff_time,
        teams="FC Thusis/Cazis 2 - FC X",
        venue="St. Martin, Cazis - Platz 2",
        venue_normalized="st. martin, cazis - platz 2",
        remark="Neuer Platz",
        is_home_venue=True,
        classification=ImportRowClassification.GEAENDERT,
        matched_event_id=existing_event.id,
        diff_details={
            "venue": {"old": "Altes Stadion", "new": "St. Martin, Cazis - Platz 2"},
            "teams": {
                "old": "FC Thusis/Cazis 1 - FC Lusitanos",
                "new": "FC Thusis/Cazis 2 - FC X",
            },
        },
        include_decision=ImportRowDecision.INCLUDE,
        grill_shift_decision=GrillShiftDecision.PENDING,
    )
    verschoben_row = ImportRow(
        id=uuid4(),
        import_batch_id=batch.id,
        season_id=season.id,
        sheet_tab="HR 2026 2027",
        spiel_typ=SpielTyp.CUP,
        bezeichnung="Cup-Verschiebung",
        spielnummer="119552",
        weekday_short="Sa",
        game_date=date(2026, 9, 1),
        game_time=time(18, 0),
        teams="FC Y - FC Z",
        venue="St. Martin, Cazis - Platz 1",
        venue_normalized="st. martin, cazis - platz 1",
        remark=None,
        is_home_venue=True,
        classification=ImportRowClassification.VERSCHOBEN,
        matched_event_id=uuid4(),
        include_decision=ImportRowDecision.INCLUDE,
        grill_shift_decision=GrillShiftDecision.PENDING,
    )

    db = _FakeDb(
        scalar_results=[batch],
        scalars_results=[[neu_row, geaendert_row, verschoben_row]],
        get_results=[existing_event],
    )
    service = ImportService(cast(object, db), organization_id)  # type: ignore[arg-type]
    confirmed_batch, rows = service.confirm(batch.id, uuid4())

    assert confirmed_batch.status == ImportBatchStatus.CONFIRMED
    assert confirmed_batch.confirmed_at is not None
    created_event = next(item for item in db.added if isinstance(item, Event))
    assert created_event.title == "FCTC Herren 1"
    assert created_event.source_import_id == batch.id
    assert created_event.internal_note is not None
    assert created_event.internal_note.startswith("[Import ")
    assert created_event.internal_note.endswith("Bemerkung: Bitte pünktlich")
    assert existing_event.location == "St. Martin, Cazis - Platz 2"
    assert existing_event.public_description == "FC Thusis/Cazis 2 - FC X"
    assert existing_event.event_type == "Meisterschaft"
    assert existing_event.internal_note is not None
    assert existing_event.internal_note.endswith("Bemerkung: Neuer Platz")
    assert all(row.applied_at is not None for row in rows)
    assert neu_row.matched_event_id == created_event.id


def test_apply_geaendert_preserves_public_description_when_teams_are_unchanged() -> None:
    existing_event = _existing_event(public_description="Redaktioneller Spieltext")
    row = ImportRow(
        id=uuid4(),
        import_batch_id=uuid4(),
        season_id=existing_event.season_id,
        sheet_tab="HR 2026 2027",
        spiel_typ=SpielTyp.MEISTERSCHAFT,
        game_date=existing_event.date,
        teams="FC Thusis/Cazis 1 - FC Lusitanos",
        venue="Neues Stadion",
        venue_normalized="neues stadion",
        is_home_venue=True,
        classification=ImportRowClassification.GEAENDERT,
        matched_event_id=existing_event.id,
        diff_details={"venue": {"old": existing_event.location, "new": "Neues Stadion"}},
        include_decision=ImportRowDecision.INCLUDE,
        grill_shift_decision=GrillShiftDecision.PENDING,
    )
    db = _FakeDb(get_results=[existing_event])
    service = ImportService(cast(object, db), uuid4())  # type: ignore[arg-type]

    service._apply_geaendert(row, datetime(2026, 7, 31, tzinfo=UTC))

    assert existing_event.public_description == "Redaktioneller Spieltext"


# -- update_row_decision ----------------------------------------------------------


def test_update_row_decision_raises_when_batch_not_staged() -> None:
    batch = ImportBatch(
        id=uuid4(),
        organization_id=uuid4(),
        club_year_id=uuid4(),
        source_filename="plan.xlsx",
        uploaded_by_user_id=uuid4(),
        status=ImportBatchStatus.CONFIRMED,
    )
    db = _FakeDb(scalar_results=[batch])
    service = ImportService(cast(object, db), batch.organization_id)  # type: ignore[arg-type]
    with pytest.raises(ImportConflictError):
        service.update_row_decision(batch.id, uuid4(), ImportRowUpdate())


def test_update_row_decision_rejects_acknowledge_on_non_verschoben_row() -> None:
    batch = ImportBatch(
        id=uuid4(),
        organization_id=uuid4(),
        club_year_id=uuid4(),
        source_filename="plan.xlsx",
        uploaded_by_user_id=uuid4(),
        status=ImportBatchStatus.STAGED,
    )
    row = ImportRow(
        id=uuid4(),
        import_batch_id=batch.id,
        season_id=uuid4(),
        sheet_tab="HR 2026 2027",
        spiel_typ=SpielTyp.CUP,
        game_date=date(2026, 8, 8),
        teams="A - B",
        venue="St. Martin, Cazis",
        venue_normalized="st. martin, cazis",
        is_home_venue=True,
        classification=ImportRowClassification.NEU,
        include_decision=ImportRowDecision.INCLUDE,
        grill_shift_decision=GrillShiftDecision.PENDING,
    )
    db = _FakeDb(scalar_results=[batch, row])
    service = ImportService(cast(object, db), batch.organization_id)  # type: ignore[arg-type]
    with pytest.raises(ImportValidationError):
        service.update_row_decision(batch.id, row.id, ImportRowUpdate(acknowledge_verschoben=True))


def test_update_row_decision_applies_requested_changes() -> None:
    batch = ImportBatch(
        id=uuid4(),
        organization_id=uuid4(),
        club_year_id=uuid4(),
        source_filename="plan.xlsx",
        uploaded_by_user_id=uuid4(),
        status=ImportBatchStatus.STAGED,
    )
    row = ImportRow(
        id=uuid4(),
        import_batch_id=batch.id,
        season_id=uuid4(),
        sheet_tab="HR 2026 2027",
        spiel_typ=SpielTyp.CUP,
        game_date=date(2026, 8, 8),
        teams="A - B",
        venue="St. Martin, Cazis",
        venue_normalized="st. martin, cazis",
        is_home_venue=False,
        classification=ImportRowClassification.VERSCHOBEN,
        include_decision=ImportRowDecision.EXCLUDE,
        grill_shift_decision=GrillShiftDecision.PENDING,
    )
    db = _FakeDb(scalar_results=[batch, row])
    service = ImportService(cast(object, db), batch.organization_id)  # type: ignore[arg-type]
    updated = service.update_row_decision(
        batch.id,
        row.id,
        ImportRowUpdate(
            include_decision=ImportRowDecision.INCLUDE,
            grill_shift_decision=GrillShiftDecision.CREATE_SHIFT,
            acknowledge_verschoben=True,
        ),
    )
    assert updated.include_decision == ImportRowDecision.INCLUDE
    assert updated.grill_shift_decision == GrillShiftDecision.CREATE_SHIFT
    assert updated.verschoben_acknowledged_at is not None
    assert db.commits == 1


# -- API: tenant isolation --------------------------------------------------------


def test_wrong_organization_slug_is_forbidden(client: TestClient) -> None:
    app.dependency_overrides[imports_api.manage] = lambda: _current(StaffRole.ADMIN)
    app.dependency_overrides[get_db] = lambda: _FakeDb()
    try:
        response = client.get(f"/api/admin/tenant-b/imports/{uuid4()}/rows")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 403


def test_get_import_rows_returns_batch_and_rows(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    organization_id = uuid4()
    now = datetime.now(UTC)
    batch = SimpleNamespace(
        id=uuid4(),
        organization_id=organization_id,
        club_year_id=uuid4(),
        source_filename="plan.xlsx",
        uploaded_by_user_id=uuid4(),
        status=ImportBatchStatus.STAGED,
        uploaded_at=now,
        confirmed_at=None,
        confirmed_by_user_id=None,
        row_count=1,
        created_at=now,
        updated_at=now,
    )
    row = SimpleNamespace(
        id=uuid4(),
        import_batch_id=batch.id,
        season_id=uuid4(),
        sheet_tab="HR 2026 2027",
        spiel_typ=SpielTyp.CUP,
        bezeichnung="Cup Spiel",
        spielnummer=None,
        weekday_short="Sa",
        game_date=date(2026, 8, 8),
        game_time=None,
        teams="A - B",
        venue="St. Martin, Cazis",
        venue_normalized="st. martin, cazis",
        remark=None,
        is_home_venue=True,
        classification=ImportRowClassification.NEU,
        matched_event_id=None,
        diff_details=None,
        include_decision=ImportRowDecision.INCLUDE,
        grill_shift_decision=GrillShiftDecision.PENDING,
        verschoben_acknowledged_at=None,
        applied_at=None,
        created_at=now,
        updated_at=now,
    )

    class FakeService:
        def __init__(self, _db: object, received_organization_id: UUID) -> None:
            assert received_organization_id == organization_id

        def list_rows(self, _batch_id: UUID) -> tuple[object, list[object]]:
            return batch, [row]

    current = _current(StaffRole.ADMIN)
    current.organization.id = organization_id
    app.dependency_overrides[imports_api.manage] = lambda: current
    app.dependency_overrides[dependencies.validate_csrf] = lambda: None
    app.dependency_overrides[get_db] = lambda: _FakeDb()
    monkeypatch.setattr(imports_api, "ImportService", FakeService)
    try:
        response = client.get(f"/api/admin/tenant-a/imports/{batch.id}/rows")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 200
    body = response.json()
    assert body["batch"]["source_filename"] == "plan.xlsx"
    assert body["rows"][0]["teams"] == "A - B"
