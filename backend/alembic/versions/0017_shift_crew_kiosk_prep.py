"""Add shift crew-size suggestion fields and Kiosk-prep columns.

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM

from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SHIFT_TYPE = ENUM("GRILL", "KIOSK", name="shift_type", create_type=False)
SHIFT_ASSIGNMENT_MODE = ENUM(
    "OPEN_SIGNUP", "FIXED_ASSIGNMENT", name="shift_assignment_mode", create_type=False
)
MENU_TYPE = ENUM("FRIES_NUGGETS", "FRIES_NUGGETS_BURGER", name="menu_type", create_type=False)


def upgrade() -> None:
    SHIFT_TYPE.create(op.get_bind(), checkfirst=True)
    SHIFT_ASSIGNMENT_MODE.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "shift",
        sa.Column("shift_type", SHIFT_TYPE, nullable=False, server_default="GRILL"),
    )
    op.add_column(
        "shift",
        sa.Column(
            "assignment_mode",
            SHIFT_ASSIGNMENT_MODE,
            nullable=False,
            server_default="OPEN_SIGNUP",
        ),
    )
    op.add_column("shift", sa.Column("menu_type", MENU_TYPE, nullable=True))
    op.add_column(
        "shift",
        sa.Column(
            "crew_suggestion_overridden",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("shift", "crew_suggestion_overridden")
    op.drop_column("shift", "menu_type")
    op.drop_column("shift", "assignment_mode")
    op.drop_column("shift", "shift_type")

    SHIFT_ASSIGNMENT_MODE.drop(op.get_bind(), checkfirst=True)
    SHIFT_TYPE.drop(op.get_bind(), checkfirst=True)
