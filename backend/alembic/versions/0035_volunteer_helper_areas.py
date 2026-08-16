"""Add is_grill_helper/is_kiosk_helper so a volunteer can be categorized for
the Grill and/or Kiosk rosters, powering the Kiosk planning assignment
dropdown and the Helfer list filter.

Revision ID: 0035
Revises: 0034
Create Date: 2026-08-17
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "volunteer",
        sa.Column("is_grill_helper", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "volunteer",
        sa.Column("is_kiosk_helper", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("volunteer", "is_kiosk_helper")
    op.drop_column("volunteer", "is_grill_helper")
