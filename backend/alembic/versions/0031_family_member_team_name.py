"""Add team_name to family_member for child team affiliation (Mannschaft).

Revision ID: 0031
Revises: 0030
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "family_member",
        sa.Column("team_name", sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("family_member", "team_name")
