"""Tenant-safe planning CRUD and lifecycle rules."""

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.planning import ClubYear, PlanningStatus, Season
from app.schemas.planning import ClubYearCreate, ClubYearUpdate, SeasonCreate, SeasonUpdate

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

    def update_club_year(self, club_year_id: uuid.UUID, payload: ClubYearUpdate) -> ClubYear:
        item = self.get_club_year(club_year_id)
        values = payload.model_dump(exclude_unset=True)
        requested_status = values.get("status")
        if requested_status is not None:
            validate_transition(item.status, requested_status)
        start = values.get("start_date", item.start_date)
        end = values.get("end_date", item.end_date)
        if start > end:
            raise PlanningValidationError("start_date must be on or before end_date")
        for season in item.seasons:
            if season.start_date < start or season.end_date > end:
                raise PlanningValidationError("club year must contain all seasons")
        for key, value in values.items():
            setattr(item, key, value)
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
        self._validate_inside_club_year(payload.start_date, payload.end_date, club_year)
        item = Season(club_year_id=club_year.id, **payload.model_dump())
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)
        return item

    def update_season(self, season_id: uuid.UUID, payload: SeasonUpdate) -> Season:
        item = self._get_season(season_id)
        values = payload.model_dump(exclude_unset=True)
        requested_status = values.get("status")
        if item.status in {PlanningStatus.CLOSED, PlanningStatus.ARCHIVED}:
            allowed = set(values) <= {"status"} and requested_status is not None
            if not allowed:
                raise PlanningConflictError("closed or archived seasons cannot be edited")
        if requested_status is not None:
            validate_transition(item.status, requested_status)
        start = values.get("start_date", item.start_date)
        end = values.get("end_date", item.end_date)
        if start > end:
            raise PlanningValidationError("start_date must be on or before end_date")
        self._validate_inside_club_year(start, end, item.club_year)
        for key, value in values.items():
            setattr(item, key, value)
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

    def _get_season(self, season_id: uuid.UUID) -> Season:
        item = self.db.scalar(
            select(Season)
            .join(ClubYear)
            .where(Season.id == season_id, ClubYear.organization_id == self.organization_id)
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
