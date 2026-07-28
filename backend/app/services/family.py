"""Organization-scoped family creation and active-family listing."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.family import Family, FamilyMember, FamilyStatus
from app.schemas.family import FamilyCreate, FamilyMemberCreate


class FamilyNotFoundError(Exception):
    pass


class FamilyService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def list_active(self) -> list[Family]:
        return list(
            self.db.scalars(
                select(Family)
                .where(
                    Family.organization_id == self.organization_id,
                    Family.status == FamilyStatus.ACTIVE,
                )
                .order_by(Family.display_name, Family.id)
            )
        )

    def create(self, payload: FamilyCreate) -> Family:
        family = Family(
            organization_id=self.organization_id,
            display_name=payload.display_name,
            status=FamilyStatus.ACTIVE,
            internal_note=payload.internal_note,
        )
        self.db.add(family)
        self.db.commit()
        self.db.refresh(family)
        return family

    def list_members(self, family_id: uuid.UUID) -> list[FamilyMember]:
        self._get_active_family(family_id)
        return list(
            self.db.scalars(
                select(FamilyMember)
                .where(FamilyMember.family_id == family_id)
                .order_by(
                    FamilyMember.last_name,
                    FamilyMember.first_name,
                    FamilyMember.member_type,
                    FamilyMember.id,
                )
            )
        )

    def create_member(self, family_id: uuid.UUID, payload: FamilyMemberCreate) -> FamilyMember:
        self._get_active_family(family_id)
        member = FamilyMember(
            family_id=family_id,
            member_type=payload.member_type,
            first_name=payload.first_name,
            last_name=payload.last_name,
        )
        self.db.add(member)
        self.db.commit()
        self.db.refresh(member)
        return member

    def _get_active_family(self, family_id: uuid.UUID) -> Family:
        family = self.db.scalar(
            select(Family).where(
                Family.id == family_id,
                Family.organization_id == self.organization_id,
                Family.status == FamilyStatus.ACTIVE,
            )
        )
        if family is None:
            raise FamilyNotFoundError
        return family
