"""Add signup cancellation metadata.

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("signup", sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("signup", sa.Column("cancellation_reason", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("signup", "cancellation_reason")
    op.drop_column("signup", "cancelled_at")
