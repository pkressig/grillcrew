"""Add per-signup compensation type and credited child, editable by the volunteer.

Compensation type is chosen per work record, not globally per person (see
CLAUDE.md Product Principles). Volunteer.compensation_preference remains the
default for new signups, but a volunteer may now override it per shift -
before attendance is recorded, distinct from the admin-only, post-attendance
WorkRecord.compensation_type classification.

Revision ID: 0033
Revises: 0032
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "signup",
        sa.Column(
            "compensation_type",
            postgresql.ENUM(
                "WORK_HOURS",
                "VOLUNTARY",
                "PAYOUT",
                name="volunteer_compensation",
                create_type=False,
            ),
            nullable=True,
        ),
    )
    op.add_column(
        "signup",
        sa.Column("credited_family_member_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_signup_credited_family_member_id",
        "signup",
        "family_member",
        ["credited_family_member_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_signup_credited_family_member_id", "signup", type_="foreignkey")
    op.drop_column("signup", "credited_family_member_id")
    op.drop_column("signup", "compensation_type")
