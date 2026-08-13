"""Organization-scoped family, family-member, and admin volunteer management."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.security.password import hash_password, validate_password_policy
from app.models.family import Family, FamilyMember, FamilyMemberType, FamilyStatus
from app.models.identity import AuditEvent, RefreshToken, User, UserStatus
from app.models.planning import SignupSource, Volunteer, VolunteerStatus
from app.schemas.family import (
    FamilyCreate,
    FamilyMemberCreate,
    FamilyMemberVolunteerUpdate,
    VolunteerAdminUpdate,
    VolunteerCreate,
)
from app.services.auth import PasswordResetIssue, PasswordResetService
from app.services.public_signup import normalize_email, normalize_phone


class FamilyNotFoundError(Exception):
    pass


class FamilyMemberNotFoundError(Exception):
    pass


class FamilyMemberLinkError(Exception):
    pass


class VolunteerNotFoundError(Exception):
    pass


class VolunteerHasNoAccountError(Exception):
    """Raised when a password action targets a volunteer without a login account."""


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
            team_name=payload.team_name,
        )
        self.db.add(member)
        self.db.commit()
        self.db.refresh(member)
        return member

    def list_active_children(self) -> list[tuple[FamilyMember, Family]]:
        statement = (
            select(FamilyMember, Family)
            .join(Family, FamilyMember.family_id == Family.id)
            .where(
                Family.organization_id == self.organization_id,
                Family.status == FamilyStatus.ACTIVE,
                FamilyMember.member_type == FamilyMemberType.CHILD,
            )
            .order_by(Family.display_name, FamilyMember.last_name, FamilyMember.first_name)
        )
        return [(member, family) for member, family in self.db.execute(statement)]

    def list_family_volunteers(self) -> list[Volunteer]:
        linked_to_tenant_family = (
            select(FamilyMember.id)
            .join(Family, Family.id == FamilyMember.family_id)
            .where(
                FamilyMember.volunteer_id == Volunteer.id,
                Family.organization_id == self.organization_id,
            )
            .exists()
        )
        return list(
            self.db.scalars(
                select(Volunteer)
                .where(
                    Volunteer.organization_id == self.organization_id,
                    (Volunteer.status == VolunteerStatus.ACTIVE) | linked_to_tenant_family,
                )
                .order_by(Volunteer.last_name, Volunteer.first_name, Volunteer.id)
            )
        )

    def list_all_volunteers(self) -> list[tuple[Volunteer, str | None]]:
        """Every org volunteer regardless of status or family link, for the admin Helfer list.

        Broader than `list_family_volunteers` (which intentionally hides fully-inactive,
        unlinked volunteers for the existing family-detail linking picker); this method backs
        a distinct route so that existing contract is not silently changed.
        """
        family_name_subquery = (
            select(Family.display_name)
            .join(FamilyMember, FamilyMember.family_id == Family.id)
            .where(
                FamilyMember.volunteer_id == Volunteer.id,
                Family.organization_id == self.organization_id,
            )
            .order_by(Family.display_name)
            .limit(1)
            .correlate(Volunteer)
            .scalar_subquery()
        )
        statement = (
            select(Volunteer, family_name_subquery.label("family_display_name"))
            .where(Volunteer.organization_id == self.organization_id)
            .order_by(Volunteer.last_name, Volunteer.first_name, Volunteer.id)
        )
        return [(volunteer, family_name) for volunteer, family_name in self.db.execute(statement)]

    def get_volunteer(self, volunteer_id: uuid.UUID) -> Volunteer:
        volunteer = self.db.scalar(
            select(Volunteer).where(
                Volunteer.id == volunteer_id,
                Volunteer.organization_id == self.organization_id,
            )
        )
        if volunteer is None:
            raise VolunteerNotFoundError
        return volunteer

    def create_volunteer(self, payload: VolunteerCreate, actor_user_id: uuid.UUID) -> Volunteer:
        if payload.compensation_family_member_id is not None:
            self._get_active_child(payload.compensation_family_member_id)
        volunteer = Volunteer(
            organization_id=self.organization_id,
            user_id=None,
            first_name=payload.first_name,
            last_name=payload.last_name,
            phone_normalized=normalize_phone(payload.phone),
            phone_display=payload.phone,
            email_normalized=normalize_email(payload.email),
            email_display=payload.email,
            status=payload.status,
            created_from=SignupSource.ADMIN,
            internal_note=payload.internal_note,
            compensation_preference=payload.compensation_preference,
            compensation_family_member_id=payload.compensation_family_member_id,
        )
        self.db.add(volunteer)
        self.db.flush()
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="VOLUNTEER_CREATED_BY_ADMIN",
                entity_type="volunteer",
                entity_id=volunteer.id,
                event_metadata={},
            )
        )
        self.db.commit()
        self.db.refresh(volunteer)
        return volunteer

    def update_volunteer(
        self,
        volunteer_id: uuid.UUID,
        payload: VolunteerAdminUpdate,
        actor_user_id: uuid.UUID,
    ) -> Volunteer:
        volunteer = self.get_volunteer(volunteer_id)
        if payload.compensation_family_member_id is not None:
            self._get_active_child(payload.compensation_family_member_id)
        new_phone_normalized = normalize_phone(payload.phone)
        new_email_normalized = normalize_email(payload.email)
        field_changes = (
            ("first_name", volunteer.first_name != payload.first_name),
            ("last_name", volunteer.last_name != payload.last_name),
            ("phone", volunteer.phone_normalized != new_phone_normalized),
            ("email", volunteer.email_normalized != new_email_normalized),
            (
                "compensation_preference",
                volunteer.compensation_preference != payload.compensation_preference,
            ),
            (
                "compensation_family_member_id",
                volunteer.compensation_family_member_id != payload.compensation_family_member_id,
            ),
            ("internal_note", volunteer.internal_note != payload.internal_note),
            ("status", volunteer.status != payload.status),
        )
        changed_fields = [field for field, changed in field_changes if changed]
        if not changed_fields:
            return volunteer
        volunteer.first_name = payload.first_name
        volunteer.last_name = payload.last_name
        volunteer.phone_normalized = new_phone_normalized
        volunteer.phone_display = payload.phone
        volunteer.email_normalized = new_email_normalized
        volunteer.email_display = payload.email
        volunteer.compensation_preference = payload.compensation_preference
        volunteer.compensation_family_member_id = payload.compensation_family_member_id
        volunteer.internal_note = payload.internal_note
        volunteer.status = payload.status
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="VOLUNTEER_PROFILE_UPDATED_BY_ADMIN",
                entity_type="volunteer",
                entity_id=volunteer.id,
                event_metadata={"changed_fields": changed_fields},
            )
        )
        self.db.commit()
        self.db.refresh(volunteer)
        return volunteer

    def get_volunteer_family(
        self, volunteer_id: uuid.UUID
    ) -> tuple[Family, list[tuple[FamilyMember, Volunteer | None]]] | None:
        """Reverse lookup: volunteer -> HELPER FamilyMember (if any) -> its family and members."""
        volunteer = self.get_volunteer(volunteer_id)
        membership = self.db.scalar(
            select(FamilyMember)
            .join(Family, Family.id == FamilyMember.family_id)
            .where(
                FamilyMember.volunteer_id == volunteer.id,
                Family.organization_id == self.organization_id,
                Family.status == FamilyStatus.ACTIVE,
            )
        )
        if membership is None:
            return None
        family = self._get_active_family(membership.family_id)
        rows = self.db.execute(
            select(FamilyMember, Volunteer)
            .outerjoin(Volunteer, Volunteer.id == FamilyMember.volunteer_id)
            .where(FamilyMember.family_id == family.id)
            .order_by(
                FamilyMember.member_type,
                FamilyMember.last_name,
                FamilyMember.first_name,
                FamilyMember.id,
            )
        )
        return family, [(member, linked) for member, linked in rows]

    def get_volunteer_with_account(self, volunteer_id: uuid.UUID) -> Volunteer:
        volunteer = self.get_volunteer(volunteer_id)
        if volunteer.user_id is None:
            raise VolunteerHasNoAccountError
        return volunteer

    def send_volunteer_password_reset(
        self, volunteer_id: uuid.UUID, actor_user_id: uuid.UUID, settings: Settings
    ) -> PasswordResetIssue | None:
        volunteer = self.get_volunteer_with_account(volunteer_id)
        issue = PasswordResetService(self.db, settings).request_reset(
            email=volunteer.email_normalized
        )
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="VOLUNTEER_PASSWORD_RESET_REQUESTED_BY_ADMIN",
                entity_type="volunteer",
                entity_id=volunteer.id,
                event_metadata={},
            )
        )
        self.db.commit()
        return issue

    def set_volunteer_password(
        self,
        volunteer_id: uuid.UUID,
        new_password: str,
        actor_user_id: uuid.UUID,
        *,
        minimum_length: int = 10,
    ) -> None:
        volunteer = self.get_volunteer_with_account(volunteer_id)
        validate_password_policy(new_password, minimum_length=minimum_length)
        user = self.db.scalar(select(User).where(User.id == volunteer.user_id))
        if user is None or user.status != UserStatus.ACTIVE:
            raise VolunteerHasNoAccountError
        now = datetime.now(UTC)
        user.password_hash = hash_password(new_password)
        self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="VOLUNTEER_PASSWORD_SET_BY_ADMIN",
                entity_type="volunteer",
                entity_id=volunteer.id,
                event_metadata={},
            )
        )
        self.db.commit()

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

    def _get_active_child(self, family_member_id: uuid.UUID) -> FamilyMember:
        child = self.db.scalar(
            select(FamilyMember)
            .join(Family, Family.id == FamilyMember.family_id)
            .where(
                FamilyMember.id == family_member_id,
                FamilyMember.member_type == FamilyMemberType.CHILD,
                Family.organization_id == self.organization_id,
                Family.status == FamilyStatus.ACTIVE,
            )
        )
        if child is None:
            raise FamilyMemberLinkError("invalid child member")
        return child
