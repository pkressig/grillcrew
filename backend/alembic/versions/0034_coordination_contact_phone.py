"""Add coordination_contact_phone so late self-cancel guidance can offer a
direct call/WhatsApp link alongside the existing text label.

Revision ID: 0034
Revises: 0033
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organization_settings",
        sa.Column("coordination_contact_phone", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organization_settings", "coordination_contact_phone")
