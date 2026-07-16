"""Add core identity models.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

USER_STATUS = postgresql.ENUM(
    "INVITED",
    "ACTIVE",
    "DISABLED",
    name="user_status",
    create_type=False,
)
PLATFORM_ROLE = postgresql.ENUM(
    "PLATFORM_OPERATOR",
    name="platform_role",
    create_type=False,
)
STAFF_ROLE = postgresql.ENUM(
    "ADMIN",
    "KOORDINATION",
    "KIOSK",
    "VORSTAND_LESEN",
    name="staff_role",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    USER_STATUS.create(bind, checkfirst=True)
    PLATFORM_ROLE.create(bind, checkfirst=True)
    STAFF_ROLE.create(bind, checkfirst=True)

    op.create_table(
        "user",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("email_normalized", sa.String(320), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column(
            "status",
            USER_STATUS,
            nullable=False,
            server_default="INVITED",
        ),
        sa.Column("platform_role", PLATFORM_ROLE, nullable=True),
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_user_email_normalized", "user", ["email_normalized"], unique=True)

    op.create_table(
        "staff_membership",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role", STAFF_ROLE, nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("scope", sa.String(100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
    )
    op.create_index(
        "ix_staff_membership_organization_user",
        "staff_membership",
        ["organization_id", "user_id"],
        unique=False,
    )
    op.create_index(
        "ix_staff_membership_organization_role",
        "staff_membership",
        ["organization_id", "role", "active"],
        unique=False,
    )
    op.create_index(
        "uq_staff_membership_active_organization_user",
        "staff_membership",
        ["organization_id", "user_id"],
        unique=True,
        postgresql_where=sa.text("active"),
    )

    op.create_table(
        "audit_event",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=True),
        sa.Column("actor_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(100), nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "metadata",
            JSONB,
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"]),
        sa.ForeignKeyConstraint(["actor_user_id"], ["user.id"]),
    )
    op.create_index(
        "ix_audit_event_organization_created_at",
        "audit_event",
        ["organization_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_audit_event_entity",
        "audit_event",
        ["entity_type", "entity_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_audit_event_entity", table_name="audit_event")
    op.drop_index("ix_audit_event_organization_created_at", table_name="audit_event")
    op.drop_table("audit_event")
    op.drop_index(
        "uq_staff_membership_active_organization_user",
        table_name="staff_membership",
        postgresql_where=sa.text("active"),
    )
    op.drop_index("ix_staff_membership_organization_role", table_name="staff_membership")
    op.drop_index("ix_staff_membership_organization_user", table_name="staff_membership")
    op.drop_table("staff_membership")
    op.drop_index("ix_user_email_normalized", table_name="user")
    op.drop_table("user")

    bind = op.get_bind()
    STAFF_ROLE.drop(bind, checkfirst=True)
    PLATFORM_ROLE.drop(bind, checkfirst=True)
    USER_STATUS.drop(bind, checkfirst=True)
