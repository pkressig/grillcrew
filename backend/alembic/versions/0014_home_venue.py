"""Add organization-scoped home venue allowlist.

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "home_venue",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("name_normalized", sa.String(200), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_home_venue_organization_active", "home_venue", ["organization_id", "is_active"]
    )
    op.create_unique_constraint(
        "uq_home_venue_organization_name_normalized",
        "home_venue",
        ["organization_id", "name_normalized"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_home_venue_organization_name_normalized", "home_venue", type_="unique")
    op.drop_index("ix_home_venue_organization_active", table_name="home_venue")
    op.drop_table("home_venue")
