"""Focused security and scheduling tests for read-only OneDrive sync."""

import inspect
import uuid
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import cast
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.orm import Session

from app.models.onedrive_sync import OneDriveSyncConfig, OneDriveSyncRun, OneDriveSyncStatus
from app.services import onedrive_sync
from app.services.onedrive_sync import (
    OneDriveSyncError,
    OneDriveSyncService,
    _PinnedHTTPSConnection,
    _validate_public_dns,
    _validate_xlsx,
    next_run_at,
    normalize_source_url,
)


@pytest.mark.parametrize(
    "url",
    [
        "http://1drv.ms/a",
        "https://localhost/a",
        "https://evil.example/a",
        "https://user:pass@onedrive.live.com/a",
        "https://onedrive.live.com:444/a",
    ],
)
def test_rejects_non_allowlisted_or_credentialed_urls(url: str) -> None:
    with pytest.raises(OneDriveSyncError):
        normalize_source_url(url)


def test_accepts_only_known_readonly_source_hosts() -> None:
    assert normalize_source_url("https://1drv.ms/x#frag") == "https://1drv.ms/x"
    assert (
        normalize_source_url("https://tenant.sharepoint.com/:x:/r/file")
        == "https://tenant.sharepoint.com/:x:/r/file"
    )


def test_rejects_private_dns_resolution() -> None:
    with patch(
        "app.services.onedrive_sync.socket.getaddrinfo",
        return_value=[(2, 1, 6, "", ("127.0.0.1", 443))],
    ):
        with pytest.raises(OneDriveSyncError, match="private"):
            _validate_public_dns("https://1drv.ms/a")


def test_next_run_uses_organization_timezone_and_disabled_state() -> None:
    config = cast(OneDriveSyncConfig, SimpleNamespace(enabled=True, daily_time=time(3, 0)))
    assert next_run_at(config, "Europe/Zurich", datetime(2026, 8, 2, 0, 0, tzinfo=UTC)) == datetime(
        2026, 8, 2, 1, 0, tzinfo=UTC
    )
    config.enabled = False
    assert next_run_at(config, "Europe/Zurich", datetime.now(UTC)) is None


def test_downloader_source_contains_no_write_method() -> None:
    source = inspect.getsource(onedrive_sync.download_workbook)
    request_source = inspect.getsource(onedrive_sync._get_once)
    assert '"GET"' in request_source
    assert all(
        token not in source + request_source for token in ('"POST"', '"PUT"', '"PATCH"', '"DELETE"')
    )


def test_pinned_connection_uses_validated_ip_but_tls_original_hostname() -> None:
    raw = object()
    wrapped = object()
    wrap_socket = Mock(return_value=wrapped)
    context = SimpleNamespace(wrap_socket=wrap_socket)
    connection = _PinnedHTTPSConnection("tenant.sharepoint.com", "203.0.113.10")
    connection._tls_context = context  # type: ignore[assignment]
    with patch("app.services.onedrive_sync.socket.create_connection", return_value=raw) as connect:
        connection.connect()
    connect.assert_called_once_with(("203.0.113.10", 443), 20)
    wrap_socket.assert_called_once_with(raw, server_hostname="tenant.sharepoint.com")


def test_disabled_configuration_refuses_manual_sync() -> None:
    config = cast(OneDriveSyncConfig, SimpleNamespace(enabled=False))
    db = SimpleNamespace(scalar=lambda _query: config)
    with pytest.raises(OneDriveSyncError, match="deaktiviert"):
        OneDriveSyncService(cast(Session, db), __import__("uuid").uuid4(), "Europe/Zurich").sync(
            None
        )


def test_rejects_non_xlsx_payload_before_parser() -> None:
    with pytest.raises(OneDriveSyncError, match="XLSX"):
        _validate_xlsx(b"not-a-zip")


