"""Add configurable volunteer password minimum length."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0027"
down_revision = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organization_settings",
        sa.Column(
            "volunteer_password_min_length", sa.Integer(), nullable=False, server_default="6"
        ),
    )


def downgrade() -> None:
    op.drop_column("organization_settings", "volunteer_password_min_length")
