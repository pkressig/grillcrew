"""Persist kiosk/grill proposal confirmations."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0024"
down_revision = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "proposal_override",
        sa.Column("kiosk_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "proposal_override",
        sa.Column("grill_confirmed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("proposal_override", "grill_confirmed")
    op.drop_column("proposal_override", "kiosk_confirmed")
