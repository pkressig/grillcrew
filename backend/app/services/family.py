"""Organization-scoped family creation and active-family listing."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.family import Family, FamilyMember, FamilyMemberType, FamilyStatus
from app.models.identity import AuditEvent
from app.models.planning import Volunteer, VolunteerStatus
from app.schemas.family import FamilyCreate, FamilyMemberCreate, FamilyMemberVolunteerUpdate


class FamilyNotFoundError(Exception):
    pass


class FamilyMemberNotFoundError(Exception):
    pass


class FamilyMemberLinkError(Exception):
    pass


class FamilyService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    def list_active(self) -> list[tuple[Family, int, int]]:
        statement = (
            select(
                Family,
                func.count(FamilyMember.id)
                .filter(FamilyMember.member_type == FamilyMemberType.CHILD)
                .label("children_count"),
                func.count(FamilyMember.id)
                .filter(FamilyMember.member_type == FamilyMemberType.HELPER)
                .label("helpers_count"),
            )
            .outerjoin(FamilyMember, FamilyMember.family_id == Family.id)
            .where(
                Family.organization_id == self.organization_id,
                Family.status == FamilyStatus.ACTIVE,
            )
            .group_by(Family.id)
            .order_by(Family.display_name, Family.id)
        )
        return [
            (family, children, helpers) for family, children, helpers in self.db.execute(statement)
        ]

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

    def list_active_volunteers(self) -> list[Volunteer]:
        return list(
            self.db.scalars(
                select(Volunteer)
                .where(
                    Volunteer.organization_id == self.organization_id,
                    Volunteer.status == VolunteerStatus.ACTIVE,
                )
                .order_by(Volunteer.last_name, Volunteer.first_name, Volunteer.id)
            )
        )

    def update_member_volunteer(
        self,
        family_id: uuid.UUID,
        member_id: uuid.UUID,
        payload: FamilyMemberVolunteerUpdate,
        actor_user_id: uuid.UUID,
    ) -> FamilyMember:
        self._get_active_family(family_id)
        member = self.db.scalar(
            select(FamilyMember).where(
                FamilyMember.id == member_id,
                FamilyMember.family_id == family_id,
            )
        )
        if member is None:
            raise FamilyMemberNotFoundError
        if member.member_type != FamilyMemberType.HELPER:
            raise FamilyMemberLinkError("only helper family members can link volunteers")
        if member.volunteer_id == payload.volunteer_id:
            return member
        if payload.volunteer_id is not None:
            volunteer = self.db.scalar(
                select(Volunteer).where(
                    Volunteer.id == payload.volunteer_id,
                    Volunteer.organization_id == self.organization_id,
                    Volunteer.status == VolunteerStatus.ACTIVE,
                )
            )
            if volunteer is None:
                raise FamilyMemberLinkError("active volunteer not found")
        previous_id = member.volunteer_id
        member.volunteer_id = payload.volunteer_id
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="FAMILY_MEMBER_VOLUNTEER_LINK_CHANGED",
                entity_type="family_member",
                entity_id=member.id,
                event_metadata={
                    "family_id": str(family_id),
                    "previous_volunteer_id": str(previous_id) if previous_id else None,
                    "new_volunteer_id": str(payload.volunteer_id) if payload.volunteer_id else None,
                },
            )
        )
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