def test_content_hash_is_claimed_before_staged_batch_creation() -> None:
    source = inspect.getsource(OneDriveSyncService.sync)
    claim = source.index("# Claim this content hash")
    commit = source.index("self.db.commit()", claim)
    create_batch = source.index(".create_batch(")
    assert claim < commit < create_batch
    migration = (
        Path(__file__).parents[1] / "alembic/versions/0022_onedrive_readonly_sync.py"
    ).read_text()
    assert "status IN ('RUNNING', 'SUCCESS')" in migration


def test_crash_after_claim_expires_lease_and_releases_daily_claim() -> None:
    now = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)
    stale = SimpleNamespace(
        status=OneDriveSyncStatus.RUNNING,
        started_at=now - onedrive_sync.RUNNING_LEASE - timedelta(seconds=1),
        scheduled_date=now.date(),
        error_message=None,
        finished_at=None,
    )
    db = SimpleNamespace(commit=Mock())
    service = OneDriveSyncService(cast(Session, db), __import__("uuid").uuid4(), "Europe/Zurich")
    assert service._expire_if_stale(stale, now) is True  # type: ignore[arg-type]
    assert stale.status == OneDriveSyncStatus.FAILED
    assert stale.scheduled_date is None
    db.commit.assert_called_once()


def test_live_claim_is_not_taken_over() -> None:
    now = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)
    live = SimpleNamespace(
        status=OneDriveSyncStatus.RUNNING,
        started_at=now - onedrive_sync.RUNNING_LEASE / 2,
    )
    db = SimpleNamespace(commit=Mock())
    service = OneDriveSyncService(cast(Session, db), __import__("uuid").uuid4(), "Europe/Zurich")
    assert service._expire_if_stale(live, now) is False  # type: ignore[arg-type]
    db.commit.assert_not_called()


def test_run_due_recovers_same_day_stale_claim_and_retries() -> None:
    now = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)
    config = SimpleNamespace(id=__import__("uuid").uuid4(), enabled=True)
    stale = SimpleNamespace(
        status=OneDriveSyncStatus.RUNNING,
        started_at=now - onedrive_sync.RUNNING_LEASE - timedelta(seconds=1),
        scheduled_date=now.date(),
        error_message=None,
        finished_at=None,
    )
    db = SimpleNamespace(scalar=Mock(return_value=stale), commit=Mock())
    expected = cast(OneDriveSyncRun, object())

    class DueService(OneDriveSyncService):
        def get_config(self) -> OneDriveSyncConfig | None:
            return cast(OneDriveSyncConfig, config)

        def sync(
            self,
            actor_user_id: uuid.UUID | None,
            now: datetime | None = None,
            scheduled_date: date | None = None,
        ) -> OneDriveSyncRun:
            assert scheduled_date == datetime(2026, 8, 2).date()
            return expected

    service = DueService(cast(Session, db), __import__("uuid").uuid4(), "Europe/Zurich")
    assert service.run_due(__import__("uuid").uuid4(), now) is expected
    assert stale.status == OneDriveSyncStatus.FAILED
    assert stale.scheduled_date is None


def test_run_due_retries_after_previously_released_failed_claim_same_day() -> None:
    now = datetime(2026, 8, 2, 12, 0, tzinfo=UTC)
    config = cast(
        OneDriveSyncConfig,
        SimpleNamespace(id=uuid.uuid4(), enabled=True, daily_time=time(3, 0)),
    )
    # A stale/failed row has scheduled_date=None, so both scheduled-claim lookups return no row.
    db = SimpleNamespace(scalar=Mock(return_value=None))
    expected = cast(OneDriveSyncRun, object())

    class ReleasedClaimService(OneDriveSyncService):
        def get_config(self) -> OneDriveSyncConfig | None:
            return config

        def sync(
            self,
            actor_user_id: uuid.UUID | None,
            now: datetime | None = None,
            scheduled_date: date | None = None,
        ) -> OneDriveSyncRun:
            assert scheduled_date == date(2026, 8, 2)
            return expected

    service = ReleasedClaimService(cast(Session, db), uuid.uuid4(), "Europe/Zurich")
    assert service.run_due(uuid.uuid4(), now) is expected
