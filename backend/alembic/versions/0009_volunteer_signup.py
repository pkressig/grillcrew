"""Add volunteers and public shift signups.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

VOLUNTEER_STATUS = ENUM("ACTIVE", "INACTIVE", name="volunteer_status", create_type=False)
SIGNUP_STATUS = ENUM(
    "ACTIVE",
    "CANCELLED_BY_VOLUNTEER",
    "CANCELLED_BY_ADMIN",
    name="signup_status",
    create_type=False,
)
SIGNUP_OUTCOME = ENUM(
    "OPEN",
    "ATTENDED",
    "EXCUSED_CANCELLED",
    "LATE_CANCELLED",
    "NO_SHOW",
    "SUBSTITUTE_ORGANIZED",
    name="signup_outcome",
    create_type=False,
)
SIGNUP_SOURCE = ENUM("PUBLIC_SIGNUP", "ADMIN", "IMPORT", name="signup_source", create_type=False)


def upgrade() -> None:
    for enum in (VOLUNTEER_STATUS, SIGNUP_STATUS, SIGNUP_OUTCOME, SIGNUP_SOURCE):
        enum.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "volunteer",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("phone_normalized", sa.String(32), nullable=False),
        sa.Column("phone_display", sa.String(50), nullable=False),
        sa.Column("email_normalized", sa.String(255), nullable=False),
        sa.Column("email_display", sa.String(255), nullable=False),
        sa.Column("public_display_consent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", VOLUNTEER_STATUS, nullable=False, server_default="ACTIVE"),
        sa.Column("created_from", SIGNUP_SOURCE, nullable=False),
        sa.Column("internal_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_volunteer_organization_email", "volunteer", ["organization_id", "email_normalized"]
    )
    op.create_index(
        "ix_volunteer_organization_phone", "volunteer", ["organization_id", "phone_normalized"]
    )
    op.create_table(
        "signup",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("shift_id", UUID(as_uuid=True), nullable=False),
        sa.Column("volunteer_id", UUID(as_uuid=True), nullable=False),
        sa.Column("public_name_snapshot", sa.String(201), nullable=False),
        sa.Column("status", SIGNUP_STATUS, nullable=False, server_default="ACTIVE"),
        sa.Column("outcome", SIGNUP_OUTCOME, nullable=False, server_default="OPEN"),
        sa.Column("source", SIGNUP_SOURCE, nullable=False),
        sa.Column("management_token_hash", sa.String(64), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["shift_id"], ["shift.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["volunteer_id"], ["volunteer.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_signup_shift_status", "signup", ["shift_id", "status"])
    op.create_index("ix_signup_volunteer_shift", "signup", ["volunteer_id", "shift_id"])


def downgrade() -> None:
    op.drop_index("ix_signup_volunteer_shift", table_name="signup")
    op.drop_index("ix_signup_shift_status", table_name="signup")
    op.drop_table("signup")
    op.drop_index("ix_volunteer_organization_phone", table_name="volunteer")
    op.drop_index("ix_volunteer_organization_email", table_name="volunteer")
    op.drop_table("volunteer")
    for enum in (SIGNUP_SOURCE, SIGNUP_OUTCOME, SIGNUP_STATUS, VOLUNTEER_STATUS):
        enum.drop(op.get_bind(), checkfirst=True)
