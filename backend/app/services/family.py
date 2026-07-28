"""Organization-scoped family creation and active-family listing."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.family import Family, FamilyStatus
from app.schemas.family import FamilyCreate


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
