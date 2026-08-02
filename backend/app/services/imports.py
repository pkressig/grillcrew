"""Tenant-safe game-plan import staging, diffing, and confirmation."""

import re
import uuid
from collections.abc import Iterable
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organization import HomeVenue
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
from app.services.game_plan_parser import GamePlanParseError, ParsedRow, parse_game_plan
from app.services.settings import normalize_venue_name

SPIEL_TYP_LABELS: dict[SpielTyp, str] = {
    SpielTyp.MEISTERSCHAFT: "Meisterschaft",
    SpielTyp.CUP: "Cup",
    SpielTyp.TESTSPIEL: "Testspiel",
    SpielTyp.TURNIER: "Turnier",
}
_SPIEL_TYP_LABELS_REVERSE = {label: typ for typ, label in SPIEL_TYP_LABELS.items()}


class ImportNotFoundError(Exception):
    pass


class ImportValidationError(Exception):
    pass


class ImportConflictError(Exception):
    pass


def _match_key(spielnummer: str | None, teams: str, game_date: date) -> str:
    if spielnummer:
        return f"SN:{spielnummer}"
    return f"TD:{normalize_venue_name(teams)}|{game_date.isoformat()}"


def _dated_note(remark: str, now: datetime) -> str:
    return f"[Import {now.date().isoformat()}] Bemerkung: {remark}"


def _matches_home_venue(venue_normalized: str, home_venue_patterns: set[str]) -> bool:
    """Match normalized venue patterns, treating only ``*`` as a wildcard."""
    normalized_venue = normalize_venue_name(venue_normalized)
    if not normalized_venue:
        return False

    for pattern in sorted(home_venue_patterns):
        normalized_pattern = normalize_venue_name(pattern)
        if not normalized_pattern:
            continue
        literal_parts = (re.escape(part) for part in normalized_pattern.split("*"))
        expression = ".*".join(literal_parts)
        if re.fullmatch(expression, normalized_venue) is not None:
            return True
    return False


