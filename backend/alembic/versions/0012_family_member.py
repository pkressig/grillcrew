"""Add unified name-only family members.

Revision ID: 0012
Revises: 0011
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FAMILY_MEMBER_TYPE = ENUM("CHILD", "HELPER", name="family_member_type", create_type=False)


def upgrade() -> None:
    FAMILY_MEMBER_TYPE.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "family_member",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("family_id", UUID(as_uuid=True), nullable=False),
        sa.Column("member_type", FAMILY_MEMBER_TYPE, nullable=False),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(["family_id"], ["family.id"], ondelete="RESTRICT"),
    )
    op.create_index(
        "ix_family_member_family_name",
        "family_member",
        ["family_id", "last_name", "first_name", "member_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_family_member_family_name", table_name="family_member")
    op.drop_table("family_member")
    FAMILY_MEMBER_TYPE.drop(op.get_bind(), checkfirst=True)
