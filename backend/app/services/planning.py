"""Tenant-safe planning CRUD and lifecycle rules."""

import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session, selectinload

from app.models.external_kiosk import ExternalKioskBatch, ExternalKioskCategory, ExternalKioskRow
from app.models.identity import AuditEvent
from app.models.organization import CrewSizeRule, MenuType, Organization
from app.models.planning import (
    ClubYear,
    Event,
    EventStatus,
    ImportBatch,
    ImportRow,
    PlanningStatus,
    Season,
    Shift,
    ShiftStatus,
    ShiftType,
    Signup,
    SignupOutcome,
    SignupStatus,
)
from app.models.proposal import ProposalOverride
from app.models.work_record import WorkRecord
from app.schemas.planning import (
    ClubYearCreate,
    ClubYearUpdate,
    EventCreate,
    EventUpdate,
    SeasonCreate,
    SeasonUpdate,
    ShiftCreate,
    ShiftUpdate,
)
from app.schemas.proposals import ProposalWindowResponse
from app.services.settings import SettingsService

TRANSITIONS = {
    PlanningStatus.DRAFT: {PlanningStatus.ACTIVE, PlanningStatus.CLOSED, PlanningStatus.ARCHIVED},
    PlanningStatus.ACTIVE: {PlanningStatus.CLOSED},
    PlanningStatus.CLOSED: {PlanningStatus.ARCHIVED},
    PlanningStatus.ARCHIVED: set(),
}


class PlanningNotFoundError(Exception):
    pass


class PlanningValidationError(Exception):
    pass


class PlanningConflictError(Exception):
    pass


def validate_transition(current: PlanningStatus, requested: PlanningStatus) -> None:
    if requested != current and requested not in TRANSITIONS[current]:
        raise PlanningConflictError(
            f"invalid status transition: {current.value} -> {requested.value}"
        )


