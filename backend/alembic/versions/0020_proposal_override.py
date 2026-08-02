"""Add private planning proposal overrides.

Revision ID: 0020
Revises: 0019
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "proposal_override",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("window_key", sa.String(64), nullable=False),
        sa.Column("proposal_date", sa.Date(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True)),
        sa.Column("ends_at", sa.DateTime(timezone=True)),
        sa.Column("kiosk_open", sa.Boolean()),
        sa.Column("grill_required", sa.Boolean()),
        sa.Column("proposed_grill_slots", sa.Integer()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "window_key", name="uq_proposal_override_organization_window"
        ),
    )
    op.create_index(
        "ix_proposal_override_organization_date",
        "proposal_override",
        ["organization_id", "proposal_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_proposal_override_organization_date", table_name="proposal_override")
    op.drop_table("proposal_override")
