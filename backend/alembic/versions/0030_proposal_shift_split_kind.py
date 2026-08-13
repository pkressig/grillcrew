"""Add shift_type to proposal_shift_split so Kiosk and Grill splits coexist.

Revision ID: 0030
Revises: 0029
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

from alembic import op

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The "shift_type" enum type already exists (created in 0017 for shift.shift_type);
# proposal_shift_split reuses it rather than creating a second type.
SHIFT_TYPE = ENUM("GRILL", "KIOSK", name="shift_type", create_type=False)


def upgrade() -> None:
    op.add_column(
        "proposal_shift_split",
        sa.Column("shift_type", SHIFT_TYPE, nullable=False, server_default="GRILL"),
    )


def downgrade() -> None:
    op.drop_column("proposal_shift_split", "shift_type")
