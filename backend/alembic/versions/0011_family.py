"""Add organization-scoped families.

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_STATUS = ENUM("ACTIVE", name="family_status", create_type=False)


def upgrade() -> None:
    FAMILY_STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "family",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("display_name", sa.String(160), nullable=False),
        sa.Column("status", FAMILY_STATUS, nullable=False, server_default="ACTIVE"),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_family_organization_status", "family", ["organization_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_family_organization_status", table_name="family")
    op.drop_table("family")
    FAMILY_STATUS.drop(op.get_bind(), checkfirst=True)