class ImportService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def create_batch(
        self,
        club_year_id: uuid.UUID,
        source_filename: str,
        content: bytes,
        uploaded_by_user_id: uuid.UUID,
        start_date: date | None = None,
        end_date: date | None = None,
        home_only: bool = False,
        commit: bool = True,
    ) -> ImportBatch:
        club_year = self.db.scalar(
            select(ClubYear).where(
                ClubYear.id == club_year_id, ClubYear.organization_id == self.organization_id
            )
        )
        if club_year is None:
            raise ImportNotFoundError("club year not found")
        if club_year.status in {PlanningStatus.CLOSED, PlanningStatus.ARCHIVED}:
            raise ImportConflictError(
                "Für ein geschlossenes oder archiviertes Vereinsjahr ist kein neuer Import möglich."
            )

        try:
            sheets = parse_game_plan(content)
        except GamePlanParseError as error:
            raise ImportValidationError(str(error)) from error

        season_by_type: dict[SeasonType, Season] = {}
        for sheet in sheets:
            if sheet.season_type in season_by_type:
                continue
            season = self.db.scalar(
                select(Season).where(
                    Season.club_year_id == club_year.id, Season.type == sheet.season_type
                )
            )
            if season is None:
                raise ImportValidationError(
                    f"Kein Saison-Eintrag vom Typ {sheet.season_type.value} im gewählten "
                    "Vereinsjahr gefunden. Bitte zuerst die Saison in der Planung anlegen."
                )
            if season.status in {PlanningStatus.CLOSED, PlanningStatus.ARCHIVED}:
                raise ImportConflictError(
                    f"Die Saison {season.name} ist geschlossen oder archiviert und kann nicht "
                    "importiert werden."
                )
            season_by_type[sheet.season_type] = season

        home_venue_names = set(
            self.db.scalars(
                select(HomeVenue.name_normalized).where(
                    HomeVenue.organization_id == self.organization_id,
                    HomeVenue.is_active.is_(True),
                )
            )
        )

        season_ids = [season.id for season in season_by_type.values()]
        existing_by_key: dict[str, Event] = {
            event.import_match_key: event
            for event in self.db.scalars(
                select(Event).where(
                    Event.season_id.in_(season_ids), Event.import_match_key.is_not(None)
                )
            )
            if event.import_match_key is not None
        }

        parsed_with_context: list[tuple[ParsedRow, Season, str]] = []
        seen_keys: dict[str, ParsedRow] = {}
        for sheet in sheets:
            season = season_by_type[sheet.season_type]
            for parsed in sheet.rows:
                if start_date is not None and parsed.game_date < start_date:
                    continue
                if end_date is not None and parsed.game_date > end_date:
                    continue
                if home_only and not _matches_home_venue(
                    normalize_venue_name(parsed.venue), home_venue_names
                ):
                    continue
                key = _match_key(parsed.spielnummer, parsed.teams, parsed.game_date)
                if key in seen_keys:
                    raise ImportValidationError(
                        f"Mehrdeutiger Abgleichsschlüssel '{key}': mehrere Zeilen mit denselben "
                        "Teams und demselben Datum ohne Spielnummer. Bitte Quelldatei prüfen."
                    )
                seen_keys[key] = parsed
                parsed_with_context.append((parsed, season, key))

        rows = [
            self._build_row(parsed, season, key, existing_by_key, home_venue_names)
            for parsed, season, key in parsed_with_context
        ]
        if not home_only:
            rows.extend(
                self._build_removed_rows(existing_by_key, seen_keys.keys(), home_venue_names)
            )

        batch = ImportBatch(
            organization_id=self.organization_id,
            club_year_id=club_year.id,
            source_filename=source_filename,
            uploaded_by_user_id=uploaded_by_user_id,
            status=ImportBatchStatus.STAGED,
            row_count=len(rows),
        )
        self.db.add(batch)
        self.db.flush()
        for row in rows:
            row.import_batch_id = batch.id
            self.db.add(row)
        if commit:
            self.db.commit()
            self.db.refresh(batch)
        else:
            self.db.flush()
        return batch

    def list_rows(self, batch_id: uuid.UUID) -> tuple[ImportBatch, list[ImportRow]]:
        batch = self._get_batch(batch_id)
        rows = list(
            self.db.scalars(
                select(ImportRow)
                .where(ImportRow.import_batch_id == batch.id)
                .order_by(ImportRow.game_date, ImportRow.id)
            )
        )
        return batch, rows

    def update_row_decision(
        self, batch_id: uuid.UUID, row_id: uuid.UUID, payload: ImportRowUpdate
    ) -> ImportRow:
        batch = self._get_batch(batch_id)
        if batch.status != ImportBatchStatus.STAGED:
            raise ImportConflictError("import batch is no longer staged")
        row = self.db.scalar(
            select(ImportRow).where(ImportRow.id == row_id, ImportRow.import_batch_id == batch.id)
        )
        if row is None:
            raise ImportNotFoundError("import row not found")

        if payload.include_decision is not None:
            row.include_decision = payload.include_decision
        if payload.grill_shift_decision is not None:
            row.grill_shift_decision = payload.grill_shift_decision
        if payload.acknowledge_verschoben:
            if row.classification != ImportRowClassification.VERSCHOBEN:
                raise ImportValidationError(
                    "nur als 'verschoben' klassifizierte Zeilen können bestätigt werden"
                )
            row.verschoben_acknowledged_at = datetime.now(UTC)

        self.db.commit()
        self.db.refresh(row)
        return row

    def confirm(
        self, batch_id: uuid.UUID, actor_user_id: uuid.UUID
    ) -> tuple[ImportBatch, list[ImportRow]]:
        batch = self._get_batch(batch_id)
        if batch.status != ImportBatchStatus.STAGED:
            raise ImportConflictError("import batch was already confirmed or discarded")

        rows = list(self.db.scalars(select(ImportRow).where(ImportRow.import_batch_id == batch.id)))
        now = datetime.now(UTC)
        for row in rows:
            if row.applied_at is not None:
                continue
            if row.include_decision == ImportRowDecision.INCLUDE:
                if row.classification == ImportRowClassification.NEU:
                    self._apply_neu(row, batch, now)
                elif row.classification == ImportRowClassification.GEAENDERT:
                    self._apply_geaendert(row, now)
                # VERSCHOBEN, ENTFERNT, UNVERAENDERT: no Event write, ever.
            row.applied_at = now

        batch.status = ImportBatchStatus.CONFIRMED
        batch.confirmed_at = now
        batch.confirmed_by_user_id = actor_user_id
        self.db.commit()
        self.db.refresh(batch)
        for row in rows:
            self.db.refresh(row)
        return batch, rows

    def apply_row(
        self, batch_id: uuid.UUID, row_id: uuid.UUID, actor_user_id: uuid.UUID
    ) -> ImportRow:
        batch = self._get_batch(batch_id)
        if batch.status != ImportBatchStatus.STAGED:
            raise ImportConflictError("import batch is no longer staged")
        row = self.db.scalar(
            select(ImportRow).where(ImportRow.id == row_id, ImportRow.import_batch_id == batch.id)
        )
        if row is None:
            raise ImportNotFoundError("import row not found")
        if not row.is_home_venue:
            raise ImportValidationError("Nur Spiele an einem Heimplatz können übernommen werden.")
        if row.classification not in {
            ImportRowClassification.NEU,
            ImportRowClassification.GEAENDERT,
        }:
            raise ImportConflictError("Dieses Spiel benötigt keine neue Entwurfsübernahme.")
        if row.applied_at is not None:
            return row
        now = datetime.now(UTC)
        row.include_decision = ImportRowDecision.INCLUDE
        if row.classification == ImportRowClassification.NEU:
            self._apply_neu(row, batch, now)
        else:
            self._apply_geaendert(row, now)
        row.applied_at = now
        self.db.commit()
        self.db.refresh(row)
        return row

    def _apply_neu(self, row: ImportRow, batch: ImportBatch, now: datetime) -> None:
        event = Event(
            season_id=row.season_id,
            title=row.bezeichnung or row.teams,
            date=row.game_date,
            location=row.venue,
            event_type=SPIEL_TYP_LABELS[row.spiel_typ],
            public_description=row.teams,
            internal_note=_dated_note(row.remark, now) if row.remark else None,
            status=EventStatus.DRAFT,
            source_import_id=batch.id,
            kickoff_time=row.game_time,
            external_game_number=row.spielnummer,
            import_match_key=_match_key(row.spielnummer, row.teams, row.game_date),
        )
        self.db.add(event)
        self.db.flush()
        row.matched_event_id = event.id

    def _apply_geaendert(self, row: ImportRow, now: datetime) -> None:
        if row.matched_event_id is None:
            return
        event = self.db.get(Event, row.matched_event_id)
        if event is None:
            return
        event.location = row.venue
        event.event_type = SPIEL_TYP_LABELS[row.spiel_typ]
        event.kickoff_time = row.game_time
        event.title = row.bezeichnung or row.teams
        if row.diff_details is not None and "teams" in row.diff_details:
            event.public_description = row.teams
        if row.remark:
            note = _dated_note(row.remark, now)
            event.internal_note = f"{event.internal_note}\n{note}" if event.internal_note else note

    def _build_row(
        self,
        parsed: ParsedRow,
        season: Season,
        key: str,
        existing_by_key: dict[str, Event],
        home_venue_names: set[str],
    ) -> ImportRow:
        venue_normalized = normalize_venue_name(parsed.venue)
        is_home_venue = _matches_home_venue(venue_normalized, home_venue_names)
        existing = existing_by_key.get(key)

        classification: ImportRowClassification
        diff_details: dict[str, object] | None = None
        matched_event_id: uuid.UUID | None = None

        if existing is None:
            classification = ImportRowClassification.NEU
        else:
            matched_event_id = existing.id
            if existing.date != parsed.game_date or existing.kickoff_time != parsed.game_time:
                classification = ImportRowClassification.VERSCHOBEN
                diff_details = {
                    "game_date": {
                        "old": existing.date.isoformat(),
                        "new": parsed.game_date.isoformat(),
                    },
                    "kickoff_time": {
                        "old": existing.kickoff_time.isoformat() if existing.kickoff_time else None,
                        "new": parsed.game_time.isoformat() if parsed.game_time else None,
                    },
                }
            else:
                changed: dict[str, object] = {}
                if existing.location != parsed.venue:
                    changed["venue"] = {"old": existing.location, "new": parsed.venue}
                expected_event_type = SPIEL_TYP_LABELS[parsed.spiel_typ]
                if existing.event_type != expected_event_type:
                    changed["spiel_typ"] = {
                        "old": existing.event_type,
                        "new": expected_event_type,
                    }
                if existing.public_description != parsed.teams:
                    changed["teams"] = {"old": existing.public_description, "new": parsed.teams}
                classification = (
                    ImportRowClassification.GEAENDERT
                    if changed
                    else ImportRowClassification.UNVERAENDERT
                )
                diff_details = changed or None

        include_decision = ImportRowDecision.INCLUDE if is_home_venue else ImportRowDecision.EXCLUDE

        return ImportRow(
            season_id=season.id,
            sheet_tab=parsed.sheet_tab,
            spiel_typ=parsed.spiel_typ,
            bezeichnung=parsed.bezeichnung,
            spielnummer=parsed.spielnummer,
            weekday_short=parsed.weekday_short,
            game_date=parsed.game_date,
            game_time=parsed.game_time,
            teams=parsed.teams,
            venue=parsed.venue,
            venue_normalized=venue_normalized,
            remark=parsed.remark,
            is_home_venue=is_home_venue,
            classification=classification,
            matched_event_id=matched_event_id,
            diff_details=diff_details,
            include_decision=include_decision,
            grill_shift_decision=GrillShiftDecision.PENDING,
        )

    def _build_removed_rows(
        self,
        existing_by_key: dict[str, Event],
        parsed_keys: Iterable[str],
        home_venue_names: set[str],
    ) -> list[ImportRow]:
        parsed_key_set = set(parsed_keys)
        removed_rows: list[ImportRow] = []
        for key, event in existing_by_key.items():
            if key in parsed_key_set:
                continue
            venue_normalized = normalize_venue_name(event.location)
            spiel_typ = _SPIEL_TYP_LABELS_REVERSE.get(event.event_type, SpielTyp.MEISTERSCHAFT)
            removed_rows.append(
                ImportRow(
                    season_id=event.season_id,
                    sheet_tab="ENTFERNT",
                    spiel_typ=spiel_typ,
                    bezeichnung=event.title,
                    spielnummer=event.external_game_number,
                    weekday_short=None,
                    game_date=event.date,
                    game_time=event.kickoff_time,
                    teams=event.public_description or event.title,
                    venue=event.location,
                    venue_normalized=venue_normalized,
                    remark=None,
                    is_home_venue=_matches_home_venue(venue_normalized, home_venue_names),
                    classification=ImportRowClassification.ENTFERNT,
                    matched_event_id=event.id,
                    diff_details={
                        "event": {
                            "old": {"date": event.date.isoformat(), "venue": event.location},
                            "new": None,
                        }
                    },
                    include_decision=ImportRowDecision.EXCLUDE,
                    grill_shift_decision=GrillShiftDecision.PENDING,
                )
            )
        return removed_rows

    def _get_batch(self, batch_id: uuid.UUID) -> ImportBatch:
        batch = self.db.scalar(
            select(ImportBatch).where(
                ImportBatch.id == batch_id, ImportBatch.organization_id == self.organization_id
            )
        )
        if batch is None:
            raise ImportNotFoundError("import batch not found")
        return batch
