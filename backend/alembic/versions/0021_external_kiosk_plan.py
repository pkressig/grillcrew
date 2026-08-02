"""Add review-only external kiosk plan staging.

Revision ID: 0021
Revises: 0020
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATEGORY = postgresql.ENUM("KIOSK", "GRILL", name="external_kiosk_category", create_type=False)
REVIEW_STATE = postgresql.ENUM(
    "PENDING", "ACKNOWLEDGED", "OVERRIDDEN", name="external_kiosk_review_state", create_type=False
)


def upgrade() -> None:
    CATEGORY.create(op.get_bind(), checkfirst=True)
    REVIEW_STATE.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "external_kiosk_batch",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_filename", sa.String(255), nullable=False),
        sa.Column("source_sheet", sa.String(100), nullable=False),
        sa.Column("content_sha256", sa.String(64), nullable=False),
        sa.Column("uploaded_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["user.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "content_sha256", name="uq_external_kiosk_batch_org_hash"
        ),
    )
    op.create_index(
        "ix_external_kiosk_batch_organization_uploaded",
        "external_kiosk_batch",
        ["organization_id", "uploaded_at"],
    )
    op.create_table(
        "external_kiosk_row",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("batch_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_row", sa.Integer(), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("category", CATEGORY, nullable=False),
        sa.Column("assigned_person_text", sa.Text(), nullable=True),
        sa.Column("source_note", sa.Text(), nullable=True),
        sa.Column("raw_date", sa.Text(), nullable=False),
        sa.Column("raw_time", sa.Text(), nullable=False),
        sa.Column("acknowledged", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("acknowledged_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_state", REVIEW_STATE, server_default="PENDING", nullable=False),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["batch_id"], ["external_kiosk_batch.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["acknowledged_by_user_id"], ["user.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_external_kiosk_row_batch_date", "external_kiosk_row", ["batch_id", "plan_date"]
    )


def downgrade() -> None:
    op.drop_index("ix_external_kiosk_row_batch_date", table_name="external_kiosk_row")
    op.drop_table("external_kiosk_row")
    op.drop_index(
        "ix_external_kiosk_batch_organization_uploaded", table_name="external_kiosk_batch"
    )
    op.drop_table("external_kiosk_batch")
    CATEGORY.drop(op.get_bind(), checkfirst=True)
    REVIEW_STATE.drop(op.get_bind(), checkfirst=True)
