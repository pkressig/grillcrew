"""Add read-only OneDrive sync configuration and run history.

Revision ID: 0022
Revises: 0021
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None
STATUS = postgresql.ENUM(
    "RUNNING",
    "SUCCESS",
    "FAILED",
    "SKIPPED_UNCHANGED",
    name="onedrive_sync_status",
    create_type=False,
)


def upgrade() -> None:
    STATUS.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "onedrive_sync_config",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("club_year_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scheduler_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_url", sa.String(2048), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("daily_time", sa.Time(), server_default="03:00:00", nullable=False),
        sa.Column("import_start_date", sa.Date(), nullable=False),
        sa.Column("import_end_date", sa.Date()),
        sa.Column("future_only", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["club_year_id"], ["club_year.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["scheduler_user_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", name="uq_onedrive_sync_config_org"),
    )
    op.create_table(
        "onedrive_sync_run",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("config_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("triggered_by_user_id", postgresql.UUID(as_uuid=True)),
        sa.Column("import_batch_id", postgresql.UUID(as_uuid=True)),
        sa.Column("status", STATUS, nullable=False),
        sa.Column("source_filename", sa.String(255)),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("effective_start_date", sa.Date(), nullable=False),
        sa.Column("effective_end_date", sa.Date()),
        sa.Column("scheduled_date", sa.Date()),
        sa.Column("row_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("comparison_summary", postgresql.JSONB()),
        sa.Column("error_message", sa.String(1000)),
        sa.Column(
            "started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["config_id"], ["onedrive_sync_config.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batch.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("config_id", "scheduled_date", name="uq_onedrive_sync_run_daily_claim"),
    )
    op.create_index(
        "ix_onedrive_sync_run_org_started", "onedrive_sync_run", ["organization_id", "started_at"]
    )
    op.create_index(
        "uq_onedrive_sync_run_success_idempotency",
        "onedrive_sync_run",
        ["config_id", "content_sha256", "effective_start_date", "effective_end_date"],
        unique=True,
        postgresql_where=sa.text("status IN ('RUNNING', 'SUCCESS')"),
    )


def downgrade() -> None:
    op.drop_index("uq_onedrive_sync_run_success_idempotency", table_name="onedrive_sync_run")
    op.drop_index("ix_onedrive_sync_run_org_started", table_name="onedrive_sync_run")
    op.drop_table("onedrive_sync_run")
    op.drop_table("onedrive_sync_config")
    STATUS.drop(op.get_bind(), checkfirst=True)
