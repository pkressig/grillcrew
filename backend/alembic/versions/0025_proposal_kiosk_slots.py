"""Store the configured number of kiosk shifts per proposal."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0025"
down_revision = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "proposal_override", sa.Column("proposed_kiosk_slots", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("proposal_override", "proposed_kiosk_slots")
