"""Link volunteers to self-service accounts and compensation preferences."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision = "0026"
down_revision = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    compensation = sa.Enum("WORK_HOURS", "VOLUNTARY", "PAYOUT", name="volunteer_compensation")
    compensation.create(op.get_bind(), checkfirst=True)
    op.add_column("volunteer", sa.Column("user_id", sa.UUID(), nullable=True))
    op.create_unique_constraint("uq_volunteer_user_id", "volunteer", ["user_id"])
    op.create_foreign_key(
        "fk_volunteer_user", "volunteer", "user", ["user_id"], ["id"], ondelete="SET NULL"
    )
    op.add_column(
        "volunteer",
        sa.Column(
            "compensation_preference", compensation, nullable=False, server_default="WORK_HOURS"
        ),
    )
    op.add_column("volunteer", sa.Column("compensation_family_member_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_volunteer_compensation_member",
        "volunteer",
        "family_member",
        ["compensation_family_member_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_volunteer_compensation_member", "volunteer", type_="foreignkey")
    op.drop_column("volunteer", "compensation_family_member_id")
    op.drop_column("volunteer", "compensation_preference")
    op.drop_constraint("fk_volunteer_user", "volunteer", type_="foreignkey")
    op.drop_constraint("uq_volunteer_user_id", "volunteer", type_="unique")
    op.drop_column("volunteer", "user_id")
    sa.Enum(name="volunteer_compensation").drop(op.get_bind(), checkfirst=True)
