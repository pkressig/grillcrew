"""Add work_record table for retroactive child assignment and compensation classification.

F015 Phase 4A / D-041 point 6 and 8.

Revision ID: 0018
Revises: 0017
Create Date: 2026-08-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COMPENSATION_TYPE = ENUM(
    "WORK_HOURS", "VOLUNTARY", "PAYOUT", name="compensation_type", create_type=False
)
PAYOUT_STATUS = ENUM("OPEN", "APPROVED", "PAID", name="payout_status", create_type=False)


def upgrade() -> None:
    COMPENSATION_TYPE.create(op.get_bind(), checkfirst=True)
    PAYOUT_STATUS.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "work_record",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "organization_id",
            UUID(as_uuid=True),
            sa.ForeignKey("organization.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "signup_id",
            UUID(as_uuid=True),
            sa.ForeignKey("signup.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "volunteer_id",
            UUID(as_uuid=True),
            sa.ForeignKey("volunteer.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "credited_family_member_id",
            UUID(as_uuid=True),
            sa.ForeignKey("family_member.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("compensation_type", COMPENSATION_TYPE, nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("payout_rate_minor_per_hour", sa.Integer(), nullable=True),
        sa.Column("payout_amount_minor", sa.Integer(), nullable=True),
        sa.Column("payout_status", PAYOUT_STATUS, nullable=True),
        sa.Column("signature_received_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "signature_confirmed_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("signup_id", name="uq_work_record_signup_id"),
        sa.CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes >= 0",
            name="ck_work_record_duration_non_negative",
        ),
        sa.CheckConstraint(
            "compensation_type <> 'PAYOUT' OR ("
            "duration_minutes IS NOT NULL AND duration_minutes > 0 "
            "AND payout_rate_minor_per_hour IS NOT NULL "
            "AND payout_amount_minor IS NOT NULL "
            "AND payout_status IS NOT NULL)",
            name="ck_work_record_payout_requires_fields",
        ),
        sa.CheckConstraint(
            "compensation_type = 'PAYOUT' OR ("
            "payout_rate_minor_per_hour IS NULL "
            "AND payout_amount_minor IS NULL "
            "AND payout_status IS NULL)",
            name="ck_work_record_non_payout_has_no_payout_fields",
        ),
        sa.CheckConstraint(
            "payout_status IS NOT NULL OR ("
            "signature_received_at IS NULL AND signature_confirmed_by_user_id IS NULL)",
            name="ck_work_record_signature_requires_payout",
        ),
    )
    op.create_index("ix_work_record_organization_id", "work_record", ["organization_id"])
    op.create_index(
        "ix_work_record_credited_family_member_id", "work_record", ["credited_family_member_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_work_record_credited_family_member_id", table_name="work_record")
    op.drop_index("ix_work_record_organization_id", table_name="work_record")
    op.drop_table("work_record")

    PAYOUT_STATUS.drop(op.get_bind(), checkfirst=True)
    COMPENSATION_TYPE.drop(op.get_bind(), checkfirst=True)
