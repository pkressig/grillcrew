"""Link helper family members to existing volunteers.

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-29
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("family_member", sa.Column("volunteer_id", UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_family_member_volunteer_id_volunteer",
        "family_member",
        "volunteer",
        ["volunteer_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_family_member_volunteer_id", "family_member", ["volunteer_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_family_member_volunteer_id", table_name="family_member")
    op.drop_constraint(
        "fk_family_member_volunteer_id_volunteer", "family_member", type_="foreignkey"
    )
    op.drop_column("family_member", "volunteer_id")
