"""Strictly read-only OneDrive download and import-staging synchronization."""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import logging
import socket
import ssl
import uuid
import zipfile
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from urllib.parse import parse_qsl, unquote, urlencode, urljoin, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.onedrive_sync import OneDriveSyncConfig, OneDriveSyncRun, OneDriveSyncStatus
from app.models.planning import ImportRow
from app.services.imports import ImportService

MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024
MAX_REDIRECTS = 5
MAX_ZIP_ENTRIES = 10_000
MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
RUNNING_LEASE = timedelta(minutes=15)
ALLOWED_HOSTS = {"1drv.ms", "onedrive.live.com"}
logger = logging.getLogger(__name__)


class OneDriveSyncError(Exception):
    pass


def normalize_source_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    allowed = host in ALLOWED_HOSTS or host.endswith(".sharepoint.com")
    if (
        parsed.scheme != "https"
        or not allowed
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise OneDriveSyncError("Nur HTTPS-Links von OneDrive oder SharePoint sind erlaubt.")
    if parsed.fragment:
        parsed = parsed._replace(fragment="")
    return urlunsplit(parsed)


def _resolve_public_addresses(url: str) -> tuple[str, set[str]]:
    host = urlsplit(normalize_source_url(url)).hostname
    if host is None:
        raise OneDriveSyncError("Die OneDrive-Adresse ist ungültig.")
    try:
        addresses = {
            str(item[4][0]) for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        }
    except socket.gaierror as error:
        raise OneDriveSyncError("Die OneDrive-Adresse konnte nicht aufgelöst werden.") from error
    if not addresses:
        raise OneDriveSyncError("Die OneDrive-Adresse konnte nicht aufgelöst werden.")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if not ip.is_global:
            raise OneDriveSyncError("Interne oder private Zieladressen sind nicht erlaubt.")
    return host, addresses


def _validate_public_dns(url: str) -> None:
    _resolve_public_addresses(url)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    """Connect to a prevalidated IP while retaining TLS SNI/hostname verification."""

    def __init__(self, hostname: str, address: str) -> None:
        self._tls_context = ssl.create_default_context()
        super().__init__(hostname, timeout=20, context=self._tls_context)
        self._address = address

    def connect(self) -> None:
        raw = socket.create_connection((self._address, self.port), self.timeout)
        self.sock = self._tls_context.wrap_socket(raw, server_hostname=self.host)


def _get_once(url: str) -> tuple[int, http.client.HTTPMessage, bytes]:
    host, addresses = _resolve_public_addresses(url)
    parsed = urlsplit(url)
    target = parsed.path or "/"
    if parsed.query:
        target += f"?{parsed.query}"
    last_error: OSError | ssl.SSLError | None = None
    for address in sorted(addresses):
        connection = _PinnedHTTPSConnection(host, address)
        try:
            connection.request(
                "GET",
                target,
                headers={"Host": host, "User-Agent": "GrillCrew-OneDrive-ReadOnly/1.0"},
            )
            response = connection.getresponse()
            peer = (
                ipaddress.ip_address(connection.sock.getpeername()[0]) if connection.sock else None
            )
            if peer is None or str(peer) not in addresses:
                raise OneDriveSyncError(
                    "Die Netzwerkverbindung entsprach nicht der geprüften Zieladresse."
                )
            return response.status, response.headers, response.read(MAX_DOWNLOAD_BYTES + 1)
        except (OSError, ssl.SSLError) as error:
            last_error = error
        finally:
            connection.close()
    raise OneDriveSyncError("Die OneDrive-Datei konnte nicht gelesen werden.") from last_error


def _validate_xlsx(content: bytes) -> None:
    if not content.startswith(b"PK\x03\x04"):
        raise OneDriveSyncError("Die Quelle ist keine gültige XLSX-Datei.")
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > MAX_ZIP_ENTRIES:
                raise OneDriveSyncError("Die XLSX-Datei enthält zu viele Einträge.")
            total = sum(entry.file_size for entry in entries)
            if total > MAX_UNCOMPRESSED_BYTES:
                raise OneDriveSyncError("Die entpackte XLSX-Datei ist zu gross.")
            if any(entry.compress_size == 0 and entry.file_size > 0 for entry in entries):
                raise OneDriveSyncError("Die XLSX-Datei enthält ungültige Kompressionsdaten.")
    except zipfile.BadZipFile as error:
        raise OneDriveSyncError("Die Quelle ist keine gültige XLSX-Datei.") from error


def _download_hint(url: str) -> str:
    parsed = urlsplit(url)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    if not any(key.lower() == "download" for key, _ in query):
        query.append(("download", "1"))
    return urlunsplit(parsed._replace(query=urlencode(query)))


def download_workbook(url: str) -> tuple[str, bytes]:
    final_url = normalize_source_url(url)
    disposition: str | None = None
    for _ in range(MAX_REDIRECTS + 1):
        status, headers, content = _get_once(final_url)
        if status in {301, 302, 303, 307, 308}:
            location = headers.get("Location")
            if not location:
                raise OneDriveSyncError("Die OneDrive-Weiterleitung ist ungültig.")
            final_url = normalize_source_url(urljoin(final_url, location))
            continue
        if status != 200:
            raise OneDriveSyncError("Die OneDrive-Datei konnte nicht gelesen werden.")
        disposition = headers.get_filename()
        break
    else:
        raise OneDriveSyncError("Zu viele OneDrive-Weiterleitungen.")
    if len(content) > MAX_DOWNLOAD_BYTES:
        raise OneDriveSyncError("Die Excel-Datei darf maximal 10 MiB gross sein.")
    try:
        _validate_xlsx(content)
    except OneDriveSyncError:
        hinted_url = _download_hint(url)
        if hinted_url != url:
            return download_workbook(hinted_url)
        raise
    filename = unquote(
        disposition or urlsplit(final_url).path.rsplit("/", 1)[-1] or "onedrive.xlsx"
    )
    if not filename.lower().endswith(".xlsx"):
        filename = "onedrive.xlsx"
    return filename[:255], content


def next_run_at(config: OneDriveSyncConfig, timezone: str, now: datetime) -> datetime | None:
    if not config.enabled:
        return None
    zone = ZoneInfo(timezone)
    local = now.astimezone(zone)
    candidate = datetime.combine(local.date(), config.daily_time, zone)
    if candidate <= local:
        candidate += timedelta(days=1)
    return candidate.astimezone(UTC)


class OneDriveSyncService:
    def __init__(self, db: Session, organization_id: uuid.UUID, timezone: str) -> None:
        self.db, self.organization_id, self.timezone = db, organization_id, timezone

    def get_config(self) -> OneDriveSyncConfig | None:
        return self.db.scalar(
            select(OneDriveSyncConfig).where(
                OneDriveSyncConfig.organization_id == self.organization_id
            )
        )

    def sync(
        self,
        actor_user_id: uuid.UUID | None,
        now: datetime | None = None,
        scheduled_date: date | None = None,
    ) -> OneDriveSyncRun:
        config = self.get_config()
        if config is None:
            raise OneDriveSyncError("OneDrive-Synchronisation ist nicht konfiguriert.")
        current = now or datetime.now(UTC)
        effective_start = (
            max(config.import_start_date, current.astimezone(ZoneInfo(self.timezone)).date())
            if config.future_only
            else config.import_start_date
        )
        run = OneDriveSyncRun(
            config_id=config.id,
            organization_id=self.organization_id,
            triggered_by_user_id=actor_user_id,
            status=OneDriveSyncStatus.RUNNING,
            source_filename=None,
            content_sha256=f"claim:{uuid.uuid4().hex}",
            effective_start_date=effective_start,
            effective_end_date=config.import_end_date,
            scheduled_date=scheduled_date,
            row_count=0,
            started_at=current,
        )
        self.db.add(run)
        try:
            self.db.commit()
            self.db.refresh(run)
        except IntegrityError:
            self.db.rollback()
            if scheduled_date is not None:
                claimed = self.db.scalar(
                    select(OneDriveSyncRun)
                    .where(
                        OneDriveSyncRun.config_id == config.id,
                        OneDriveSyncRun.scheduled_date == scheduled_date,
                    )
                    .with_for_update()
                )
                if claimed is not None:
                    if not self._expire_if_stale(claimed, current):
                        return claimed
                    self.db.add(run)
                    try:
                        self.db.commit()
                        self.db.refresh(run)
                    except IntegrityError:
                        self.db.rollback()
                        live = self.db.scalar(
                            select(OneDriveSyncRun).where(
                                OneDriveSyncRun.config_id == config.id,
                                OneDriveSyncRun.scheduled_date == scheduled_date,
                            )
                        )
                        if live is not None:
                            return live
                        raise OneDriveSyncError(
                            "Ein Synchronisationslauf ist bereits aktiv."
                        ) from None
                else:
                    raise OneDriveSyncError("Ein Synchronisationslauf ist bereits aktiv.") from None
            else:
                raise OneDriveSyncError("Ein Synchronisationslauf ist bereits aktiv.") from None
        try:
            filename, content = download_workbook(config.source_url)
        except Exception as error:
            self._fail_run(run, None, None)
            raise OneDriveSyncError("Die OneDrive-Datei konnte nicht gelesen werden.") from error
        digest = hashlib.sha256(content).hexdigest()
        existing = self.db.scalar(
            select(OneDriveSyncRun).where(
                OneDriveSyncRun.config_id == config.id,
                OneDriveSyncRun.content_sha256 == digest,
                OneDriveSyncRun.effective_start_date == effective_start,
                OneDriveSyncRun.effective_end_date == config.import_end_date,
                OneDriveSyncRun.status == OneDriveSyncStatus.SUCCESS,
            )
        )
        if existing is not None:
            run.status = OneDriveSyncStatus.SKIPPED_UNCHANGED
            run.source_filename = filename
            run.content_sha256 = hashlib.sha256(f"skipped:{digest}".encode()).hexdigest()
            run.finished_at = datetime.now(UTC)
            self.db.commit()
            return existing
        run.source_filename = filename
        run.content_sha256 = digest
        try:
            # Claim this content hash before ImportService can commit a staged batch.
            self.db.commit()
            self.db.refresh(run)
        except IntegrityError:
            self.db.rollback()
            winner = self.db.scalar(
                select(OneDriveSyncRun)
                .where(
                    OneDriveSyncRun.config_id == config.id,
                    OneDriveSyncRun.content_sha256 == digest,
                    OneDriveSyncRun.effective_start_date == effective_start,
                    OneDriveSyncRun.effective_end_date == config.import_end_date,
                    OneDriveSyncRun.status.in_(
                        [OneDriveSyncStatus.RUNNING, OneDriveSyncStatus.SUCCESS]
                    ),
                )
                .with_for_update()
            )
            if winner is not None and self._expire_if_stale(winner, current):
                claimant = self.db.get(OneDriveSyncRun, run.id)
                if claimant is None:
                    raise OneDriveSyncError("Ein Synchronisationslauf ist bereits aktiv.") from None
                claimant.source_filename = filename
                claimant.content_sha256 = digest
                try:
                    self.db.commit()
                    self.db.refresh(claimant)
                    run = claimant
                    winner = None
                except IntegrityError:
                    self.db.rollback()
                    winner = self.db.scalar(
                        select(OneDriveSyncRun).where(
                            OneDriveSyncRun.config_id == config.id,
                            OneDriveSyncRun.content_sha256 == digest,
                            OneDriveSyncRun.status.in_(
                                [OneDriveSyncStatus.RUNNING, OneDriveSyncStatus.SUCCESS]
                            ),
                        )
                    )
            stale = self.db.get(OneDriveSyncRun, run.id)
            if winner is not None and stale is not None:
                stale.status = OneDriveSyncStatus.SKIPPED_UNCHANGED
                stale.content_sha256 = hashlib.sha256(f"collision:{run.id}".encode()).hexdigest()
                stale.scheduled_date = None
                stale.finished_at = datetime.now(UTC)
                self.db.commit()
            if winner is not None:
                return winner
            if run.content_sha256 != digest:
                raise OneDriveSyncError("Ein Synchronisationslauf ist bereits aktiv.") from None
        try:
            batch = ImportService(self.db, self.organization_id).create_batch(
                config.club_year_id,
                filename,
                content,
                actor_user_id or config.id,
                effective_start,
                config.import_end_date,
                commit=False,
            )
            rows = list(
                self.db.scalars(select(ImportRow).where(ImportRow.import_batch_id == batch.id))
            )
            run.import_batch_id, run.row_count = batch.id, len(rows)
            run.comparison_summary = dict(Counter(row.classification.value for row in rows))
            run.status, run.finished_at = OneDriveSyncStatus.SUCCESS, datetime.now(UTC)
            self.db.commit()
            self.db.refresh(run)
            return run
        except Exception as error:
            self.db.rollback()
            public_error = "Die OneDrive-Datei konnte nicht verarbeitet werden."
            logger.exception("OneDrive sync failed for organization %s", self.organization_id)
            self._fail_run(run, filename, digest)
            raise OneDriveSyncError(public_error) from error

    def _fail_run(self, run: OneDriveSyncRun, filename: str | None, digest: str | None) -> None:
        self.db.rollback()
        persisted = self.db.get(OneDriveSyncRun, run.id) or run
        persisted.status = OneDriveSyncStatus.FAILED
        persisted.source_filename = filename
        if digest is not None:
            persisted.content_sha256 = digest
        persisted.scheduled_date = None
        persisted.error_message = "Die OneDrive-Datei konnte nicht verarbeitet werden."
        persisted.finished_at = datetime.now(UTC)
        self.db.commit()

    def _expire_if_stale(self, run: OneDriveSyncRun, now: datetime) -> bool:
        if run.status != OneDriveSyncStatus.RUNNING or run.started_at > now - RUNNING_LEASE:
            return False
        run.status = OneDriveSyncStatus.FAILED
        run.scheduled_date = None
        run.error_message = (
            "Der vorherige Synchronisationslauf wurde nach Zeitüberschreitung beendet."
        )
        run.finished_at = now
        self.db.commit()
        return True

    def is_due(self, now: datetime) -> bool:
        config = self.get_config()
        if config is None or not config.enabled:
            return False
        local = now.astimezone(ZoneInfo(self.timezone))
        if local.time().replace(tzinfo=None) < config.daily_time:
            return False
        scheduled_today = self.db.scalar(
            select(OneDriveSyncRun)
            .where(
                OneDriveSyncRun.config_id == config.id,
                OneDriveSyncRun.scheduled_date == local.date(),
                OneDriveSyncRun.status.in_(
                    [
                        OneDriveSyncStatus.RUNNING,
                        OneDriveSyncStatus.SUCCESS,
                        OneDriveSyncStatus.SKIPPED_UNCHANGED,
                    ]
                ),
            )
            .limit(1)
        )
        return scheduled_today is None

    def run_due(self, actor_user_id: uuid.UUID, now: datetime) -> OneDriveSyncRun | None:
        config = self.get_config()
        if config is None or not config.enabled:
            return None
        scheduled_date = now.astimezone(ZoneInfo(self.timezone)).date()
        claim = self.db.scalar(
            select(OneDriveSyncRun)
            .where(
                OneDriveSyncRun.config_id == config.id,
                OneDriveSyncRun.scheduled_date == scheduled_date,
            )
            .with_for_update()
        )
        if claim is not None:
            if not self._expire_if_stale(claim, now):
                return None
            return self.sync(actor_user_id, now, scheduled_date)
        if not self.is_due(now):
            return None
        return self.sync(actor_user_id, now, scheduled_date)
