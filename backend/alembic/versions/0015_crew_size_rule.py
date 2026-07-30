"""Add organization-scoped crew-size/menu suggestion rules.

Revision ID: 0015
Revises: 0014
Create Date: 2026-07-30
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MENU_TYPE = ENUM("FRIES_NUGGETS", "FRIES_NUGGETS_BURGER", name="menu_type", create_type=False)


def upgrade() -> None:
    MENU_TYPE.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "crew_size_rule",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("pattern", sa.String(200), nullable=True),
        sa.Column("menu_type", MENU_TYPE, nullable=False),
        sa.Column("required_griller_count", sa.Integer(), nullable=False),
        sa.Column("min_games_per_shift", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
        sa.CheckConstraint(
            "required_griller_count > 0", name=op.f("ck_crew_size_rule_griller_count_positive")
        ),
    )
    op.create_index(
        "ix_crew_size_rule_organization_sort", "crew_size_rule", ["organization_id", "sort_order"]
    )


def downgrade() -> None:
    op.drop_index("ix_crew_size_rule_organization_sort", table_name="crew_size_rule")
    op.drop_table("crew_size_rule")
    MENU_TYPE.drop(op.get_bind(), checkfirst=True)
