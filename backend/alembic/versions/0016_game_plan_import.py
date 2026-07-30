"""Add game-plan import staging (import_batch, import_row) and event import columns.

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-31
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

IMPORT_BATCH_STATUS = ENUM(
    "STAGED", "CONFIRMED", "DISCARDED", name="import_batch_status", create_type=False
)
SPIEL_TYP = ENUM(
    "MEISTERSCHAFT", "CUP", "TESTSPIEL", "TURNIER", name="spiel_typ", create_type=False
)
IMPORT_ROW_CLASSIFICATION = ENUM(
    "NEU",
    "GEAENDERT",
    "VERSCHOBEN",
    "ENTFERNT",
    "UNVERAENDERT",
    name="import_row_classification",
    create_type=False,
)
IMPORT_ROW_DECISION = ENUM("INCLUDE", "EXCLUDE", name="import_row_decision", create_type=False)
GRILL_SHIFT_DECISION = ENUM(
    "PENDING", "CREATE_SHIFT", "NO_SHIFT", name="grill_shift_decision", create_type=False
)


def upgrade() -> None:
    IMPORT_BATCH_STATUS.create(op.get_bind(), checkfirst=True)
    SPIEL_TYP.create(op.get_bind(), checkfirst=True)
    IMPORT_ROW_CLASSIFICATION.create(op.get_bind(), checkfirst=True)
    IMPORT_ROW_DECISION.create(op.get_bind(), checkfirst=True)
    GRILL_SHIFT_DECISION.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "import_batch",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("organization_id", UUID(as_uuid=True), nullable=False),
        sa.Column("club_year_id", UUID(as_uuid=True), nullable=False),
        sa.Column("source_filename", sa.String(255), nullable=False),
        sa.Column("uploaded_by_user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("status", IMPORT_BATCH_STATUS, nullable=False, server_default="STAGED"),
        sa.Column(
            "uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("confirmed_by_user_id", UUID(as_uuid=True), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organization.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["club_year_id"], ["club_year.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["user.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["confirmed_by_user_id"], ["user.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_import_batch_organization_status", "import_batch", ["organization_id", "status"]
    )

    op.create_table(
        "import_row",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("import_batch_id", UUID(as_uuid=True), nullable=False),
        sa.Column("season_id", UUID(as_uuid=True), nullable=False),
        sa.Column("sheet_tab", sa.String(50), nullable=False),
        sa.Column("spiel_typ", SPIEL_TYP, nullable=False),
        sa.Column("bezeichnung", sa.Text(), nullable=True),
        sa.Column("spielnummer", sa.String(20), nullable=True),
        sa.Column("weekday_short", sa.String(10), nullable=True),
        sa.Column("game_date", sa.Date(), nullable=False),
        sa.Column("game_time", sa.Time(), nullable=True),
        sa.Column("teams", sa.Text(), nullable=False),
        sa.Column("venue", sa.Text(), nullable=False),
        sa.Column("venue_normalized", sa.String(200), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("is_home_venue", sa.Boolean(), nullable=False),
        sa.Column("classification", IMPORT_ROW_CLASSIFICATION, nullable=False),
        sa.Column("matched_event_id", UUID(as_uuid=True), nullable=True),
        sa.Column("diff_details", JSONB, nullable=True),
        sa.Column("include_decision", IMPORT_ROW_DECISION, nullable=False),
        sa.Column(
            "grill_shift_decision",
            GRILL_SHIFT_DECISION,
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("verschoben_acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(["import_batch_id"], ["import_batch.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["season_id"], ["season.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["matched_event_id"], ["event.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_import_row_batch", "import_row", ["import_batch_id"])
    op.create_index("ix_import_row_season", "import_row", ["season_id"])
    op.create_index("ix_import_row_matched_event", "import_row", ["matched_event_id"])
    op.create_index(
        "ix_import_row_batch_classification", "import_row", ["import_batch_id", "classification"]
    )

    op.add_column("event", sa.Column("kickoff_time", sa.Time(), nullable=True))
    op.add_column("event", sa.Column("external_game_number", sa.String(20), nullable=True))
    op.add_column("event", sa.Column("import_match_key", sa.String(300), nullable=True))
    op.create_index("ix_event_season_import_match_key", "event", ["season_id", "import_match_key"])

    bind = op.get_bind()
    existing_source_import_ids = bind.execute(
        sa.text("SELECT count(*) FROM event WHERE source_import_id IS NOT NULL")
    ).scalar()
    if existing_source_import_ids:
        raise RuntimeError(
            "event.source_import_id has existing non-null values; cannot safely add the "
            "import_batch foreign key without a data migration."
        )
    op.create_foreign_key(
        "fk_event_source_import_id_import_batch",
        "event",
        "import_batch",
        ["source_import_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_event_source_import_id_import_batch", "event", type_="foreignkey")
    op.drop_index("ix_event_season_import_match_key", table_name="event")
    op.drop_column("event", "import_match_key")
    op.drop_column("event", "external_game_number")
    op.drop_column("event", "kickoff_time")

    op.drop_index("ix_import_row_batch_classification", table_name="import_row")
    op.drop_index("ix_import_row_matched_event", table_name="import_row")
    op.drop_index("ix_import_row_season", table_name="import_row")
    op.drop_index("ix_import_row_batch", table_name="import_row")
    op.drop_table("import_row")

    op.drop_index("ix_import_batch_organization_status", table_name="import_batch")
    op.drop_table("import_batch")

    GRILL_SHIFT_DECISION.drop(op.get_bind(), checkfirst=True)
    IMPORT_ROW_DECISION.drop(op.get_bind(), checkfirst=True)
    IMPORT_ROW_CLASSIFICATION.drop(op.get_bind(), checkfirst=True)
    SPIEL_TYP.drop(op.get_bind(), checkfirst=True)
    IMPORT_BATCH_STATUS.drop(op.get_bind(), checkfirst=True)
