"""Integration test for FamilyService.merge against a real session.

Exercises the actual bulk UPDATE that reassigns FamilyMember rows between families and
the subsequent delete of the now-empty source family, which the mock-based tests in
test_family_members.py cannot verify (they only assert *which* statement ran, not that
it moves rows correctly).
"""

import uuid
from collections.abc import Iterator
from typing import cast

import pytest
from sqlalchemy import JSON, Column, Table, create_engine, event, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.engine import Engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.sql.compiler import SQLCompiler

from app.db.base import Base
from app.models.family import Family, FamilyMember, FamilyMemberType
from app.models.identity import AuditEvent
from app.models.organization import Organization, Theme
from app.services.family import FamilyMergeError, FamilyNotFoundError, FamilyService

_TABLES = cast(
    "list[Table]",
    [
        Theme.__table__,
        Organization.__table__,
        Family.__table__,
        FamilyMember.__table__,
        AuditEvent.__table__,
    ],
)


@compiles(JSONB, "sqlite")
def _jsonb_as_json_on_sqlite(element: JSONB, compiler: SQLCompiler, **kw: object) -> str:
    return str(compiler.process(JSON(), **kw))


@pytest.fixture
def engine() -> Iterator[Engine]:
    sqlite_engine = create_engine("sqlite:///:memory:")

    @event.listens_for(sqlite_engine, "connect")
    def _register_uuid_function(dbapi_connection: object, _record: object) -> None:
        dbapi_connection.create_function(  # type: ignore[attr-defined]
            "gen_random_uuid", 0, lambda: uuid.uuid4().hex
        )

    # See test_volunteer_register_api.py: AuditEvent.metadata's server_default is a
    # Postgres-only cast SQLite's DDL compiler rejects; the app always passes
    # event_metadata explicitly, so it's never relied on at runtime.
    metadata_column = cast("Column[object]", AuditEvent.__table__.c.metadata)
    original_default = metadata_column.server_default
    metadata_column.server_default = None
    try:
        Base.metadata.create_all(sqlite_engine, tables=_TABLES)
    finally:
        metadata_column.server_default = original_default
    yield sqlite_engine
    sqlite_engine.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    with Session(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def organization(db_session: Session) -> Organization:
    theme = Theme(name="Theme")
    db_session.add(theme)
    db_session.flush()
    org = Organization(theme_id=theme.id, name="Org", slug="org")
    db_session.add(org)
    db_session.commit()
    return org


def _member(
    family_id: uuid.UUID, member_type: FamilyMemberType, first_name: str, last_name: str
) -> FamilyMember:
    return FamilyMember(
        family_id=family_id,
        member_type=member_type,
        first_name=first_name,
        last_name=last_name,
    )


def test_merge_moves_helpers_and_children_and_removes_the_source_family(
    db_session: Session, organization: Organization
) -> None:
    target = Family(organization_id=organization.id, display_name="Züger")
    source = Family(organization_id=organization.id, display_name="Züger")
    db_session.add_all([target, source])
    db_session.flush()
    target_helper = _member(target.id, FamilyMemberType.HELPER, "Daniela", "Züger")
    source_helper = _member(source.id, FamilyMemberType.HELPER, "Christian", "Züger")
    source_child = _member(source.id, FamilyMemberType.CHILD, "Silvana", "Züger")
    db_session.add_all([target_helper, source_helper, source_child])
    db_session.commit()

    service = FamilyService(db_session, organization.id)
    merged = service.merge(target.id, source.id, uuid.uuid4())

    assert merged.id == target.id
    db_session.expire_all()
    remaining_members = db_session.scalars(
        select(FamilyMember).order_by(FamilyMember.first_name)
    ).all()
    assert {m.id for m in remaining_members} == {
        target_helper.id,
        source_helper.id,
        source_child.id,
    }
    assert {m.family_id for m in remaining_members} == {target.id}
    assert db_session.get(Family, source.id) is None
    assert db_session.get(Family, target.id) is not None
    audit = db_session.scalars(select(AuditEvent)).one()
    assert audit.action == "FAMILY_MERGED_BY_ADMIN"
    assert audit.entity_id == target.id
    assert audit.event_metadata["merged_family_id"] == str(source.id)
    assert audit.event_metadata["moved_members"] == 2


def test_merge_rejects_a_self_merge_without_touching_the_database(
    db_session: Session, organization: Organization
) -> None:
    family = Family(organization_id=organization.id, display_name="Züger")
    db_session.add(family)
    db_session.commit()
    service = FamilyService(db_session, organization.id)

    with pytest.raises(FamilyMergeError):
        service.merge(family.id, family.id, uuid.uuid4())
    assert db_session.get(Family, family.id) is not None


def test_merge_raises_not_found_for_a_family_in_another_organization(
    db_session: Session, organization: Organization
) -> None:
    other_org = Organization(theme_id=organization.theme_id, name="Other", slug="other")
    db_session.add(other_org)
    db_session.flush()
    target = Family(organization_id=organization.id, display_name="Züger")
    foreign_source = Family(organization_id=other_org.id, display_name="Andric")
    db_session.add_all([target, foreign_source])
    db_session.commit()
    service = FamilyService(db_session, organization.id)

    with pytest.raises(FamilyNotFoundError):
        service.merge(target.id, foreign_source.id, uuid.uuid4())
