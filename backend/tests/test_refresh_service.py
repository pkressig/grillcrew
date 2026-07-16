"""Regression tests for refresh-token rotation concurrency safety."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from app.core.config import get_settings
from app.models.identity import RefreshToken, User, UserStatus
from app.services.auth import InvalidRefreshTokenError, RefreshService, RefreshTokenValidation


class _FakeResult:
    def __init__(self, rowcount: int) -> None:
        self.rowcount = rowcount


class _FakeSession:
    def __init__(self, *, rowcount: int) -> None:
        self._rowcount = rowcount
        self.added: list[object] = []
        self.committed = False
        self.rolled_back = False

    def execute(self, _statement: object) -> _FakeResult:
        return _FakeResult(self._rowcount)

    def add(self, instance: object) -> None:
        self.added.append(instance)

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True


def _validation() -> RefreshTokenValidation:
    user = User(id=uuid.uuid4(), email_normalized="user@example.test", status=UserStatus.ACTIVE)
    token = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        token_hash="hash",
        family_id=uuid.uuid4(),
        expires_at=datetime.now(UTC) + timedelta(days=1),
    )
    return RefreshTokenValidation(token=token, user=user)


def test_refresh_validated_rotates_token_when_claim_succeeds() -> None:
    db = _FakeSession(rowcount=1)
    service = RefreshService(db, get_settings())  # type: ignore[arg-type]

    session, _body = service.refresh_validated(_validation())

    assert session.refresh_token
    assert db.committed is True
    assert db.rolled_back is False
    assert len(db.added) == 1


def test_refresh_validated_rejects_lost_rotation_race() -> None:
    """Two concurrent requests must not both rotate the same refresh token.

    If a concurrent request already claimed (revoked) the row between this
    request's read and its own attempt to rotate, the conditional UPDATE
    affects zero rows here, and this request must fail instead of silently
    issuing a second valid token pair for the same rotation step.
    """
    db = _FakeSession(rowcount=0)
    service = RefreshService(db, get_settings())  # type: ignore[arg-type]

    with pytest.raises(InvalidRefreshTokenError):
        service.refresh_validated(_validation())

    assert db.rolled_back is True
    assert db.committed is False
    assert db.added == []
