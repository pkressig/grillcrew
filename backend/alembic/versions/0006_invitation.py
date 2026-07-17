"""Add organization invitation table.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, UUID

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "invitation",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "role",
            ENUM(
                "ADMIN",
                "KOORDINATION",
                "KIOSK",
                "VORSTAND_LESEN",
                name="staff_role",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
    )
    op.create_index("ix_invitation_token_hash", "invitation", ["token_hash"], unique=True)
    op.create_index(
        "ix_invitation_organization_created_at",
        "invitation",
        ["organization_id", "created_at"],
    )
    op.create_index("ix_invitation_user_id", "invitation", ["user_id"])
    op.create_index("ix_invitation_expires_at", "invitation", ["expires_at"])
    op.create_index(
        "uq_invitation_pending_organization_user",
        "invitation",
        ["organization_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("accepted_at IS NULL AND revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_invitation_pending_organization_user", table_name="invitation")
    op.drop_index("ix_invitation_expires_at", table_name="invitation")
    op.drop_index("ix_invitation_user_id", table_name="invitation")
    op.drop_index("ix_invitation_organization_created_at", table_name="invitation")
    op.drop_index("ix_invitation_token_hash", table_name="invitation")
    op.drop_table("invitation")
