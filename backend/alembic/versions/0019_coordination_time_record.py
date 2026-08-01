"""Add private coordination time records.

Revision ID: 0019
Revises: 0018
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PAYOUT_STATUS = postgresql.ENUM("OPEN", "APPROVED", "PAID", name="payout_status", create_type=False)


def upgrade() -> None:
    op.create_table(
        "coordination_time_record",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("hourly_rate_minor", sa.Integer(), nullable=False),
        sa.Column("payout_amount_minor", sa.Integer(), nullable=False),
        sa.Column("payout_status", PAYOUT_STATUS, server_default="OPEN", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("signature_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("signature_received_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("signature_note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("duration_minutes > 0", name="ck_coordination_time_duration_positive"),
        sa.CheckConstraint(
            "hourly_rate_minor >= 0", name="ck_coordination_time_hourly_rate_non_negative"
        ),
        sa.CheckConstraint(
            "payout_amount_minor >= 0", name="ck_coordination_time_amount_non_negative"
        ),
        sa.CheckConstraint(
            "signature_received_at IS NOT NULL OR signature_received_by_user_id IS NULL",
            name="ck_coordination_time_signature_actor_requires_receipt",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["signature_received_by_user_id"], ["user.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_coordination_time_record_organization_date",
        "coordination_time_record",
        ["organization_id", "work_date"],
    )
    op.create_index(
        "ix_coordination_time_record_organization_status",
        "coordination_time_record",
        ["organization_id", "payout_status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_coordination_time_record_organization_status", table_name="coordination_time_record"
    )
    op.drop_index(
        "ix_coordination_time_record_organization_date", table_name="coordination_time_record"
    )
    op.drop_table("coordination_time_record")
