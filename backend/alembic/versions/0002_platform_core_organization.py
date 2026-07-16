"""Add platform core theme/settings and seed first organization.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "theme",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("primary_color", sa.String(16), nullable=False, server_default="#262626"),
        sa.Column("secondary_color", sa.String(16), nullable=False, server_default="#525252"),
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
    op.create_table(
        "organization_settings",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "payout_rate_minor_per_hour",
            sa.Integer(),
            nullable=False,
            server_default="900",
        ),
        sa.Column(
            "signup_rate_limit_per_contact",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
        sa.Column(
            "signup_rate_limit_window_minutes",
            sa.Integer(),
            nullable=False,
            server_default="60",
        ),
        sa.Column("coordination_contact_label", sa.String(100), nullable=True),
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
        sa.UniqueConstraint("organization_id", name="uq_organization_settings_organization_id"),
    )

    op.add_column("organization", sa.Column("theme_id", UUID(as_uuid=True), nullable=True))
    op.add_column("organization", sa.Column("slug", sa.String(80), nullable=True))
    op.add_column("organization", sa.Column("custom_domain", sa.String(255), nullable=True))
    op.add_column(
        "organization",
        sa.Column("language", sa.String(16), nullable=False, server_default="de"),
    )
    op.add_column(
        "organization",
        sa.Column("currency", sa.String(3), nullable=False, server_default="CHF"),
    )
    op.add_column("organization", sa.Column("contact_email", sa.String(255), nullable=True))
    op.add_column("organization", sa.Column("contact_phone", sa.String(50), nullable=True))
    op.add_column("organization", sa.Column("contact_url", sa.String(500), nullable=True))
    op.execute(
        """
        INSERT INTO theme (name, logo_url, primary_color, secondary_color)
        SELECT
            name,
            logo_url,
            coalesce(primary_color, '#262626'),
            coalesce(accent_color, '#525252')
        FROM organization
        WHERE theme_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE organization
        SET theme_id = theme.id
        FROM theme
        WHERE organization.theme_id IS NULL
          AND theme.name = organization.name
        """
    )
    op.execute(
        """
        UPDATE organization
        SET slug = lower(regexp_replace(coalesce(short_name, name), '[^a-zA-Z0-9]+', '-', 'g'))
        WHERE slug IS NULL
        """
    )
    op.execute(
        """
        INSERT INTO organization_settings (
            organization_id,
            payout_rate_minor_per_hour,
            signup_rate_limit_per_contact,
            signup_rate_limit_window_minutes
        )
        SELECT
            id,
            coalesce((settings ->> 'payout_rate_minor_per_hour')::integer, 900),
            coalesce((settings ->> 'signup_rate_limit_per_contact')::integer, 5),
            coalesce((settings ->> 'signup_rate_limit_window_minutes')::integer, 60)
        FROM organization
        WHERE NOT EXISTS (
            SELECT 1
            FROM organization_settings
            WHERE organization_settings.organization_id = organization.id
        )
        """
    )

    op.alter_column("organization", "theme_id", nullable=False)
    op.alter_column("organization", "slug", nullable=False)
    op.create_foreign_key(
        "fk_organization_theme_id_theme",
        "organization",
        "theme",
        ["theme_id"],
        ["id"],
    )
    op.create_unique_constraint("uq_organization_slug", "organization", ["slug"])
    op.create_unique_constraint("uq_organization_custom_domain", "organization", ["custom_domain"])

    _seed_first_organization()

    op.drop_column("organization", "settings")
    op.drop_column("organization", "accent_color")
    op.drop_column("organization", "primary_color")
    op.drop_column("organization", "logo_url")


def downgrade() -> None:
    op.add_column("organization", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column("organization", sa.Column("primary_color", sa.String(16), nullable=True))
    op.add_column("organization", sa.Column("accent_color", sa.String(16), nullable=True))
    op.add_column(
        "organization",
        sa.Column(
            "settings",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.execute(
        """
        UPDATE organization
        SET
            logo_url = theme.logo_url,
            primary_color = theme.primary_color,
            accent_color = theme.secondary_color
        FROM theme
        WHERE organization.theme_id = theme.id
        """
    )
    op.execute(
        """
        UPDATE organization
        SET settings = jsonb_build_object(
            'payout_rate_minor_per_hour',
            organization_settings.payout_rate_minor_per_hour,
            'signup_rate_limit_per_contact',
            organization_settings.signup_rate_limit_per_contact,
            'signup_rate_limit_window_minutes',
            organization_settings.signup_rate_limit_window_minutes
        )
        FROM organization_settings
        WHERE organization.id = organization_settings.organization_id
        """
    )
    op.execute(
        """
        DELETE FROM organization_settings
        WHERE organization_id IN (
            SELECT id FROM organization WHERE slug = 'fc-thusis-cazis'
        )
        """
    )
    op.execute("DELETE FROM organization WHERE slug = 'fc-thusis-cazis'")
    op.drop_constraint("uq_organization_custom_domain", "organization", type_="unique")
    op.drop_constraint("uq_organization_slug", "organization", type_="unique")
    op.drop_constraint("fk_organization_theme_id_theme", "organization", type_="foreignkey")
    op.drop_column("organization", "contact_url")
    op.drop_column("organization", "contact_phone")
    op.drop_column("organization", "contact_email")
    op.drop_column("organization", "currency")
    op.drop_column("organization", "language")
    op.drop_column("organization", "custom_domain")
    op.drop_column("organization", "slug")
    op.drop_column("organization", "theme_id")
    op.drop_table("organization_settings")
    op.drop_table("theme")


def _seed_first_organization() -> None:
    bind = op.get_bind()
    theme_id = bind.execute(
        sa.text(
            """
            INSERT INTO theme (name, primary_color, secondary_color)
            SELECT :theme_name, :primary_color, :secondary_color
            WHERE NOT EXISTS (
                SELECT 1
                FROM organization
                WHERE slug = :slug
            )
            RETURNING id
            """
        ),
        {
            "theme_name": "Initial organization theme",
            "primary_color": "#1f2937",
            "secondary_color": "#dc2626",
            "slug": "fc-thusis-cazis",
        },
    ).scalar()

    if theme_id is None:
        return

    organization_id = bind.execute(
        sa.text(
            """
            INSERT INTO organization (
                theme_id,
                name,
                short_name,
                slug,
                timezone,
                locale,
                language,
                currency
            )
            VALUES (
                :theme_id,
                :name,
                :short_name,
                :slug,
                :timezone,
                :locale,
                :language,
                :currency
            )
            RETURNING id
            """
        ),
        {
            "theme_id": theme_id,
            "name": "FC Thusis-Cazis",
            "short_name": "FCTC",
            "slug": "fc-thusis-cazis",
            "timezone": "Europe/Zurich",
            "locale": "de-CH",
            "language": "de",
            "currency": "CHF",
        },
    ).scalar_one()

    bind.execute(
        sa.text(
            """
            INSERT INTO organization_settings (
                organization_id,
                payout_rate_minor_per_hour,
                signup_rate_limit_per_contact,
                signup_rate_limit_window_minutes
            )
            VALUES (:organization_id, 900, 5, 60)
            """
        ),
        {"organization_id": organization_id},
    )
