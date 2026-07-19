"""Add planning events and shifts.

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EVENT_STATUS = ENUM(
    "DRAFT",
    "PUBLISHED",
    "POSTPONED",
    "CANCELLED",
    "COMPLETED",
    name="event_status",
    create_type=False,
)
SHIFT_STATUS = ENUM("OPEN", "CLOSED", "CANCELLED", name="shift_status", create_type=False)


def upgrade() -> None:
    EVENT_STATUS.create(op.get_bind(), checkfirst=True)
    SHIFT_STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "event",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("season_id", UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("location", sa.String(200), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("public_description", sa.Text(), nullable=True),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column("status", EVENT_STATUS, nullable=False, server_default="DRAFT"),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_import_id", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["season_id"], ["season.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_event_season_date", "event", ["season_id", "date"])
    op.create_table(
        "shift",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("event_id", UUID(as_uuid=True), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("required_volunteers", sa.Integer(), nullable=False),
        sa.Column("public_note", sa.Text(), nullable=True),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column("status", SHIFT_STATUS, nullable=False, server_default="OPEN"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("starts_at < ends_at", name=op.f("ck_shift_time_range")),
        sa.CheckConstraint(
            "required_volunteers > 0", name=op.f("ck_shift_required_volunteers_positive")
        ),
        sa.ForeignKeyConstraint(["event_id"], ["event.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_shift_event_order", "shift", ["event_id", "sort_order", "starts_at"])


def downgrade() -> None:
    op.drop_index("ix_shift_event_order", table_name="shift")
    op.drop_table("shift")
    op.drop_index("ix_event_season_date", table_name="event")
    op.drop_table("event")
    SHIFT_STATUS.drop(op.get_bind(), checkfirst=True)
    EVENT_STATUS.drop(op.get_bind(), checkfirst=True)
