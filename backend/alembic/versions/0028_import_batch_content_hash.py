"""Add content_sha256 to import_batch for retry-safe idempotent staging."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0028"
down_revision = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "import_batch",
        sa.Column("content_sha256", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_import_batch_dedupe",
        "import_batch",
        ["organization_id", "club_year_id", "content_sha256", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_import_batch_dedupe", table_name="import_batch")
    op.drop_column("import_batch", "content_sha256")
