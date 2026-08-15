"""Add banner_url to theme for an optional wide hero image on public pages.

Revision ID: 0032
Revises: 0031
Create Date: 2026-08-15
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "theme",
        sa.Column("banner_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("theme", "banner_url")
