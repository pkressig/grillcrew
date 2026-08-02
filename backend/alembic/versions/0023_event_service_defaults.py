"""Add optional event service decisions and timing defaults.

Revision ID: 0023
Revises: 0022
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0023"
down_revision = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "organization_settings",
        sa.Column("kiosk_lead_minutes", sa.Integer(), nullable=False, server_default="30"),
    )
    op.add_column(
        "organization_settings",
        sa.Column("kiosk_trail_minutes", sa.Integer(), nullable=False, server_default="30"),
    )
    op.add_column(
        "organization_settings",
        sa.Column(
            "default_game_duration_minutes", sa.Integer(), nullable=False, server_default="90"
        ),
    )
    op.create_check_constraint(
        "ck_organization_settings_kiosk_lead_nonnegative",
        "organization_settings",
        "kiosk_lead_minutes >= 0",
    )
    op.create_check_constraint(
        "ck_organization_settings_kiosk_trail_nonnegative",
        "organization_settings",
        "kiosk_trail_minutes >= 0",
    )
    op.create_check_constraint(
        "ck_organization_settings_game_duration_positive",
        "organization_settings",
        "default_game_duration_minutes > 0",
    )
    op.add_column("event", sa.Column("duration_minutes", sa.Integer(), nullable=True))
    op.add_column("event", sa.Column("kiosk_requested", sa.Boolean(), nullable=True))
    op.add_column("event", sa.Column("grill_requested", sa.Boolean(), nullable=True))
    op.create_check_constraint(
        "ck_event_duration_positive", "event", "duration_minutes IS NULL OR duration_minutes > 0"
    )


def downgrade() -> None:
    op.drop_constraint("ck_event_duration_positive", "event", type_="check")
    op.drop_column("event", "grill_requested")
    op.drop_column("event", "kiosk_requested")
    op.drop_column("event", "duration_minutes")
    op.drop_constraint(
        "ck_organization_settings_game_duration_positive", "organization_settings", type_="check"
    )
    op.drop_constraint(
        "ck_organization_settings_kiosk_trail_nonnegative", "organization_settings", type_="check"
    )
    op.drop_constraint(
        "ck_organization_settings_kiosk_lead_nonnegative", "organization_settings", type_="check"
    )
    op.drop_column("organization_settings", "default_game_duration_minutes")
    op.drop_column("organization_settings", "kiosk_trail_minutes")
    op.drop_column("organization_settings", "kiosk_lead_minutes")
