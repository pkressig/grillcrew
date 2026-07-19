"""Add organization club years and seasons.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PLANNING_STATUS = ENUM(
    "DRAFT", "ACTIVE", "CLOSED", "ARCHIVED", name="planning_status", create_type=False
)
SEASON_TYPE = ENUM("AUTUMN", "SPRING", "OTHER", name="season_type", create_type=False)


def upgrade() -> None:
    PLANNING_STATUS.create(op.get_bind(), checkfirst=True)
    SEASON_TYPE.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "club_year",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", PLANNING_STATUS, nullable=False, server_default="DRAFT"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("start_date <= end_date", name=op.f("ck_club_year_date_range")),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_club_year_organization_dates",
        "club_year",
        ["organization_id", "start_date", "end_date"],
    )
    op.create_table(
        "season",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("club_year_id", UUID(as_uuid=True), nullable=False),
        sa.Column("type", SEASON_TYPE, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", PLANNING_STATUS, nullable=False, server_default="DRAFT"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("start_date <= end_date", name=op.f("ck_season_date_range")),
        sa.ForeignKeyConstraint(["club_year_id"], ["club_year.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_season_club_year_dates", "season", ["club_year_id", "start_date", "end_date"]
    )


def downgrade() -> None:
    op.drop_index("ix_season_club_year_dates", table_name="season")
    op.drop_table("season")
    op.drop_index("ix_club_year_organization_dates", table_name="club_year")
    op.drop_table("club_year")
    SEASON_TYPE.drop(op.get_bind(), checkfirst=True)
    PLANNING_STATUS.drop(op.get_bind(), checkfirst=True)
