from datetime import date, datetime, time
from types import SimpleNamespace
from typing import cast
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from app.models.external_kiosk import (
    ExternalKioskBatch,
    ExternalKioskCategory,
    ExternalKioskReviewState,
    ExternalKioskRow,
)
from app.schemas.external_kiosk import ComparisonStatus
from app.schemas.proposals import ProposalWindowResponse
from app.services.external_kiosk import ExternalKioskService


def _row(
    category: ExternalKioskCategory, start: time, end: time, person: str | None = None
) -> ExternalKioskRow:
    return ExternalKioskRow(
        id=uuid4(),
        batch_id=uuid4(),
        source_row=3,
        plan_date=date(2025, 8, 2),
        start_time=start,
        end_time=end,
        category=category,
        assigned_person_text=person,
        source_note=None,
        raw_date="2025-08-02",
        raw_time="raw",
        acknowledged=False,
        review_state=ExternalKioskReviewState.PENDING,
        review_note=None,
    )


def _proposal() -> ProposalWindowResponse:
    zone = ZoneInfo("UTC")
    return ProposalWindowResponse(
        id="window",
        date=date(2025, 8, 2),
        start_at=datetime(2025, 8, 2, 10, tzinfo=zone),
        end_at=datetime(2025, 8, 2, 14, tzinfo=zone),
        kiosk_open=True,
        grill_required=True,
        proposed_grill_slots=1,
        override_state="PROPOSAL",
        is_overridden=False,
        split_reason=None,
        venues=[],
        crew_rule_context=None,
        covered_event_ids=[],
        games=[],
    )


def test_comparison_exposes_match_person_missing_and_extra(monkeypatch: pytest.MonkeyPatch) -> None:
    kiosk = _row(ExternalKioskCategory.KIOSK, time(9), time(15))
    person = _row(ExternalKioskCategory.KIOSK, time(9), time(15), "Person A")
    extra = _row(ExternalKioskCategory.GRILL, time(16), time(18))
    batch = cast(ExternalKioskBatch, SimpleNamespace(id=uuid4()))
    db = SimpleNamespace(get=lambda *_args: SimpleNamespace(timezone="UTC"))
    service = ExternalKioskService(cast(object, db), uuid4())  # type: ignore[arg-type]
    monkeypatch.setattr(service, "get", lambda _batch_id: (batch, [kiosk, person, extra]))
    monkeypatch.setattr(
        "app.services.external_kiosk.ProposalService.list_windows", lambda _self: [_proposal()]
    )

    items = service.compare(batch.id)

    kiosk_item = next(item for item in items if item.category == ExternalKioskCategory.KIOSK)
    grill_item = next(
        item
        for item in items
        if item.proposal_window_id == "window" and item.category == ExternalKioskCategory.GRILL
    )
    assert kiosk_item.statuses == [
        ComparisonStatus.MATCH,
        ComparisonStatus.PERSON_ASSIGNMENT_PRESENT,
    ]
    assert grill_item.statuses == [ComparisonStatus.TIME_MISMATCH]


def test_overlap_requires_defensible_bounds() -> None:
    row = _row(ExternalKioskCategory.KIOSK, time(9), time(11))
    proposal = _proposal()
    assert ExternalKioskService._overlaps(row, proposal.start_at, proposal.end_at, ZoneInfo("UTC"))
    row.end_time = None
    assert not ExternalKioskService._overlaps(
        row, proposal.start_at, proposal.end_at, ZoneInfo("UTC")
    )