class PlanningService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def list_club_years(self) -> list[ClubYear]:
        return list(
            self.db.scalars(
                select(ClubYear)
                .where(ClubYear.organization_id == self.organization_id)
                .order_by(ClubYear.start_date.desc(), ClubYear.id)
            )
        )

    def get_club_year(self, club_year_id: uuid.UUID) -> ClubYear:
        item = self.db.scalar(
            select(ClubYear).where(
                ClubYear.id == club_year_id, ClubYear.organization_id == self.organization_id
            )
        )
        if item is None:
            raise PlanningNotFoundError
        return item

    def create_club_year(self, payload: ClubYearCreate) -> ClubYear:
        item = ClubYear(organization_id=self.organization_id, **payload.model_dump())
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update_club_year(
        self,
        club_year_id: uuid.UUID,
        payload: ClubYearUpdate,
        actor_user_id: uuid.UUID | None = None,
    ) -> ClubYear:
        item = self.get_club_year(club_year_id)
        values = payload.model_dump(exclude_unset=True)
        requested_status = values.get("status")
        if requested_status is not None:
            validate_transition(item.status, requested_status)
            if requested_status in {PlanningStatus.CLOSED, PlanningStatus.ARCHIVED} and any(
                season.status == PlanningStatus.ACTIVE for season in item.seasons
            ):
                raise PlanningConflictError(
                    "Ein Vereinsjahr mit aktiver Saison kann nicht geschlossen oder "
                    "archiviert werden."
                )
        start = values.get("start_date", item.start_date)
        end = values.get("end_date", item.end_date)
        if start > end:
            raise PlanningValidationError("start_date must be on or before end_date")
        for season in item.seasons:
            if season.start_date < start or season.end_date > end:
                raise PlanningValidationError("club year must contain all seasons")
        for key, value in values.items():
            setattr(item, key, value)
        self._audit(actor_user_id, "CLUB_YEAR_UPDATED", "club_year", item.id, values)
        self.db.commit()
        self.db.refresh(item)
        return item

    def list_seasons(self) -> list[Season]:
        return list(
            self.db.scalars(
                select(Season)
                .join(ClubYear)
                .where(ClubYear.organization_id == self.organization_id)
                .order_by(Season.start_date.desc(), Season.id)
            )
        )

    def create_season(self, club_year_id: uuid.UUID, payload: SeasonCreate) -> Season:
        club_year = self.get_club_year(club_year_id)
        if club_year.status in {PlanningStatus.CLOSED, PlanningStatus.ARCHIVED}:
            raise PlanningConflictError(
                "In einem geschlossenen oder archivierten Vereinsjahr können keine Saisons "
                "erstellt werden."
            )
        self._validate_inside_club_year(payload.start_date, payload.end_date, club_year)
        item = Season(club_year_id=club_year.id, **payload.model_dump())
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update_season(
        self, season_id: uuid.UUID, payload: SeasonUpdate, actor_user_id: uuid.UUID | None = None
    ) -> Season:
        item = self._get_season(season_id)
        values = payload.model_dump(exclude_unset=True)
        requested_status = values.get("status")
        if item.status in {PlanningStatus.CLOSED, PlanningStatus.ARCHIVED}:
            allowed = set(values) <= {"status"} and requested_status is not None
            if not allowed:
                raise PlanningConflictError("closed or archived seasons cannot be edited")
        if requested_status is not None:
            validate_transition(item.status, requested_status)
            if item.status == PlanningStatus.ACTIVE and requested_status == PlanningStatus.CLOSED:
                other_active = self.db.scalar(
                    select(func.count())
                    .select_from(Season)
                    .join(ClubYear)
                    .where(
                        ClubYear.organization_id == self.organization_id,
                        Season.status == PlanningStatus.ACTIVE,
                        Season.id != item.id,
                    )
                )
                if not other_active:
                    raise PlanningConflictError(
                        "Die einzige aktive Saison kann nicht geschlossen werden. Bitte zuerst "
                        "eine Ersatzsaison aktivieren."
                    )
        start = values.get("start_date", item.start_date)
        end = values.get("end_date", item.end_date)
        if start > end:
            raise PlanningValidationError("start_date must be on or before end_date")
        self._validate_inside_club_year(start, end, item.club_year)
        for key, value in values.items():
            setattr(item, key, value)
        self._audit(actor_user_id, "SEASON_UPDATED", "season", item.id, values)
        self.db.commit()
        self.db.refresh(item)
        return item

    def current_season(self, today: date) -> Season:
        item = self.db.scalar(
            select(Season)
            .join(ClubYear)
            .where(
                ClubYear.organization_id == self.organization_id,
                Season.status == PlanningStatus.ACTIVE,
                Season.start_date <= today,
                Season.end_date >= today,
            )
            .order_by(Season.start_date.desc())
        )
        if item is None:
            raise PlanningNotFoundError
        return item

    def list_events(self, season_id: uuid.UUID) -> list[Event]:
        season = self._get_season(season_id)
        return list(
            self.db.scalars(
                select(Event).where(Event.season_id == season.id).order_by(Event.date, Event.id)
            )
        )

    def list_public_events(self, from_date: date) -> list[Event]:
        """Return upcoming published events with public-visible shifts for this tenant."""
        events = list(
            self.db.scalars(
                select(Event)
                .join(Season)
                .join(ClubYear)
                .options(selectinload(Event.shifts).selectinload(Shift.signups))
                .where(
                    ClubYear.organization_id == self.organization_id,
                    Event.status == EventStatus.PUBLISHED,
                    Event.date >= from_date,
                    Event.shifts.any(
                        (Shift.status != ShiftStatus.CANCELLED)
                        & (Shift.shift_type == ShiftType.GRILL)
                    ),
                )
                .order_by(Event.date, Event.id)
            )
        )
        return events

    def create_event(self, season_id: uuid.UUID, payload: EventCreate) -> Event:
        season = self._get_season(season_id)
        if season.status in {PlanningStatus.CLOSED, PlanningStatus.ARCHIVED}:
            raise PlanningConflictError(
                "In einer geschlossenen oder archivierten Saison können keine Anlässe "
                "erstellt werden."
            )
        self._validate_event_date(payload.date, season)
        item = Event(season_id=season.id, **payload.model_dump())
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete_season(self, season_id: uuid.UUID, actor_user_id: uuid.UUID) -> None:
        item = self._get_season(season_id)
        if item.status not in {PlanningStatus.DRAFT, PlanningStatus.ARCHIVED}:
            raise PlanningConflictError(
                "Nur unbenutzte Saison-Entwürfe können gelöscht werden; "
                "diese Saison muss geschlossen oder archiviert bleiben."
            )
        event_count = self.db.scalar(
            select(func.count()).select_from(Event).where(Event.season_id == item.id)
        )
        import_count = self.db.scalar(
            select(func.count()).select_from(ImportRow).where(ImportRow.season_id == item.id)
        )
        dependencies = []
        if event_count:
            dependencies.append(f"{event_count} Anlass/Anlässe")
        if import_count:
            dependencies.append(f"{import_count} Importzeile(n)")
        if dependencies:
            raise PlanningConflictError(
                "Diese Saison kann nicht gelöscht werden: abhängig sind "
                f"{', '.join(dependencies)}. Bitte die Saison archivieren."
            )
        self._audit(actor_user_id, "SEASON_DELETED", "season", item.id, {"name": item.name})
        self.db.delete(item)
        self.db.commit()

    def delete_club_year(self, club_year_id: uuid.UUID, actor_user_id: uuid.UUID) -> None:
        item = self.get_club_year(club_year_id)
        if item.status not in {PlanningStatus.DRAFT, PlanningStatus.ARCHIVED}:
            raise PlanningConflictError(
                "Nur unbenutzte Vereinsjahr-Entwürfe können gelöscht werden; "
                "dieses Vereinsjahr muss geschlossen oder archiviert bleiben."
            )
        season_count = self.db.scalar(
            select(func.count()).select_from(Season).where(Season.club_year_id == item.id)
        )
        event_count = self.db.scalar(
            select(func.count())
            .select_from(Event)
            .join(Season)
            .where(Season.club_year_id == item.id)
        )
        import_count = self.db.scalar(
            select(func.count()).select_from(ImportBatch).where(ImportBatch.club_year_id == item.id)
        )
        dependencies = []
        if season_count:
            dependencies.append(f"{season_count} Saison(s)")
        if event_count:
            dependencies.append(f"{event_count} Anlass/Anlässe")
        if import_count:
            dependencies.append(f"{import_count} Import(e)")
        if dependencies:
            raise PlanningConflictError(
                "Dieses Vereinsjahr kann nicht gelöscht werden: abhängig sind "
                f"{', '.join(dependencies)}. Bitte das Vereinsjahr archivieren."
            )
        self._audit(actor_user_id, "CLUB_YEAR_DELETED", "club_year", item.id, {"label": item.label})
        self.db.delete(item)
        self.db.commit()

    def _audit(
        self,
        actor_user_id: uuid.UUID | None,
        action: str,
        entity_type: str,
        entity_id: uuid.UUID,
        metadata: dict[str, object],
    ) -> None:
        if actor_user_id is not None:
            self.db.add(
                AuditEvent(
                    organization_id=self.organization_id,
                    actor_user_id=actor_user_id,
                    action=action,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    event_metadata={
                        key: (value.value if hasattr(value, "value") else str(value))
                        for key, value in metadata.items()
                    },
                )
            )

    def update_event(self, event_id: uuid.UUID, payload: EventUpdate) -> Event:
        item = self._get_event(event_id)
        values = payload.model_dump(exclude_unset=True)
        event_date = values.get("date", item.date)
        self._validate_event_date(event_date, item.season)
        if event_date != item.date:
            for shift in item.shifts:
                self._validate_shift_times(shift.starts_at, shift.ends_at, event_date)
        for key, value in values.items():
            setattr(item, key, value)
        self.db.commit()
        self.db.refresh(item)
        return item

    def delete_event(self, event_id: uuid.UUID, actor_user_id: uuid.UUID) -> None:
        """Delete a historical event only when every known dependent record is absent.

        Locking the event and its shifts makes the dependency check and delete one atomic
        operation. A missing event is an idempotent success and does not disclose whether the
        identifier belongs to another organization.
        """
        item = self.db.scalar(
            select(Event)
            .join(Season)
            .join(ClubYear)
            .options(selectinload(Event.season))
            .where(Event.id == event_id, ClubYear.organization_id == self.organization_id)
            .with_for_update(of=Event)
        )
        if item is None:
            return
        if item.status not in {EventStatus.COMPLETED, EventStatus.CANCELLED}:
            raise PlanningConflictError(
                "Nur erledigte oder abgesagte Anlässe aus dem Archiv können gelöscht werden."
            )

        shifts = list(
            self.db.scalars(
                select(Shift).where(Shift.event_id == item.id).with_for_update(of=Shift)
            )
        )
        shift_ids = [shift.id for shift in shifts]
        signup_count = 0
        work_record_count = 0
        if shift_ids:
            signup_count = (
                self.db.scalar(
                    select(func.count()).select_from(Signup).where(Signup.shift_id.in_(shift_ids))
                )
                or 0
            )
            work_record_count = (
                self.db.scalar(
                    select(func.count())
                    .select_from(WorkRecord)
                    .join(Signup, WorkRecord.signup_id == Signup.id)
                    .where(Signup.shift_id.in_(shift_ids))
                )
                or 0
            )
        import_row_count = (
            self.db.scalar(
                select(func.count())
                .select_from(ImportRow)
                .where(ImportRow.matched_event_id == item.id)
            )
            or 0
        )
        proposal_count, external_comparison_count = self._planning_reference_counts(item)

        dependencies = []
        if signup_count:
            dependencies.append(f"{signup_count} Anmeldung(en)")
        if work_record_count:
            dependencies.append(f"{work_record_count} Arbeitsnachweis(e)")
        if import_row_count:
            dependencies.append(f"{import_row_count} Spielplan-Importzeile(n)")
        if proposal_count:
            dependencies.append(f"{proposal_count} manuelle Planungsreferenz(en)")
        if external_comparison_count:
            dependencies.append(
                f"{external_comparison_count} externe Vergleichszeile(n) am selben Datum"
            )
        if dependencies:
            raise PlanningConflictError(
                "Dieser Anlass kann nicht gelöscht werden: abhängig sind "
                f"{', '.join(dependencies)}. Die historischen Daten bleiben erhalten."
            )

        self._audit(
            actor_user_id,
            "EVENT_DELETED",
            "event",
            item.id,
            {"title": item.title, "date": item.date, "shift_count": len(shifts)},
        )
        self.db.delete(item)
        self.db.commit()

    def force_delete_historical_event(self, event_id: uuid.UUID, actor_user_id: uuid.UUID) -> None:
        """Permanently remove one terminal event and records exclusively owned by it."""
        item = self.db.scalar(
            select(Event)
            .join(Season)
            .join(ClubYear)
            .where(Event.id == event_id, ClubYear.organization_id == self.organization_id)
            .with_for_update(of=Event)
        )
        if item is None:
            raise PlanningNotFoundError
        if item.status not in {EventStatus.COMPLETED, EventStatus.CANCELLED}:
            raise PlanningConflictError(
                "Nur erledigte oder abgesagte Anlässe aus dem Archiv können endgültig "
                "gelöscht werden."
            )

        shifts = list(
            self.db.scalars(
                select(Shift).where(Shift.event_id == item.id).with_for_update(of=Shift)
            )
        )
        shift_ids = [shift.id for shift in shifts]
        signups = (
            list(
                self.db.scalars(
                    select(Signup).where(Signup.shift_id.in_(shift_ids)).with_for_update(of=Signup)
                )
            )
            if shift_ids
            else []
        )
        signup_ids = [signup.id for signup in signups]
        work_records = (
            list(
                self.db.scalars(
                    select(WorkRecord)
                    .where(WorkRecord.signup_id.in_(signup_ids))
                    .with_for_update(of=WorkRecord)
                )
            )
            if signup_ids
            else []
        )
        import_rows = list(
            self.db.scalars(
                select(ImportRow)
                .where(ImportRow.matched_event_id == item.id)
                .with_for_update(of=ImportRow)
            )
        )

        # These associations are derived rather than represented by foreign keys. Prevent their
        # source rows from changing while exclusive ownership is recomputed.
        self.db.execute(
            text("LOCK TABLE proposal_override, external_kiosk_row IN SHARE ROW EXCLUSIVE MODE")
        )
        proposal_overrides, comparison_rows = self._owned_planning_references(item)
        counts = {
            "shift_count": len(shifts),
            "signup_count": len(signups),
            "work_record_count": len(work_records),
            "proposal_override_count": len(proposal_overrides),
            "external_comparison_row_count": len(comparison_rows),
            "import_row_link_count": len(import_rows),
        }
        self._audit(
            actor_user_id,
            "EVENT_FORCE_DELETED",
            "event",
            item.id,
            {
                "event_id": item.id,
                "title": item.title,
                "date": item.date,
                "explicit_force_delete": True,
                **counts,
            },
        )

        # Keep the import history, but remove its now-invalid event link. All other rows here are
        # exclusively owned by the selected event and are removed in dependency order.
        if import_rows:
            self.db.execute(
                update(ImportRow)
                .where(ImportRow.id.in_([row.id for row in import_rows]))
                .values(matched_event_id=None)
            )
        comparison_counts_by_batch: dict[uuid.UUID, int] = {}
        for row in comparison_rows:
            comparison_counts_by_batch[row.batch_id] = (
                comparison_counts_by_batch.get(row.batch_id, 0) + 1
            )
        for batch_id, deleted_count in comparison_counts_by_batch.items():
            self.db.execute(
                update(ExternalKioskBatch)
                .where(ExternalKioskBatch.id == batch_id)
                .values(row_count=func.greatest(0, ExternalKioskBatch.row_count - deleted_count))
            )
        for record in work_records:
            self.db.delete(record)
        for signup in signups:
            self.db.delete(signup)
        for shift in shifts:
            self.db.delete(shift)
        for override in proposal_overrides:
            self.db.delete(override)
        for row in comparison_rows:
            self.db.delete(row)
        self.db.delete(item)
        self.db.commit()

    def _owned_planning_references(
        self, item: Event
    ) -> tuple[list[ProposalOverride], list[ExternalKioskRow]]:
        """Return derived rows that refer exclusively to the selected event.

        A multi-event proposal window or comparison row is shared and therefore retained.
        """
        from app.services.proposals import ProposalService

        windows = [
            window
            for window in ProposalService(self.db, self.organization_id).list_windows()
            if item.id in window.covered_event_ids
        ]
        exclusive_windows = [window for window in windows if window.covered_event_ids == [item.id]]
        if not windows:
            ambiguous_override_count = self.db.scalar(
                select(func.count())
                .select_from(ProposalOverride)
                .where(
                    ProposalOverride.organization_id == self.organization_id,
                    ProposalOverride.proposal_date == item.date,
                )
            )
            if ambiguous_override_count:
                raise PlanningConflictError(
                    "Der Anlass kann nicht sicher gelöscht werden: Für dieses Datum bestehen "
                    "manuelle Planungsreferenzen, die nicht eindeutig nur diesem Anlass gehören. "
                    "Alle Daten bleiben erhalten."
                )
        if not exclusive_windows:
            return [], []
        window_keys = [window.id for window in exclusive_windows]
        overrides = list(
            self.db.scalars(
                select(ProposalOverride)
                .where(
                    ProposalOverride.organization_id == self.organization_id,
                    ProposalOverride.window_key.in_(window_keys),
                )
                .with_for_update(of=ProposalOverride)
            )
        )
        organization = self.db.get(Organization, self.organization_id)
        if organization is None:
            raise PlanningConflictError(
                "Der Anlass kann nicht sicher gelöscht werden: Die Organisation fehlt."
            )
        timezone = ZoneInfo(organization.timezone)
        dated_rows = list(
            self.db.scalars(
                select(ExternalKioskRow)
                .join(ExternalKioskBatch)
                .where(
                    ExternalKioskBatch.organization_id == self.organization_id,
                    ExternalKioskRow.plan_date == item.date,
                )
                .with_for_update(of=ExternalKioskRow)
            )
        )
        all_windows = ProposalService(self.db, self.organization_id).list_windows()
        rows = [
            row
            for row in dated_rows
            if any(
                self._comparison_row_matches(row, window, timezone) for window in exclusive_windows
            )
            and not any(
                item.id not in window.covered_event_ids
                and self._comparison_row_matches(row, window, timezone)
                for window in all_windows
            )
        ]
        return overrides, rows

    @staticmethod
    def _comparison_row_matches(
        row: ExternalKioskRow, window: ProposalWindowResponse, timezone: ZoneInfo
    ) -> bool:
        from app.services.external_kiosk import ExternalKioskService

        return bool(
            (
                row.category == ExternalKioskCategory.KIOSK
                or (row.category == ExternalKioskCategory.GRILL and window.grill_required)
            )
            and ExternalKioskService._overlaps(
                row,
                window.start_at,
                window.end_at,
                timezone,
            )
        )

    def _planning_reference_counts(self, item: Event) -> tuple[int, int]:
        """Count only derived planning references whose current window contains the event.

        Proposal overrides and external comparison rows have no event foreign key. Their
        association is calculated by ``ProposalService`` from a window's covered event IDs and
        by time overlap respectively, so a same-date row alone is not a dependency.
        """
        from app.services.external_kiosk import ExternalKioskService
        from app.services.proposals import ProposalService

        # These references are derived and have no event FK. PostgreSQL SHARE table locks are
        # intentionally short-lived here: they prevent concurrent inserts/updates/deletes from
        # creating a phantom dependency between recomputation and the event delete. Row-only
        # tenant locks would not protect against new matching rows.
        self.db.execute(text("LOCK TABLE proposal_override, external_kiosk_row IN SHARE MODE"))

        windows = [
            window
            for window in ProposalService(self.db, self.organization_id).list_windows()
            if item.id in window.covered_event_ids
        ]
        proposal_count = sum(window.is_overridden for window in windows)
        if not windows:
            return proposal_count, 0

        organization = self.db.get(Organization, self.organization_id)
        if organization is None:
            return proposal_count, 0
        timezone = ZoneInfo(organization.timezone)
        rows = list(
            self.db.scalars(
                select(ExternalKioskRow)
                .join(ExternalKioskBatch)
                .where(
                    ExternalKioskBatch.organization_id == self.organization_id,
                    ExternalKioskRow.plan_date == item.date,
                )
            )
        )
        referenced_row_ids = {
            row.id
            for row in rows
            for window in windows
            if (
                row.category == ExternalKioskCategory.KIOSK
                or (row.category == ExternalKioskCategory.GRILL and window.grill_required)
            )
            and ExternalKioskService._overlaps(row, window.start_at, window.end_at, timezone)
        }
        return proposal_count, len(referenced_row_ids)

    def list_shifts(self, event_id: uuid.UUID) -> list[Shift]:
        event = self._get_event(event_id)
        return list(
            self.db.scalars(
                select(Shift)
                .options(selectinload(Shift.signups).selectinload(Signup.volunteer))
                .where(Shift.event_id == event.id)
                .order_by(Shift.sort_order, Shift.starts_at, Shift.id)
            )
        )

    def create_shift(self, event_id: uuid.UUID, payload: ShiftCreate) -> Shift:
        event = self._get_event(event_id)
        self._validate_shift_times(payload.starts_at, payload.ends_at, event.date)
        item = Shift(event_id=event.id, **payload.model_dump())
        item.crew_suggestion_overridden = self._is_crew_suggestion_overridden(
            event, item.menu_type, item.required_volunteers
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update_shift(self, shift_id: uuid.UUID, payload: ShiftUpdate) -> Shift:
        item = self._get_shift(shift_id)
        values = payload.model_dump(exclude_unset=True)
        starts_at = values.get("starts_at", item.starts_at)
        ends_at = values.get("ends_at", item.ends_at)
        self._validate_shift_times(starts_at, ends_at, item.event.date)
        for key, value in values.items():
            setattr(item, key, value)
        if "menu_type" in values or "required_volunteers" in values:
            item.crew_suggestion_overridden = self._is_crew_suggestion_overridden(
                item.event, item.menu_type, item.required_volunteers
            )
        self.db.commit()
        self.db.refresh(item)
        return item

    def suggest_shift_crew(self, event_id: uuid.UUID) -> CrewSizeRule | None:
        """Return the matched crew-size rule for the event's team text, or `None`."""
        event = self._get_event(event_id)
        team_text = event.public_description or event.title
        return SettingsService(self.db, self.organization_id).suggest_crew_size(team_text)

    def _is_crew_suggestion_overridden(
        self, event: Event, menu_type: MenuType | None, required_volunteers: int
    ) -> bool:
        team_text = event.public_description or event.title
        suggestion = SettingsService(self.db, self.organization_id).suggest_crew_size(team_text)
        if suggestion is None:
            return menu_type is not None
        return (
            menu_type != suggestion.menu_type
            or required_volunteers != suggestion.required_griller_count
        )

    def cancel_signup(self, signup_id: uuid.UUID, now: datetime | None = None) -> Shift:
        signup = self.db.scalar(
            select(Signup)
            .join(Shift)
            .join(Event)
            .join(Season)
            .join(ClubYear)
            .options(
                selectinload(Signup.shift)
                .selectinload(Shift.signups)
                .selectinload(Signup.volunteer)
            )
            .where(
                Signup.id == signup_id,
                ClubYear.organization_id == self.organization_id,
            )
            .with_for_update(of=Signup)
        )
        if signup is None:
            raise PlanningNotFoundError
        if signup.status == SignupStatus.CANCELLED_BY_ADMIN:
            return signup.shift
        if signup.status != SignupStatus.ACTIVE:
            raise PlanningConflictError("signup was already cancelled by the volunteer")

        signup.status = SignupStatus.CANCELLED_BY_ADMIN
        signup.cancelled_at = now or datetime.now(UTC)
        signup.cancellation_reason = "ADMIN_MANUAL"
        self.db.commit()
        return signup.shift

    def update_signup_attendance(
        self, signup_id: uuid.UUID, outcome: SignupOutcome, actor_user_id: uuid.UUID
    ) -> Signup:
        signup = self.db.scalar(
            select(Signup)
            .join(Shift)
            .join(Event)
            .join(Season)
            .join(ClubYear)
            .options(selectinload(Signup.volunteer))
            .where(
                Signup.id == signup_id,
                ClubYear.organization_id == self.organization_id,
            )
            .with_for_update(of=Signup)
        )
        if signup is None:
            raise PlanningNotFoundError
        if signup.status != SignupStatus.ACTIVE:
            raise PlanningConflictError("attendance can only be updated for an active signup")
        if signup.outcome == outcome:
            return signup

        previous_outcome = signup.outcome
        signup.outcome = outcome
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="ATTENDANCE_OUTCOME_CHANGED",
                entity_type="signup",
                entity_id=signup.id,
                event_metadata={
                    "previous_outcome": previous_outcome.value,
                    "new_outcome": outcome.value,
                },
            )
        )
        self.db.commit()
        self.db.refresh(signup)
        return signup

    def _get_season(self, season_id: uuid.UUID) -> Season:
        item = self.db.scalar(
            select(Season)
            .join(ClubYear)
            .where(Season.id == season_id, ClubYear.organization_id == self.organization_id)
        )
        if item is None:
            raise PlanningNotFoundError
        return item

    def _get_event(self, event_id: uuid.UUID) -> Event:
        item = self.db.scalar(
            select(Event)
            .join(Season)
            .join(ClubYear)
            .where(Event.id == event_id, ClubYear.organization_id == self.organization_id)
        )
        if item is None:
            raise PlanningNotFoundError
        return item

    def _get_shift(self, shift_id: uuid.UUID) -> Shift:
        item = self.db.scalar(
            select(Shift)
            .join(Event)
            .join(Season)
            .join(ClubYear)
            .where(Shift.id == shift_id, ClubYear.organization_id == self.organization_id)
        )
        if item is None:
            raise PlanningNotFoundError
        return item

    @staticmethod
    def _validate_inside_club_year(start: date, end: date, club_year: ClubYear) -> None:
        if start > end:
            raise PlanningValidationError("start_date must be on or before end_date")
        if start < club_year.start_date or end > club_year.end_date:
            raise PlanningValidationError("season must fit inside its club year")

    @staticmethod
    def _validate_event_date(event_date: date, season: Season) -> None:
        if event_date < season.start_date or event_date > season.end_date:
            raise PlanningValidationError("event date must be inside its season")

    @staticmethod
    def _validate_shift_times(starts_at: datetime, ends_at: datetime, event_date: date) -> None:
        if starts_at >= ends_at:
            raise PlanningValidationError("starts_at must be before ends_at")
        if starts_at.date() != event_date or ends_at.date() != event_date:
            raise PlanningValidationError("shift times must stay on the event date")
