"""Pure proposal grouping plus tenant-scoped orchestration and overrides."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.identity import AuditEvent
from app.models.organization import CrewSizeRule, HomeVenue, Organization, OrganizationSettings
from app.models.planning import (
    ClubYear,
    Event,
    EventStatus,
    Season,
    Shift,
    ShiftAssignmentMode,
    ShiftStatus,
    ShiftType,
)
from app.models.proposal import ProposalOverride, ProposalShiftSplit
from app.schemas.proposals import (
    ProposalGameResponse,
    ProposalGrillSplitsUpdate,
    ProposalKioskSplitsUpdate,
    ProposalOverrideUpdate,
    ProposalShiftSplitResponse,
    ProposalWindowResponse,
)
from app.services.imports import _matches_home_venue
from app.services.settings import normalize_venue_name


class ProposalNotFoundError(Exception):
    pass


class ProposalValidationError(Exception):
    pass


@dataclass(frozen=True)
class ProposalGame:
    id: uuid.UUID
    title: str
    date: date
    kickoff_time: time
    venue: str
    # Duration is optional because legacy imported games only carry a kickoff.
    # A zero duration preserves the historical proposal behaviour.
    duration_minutes: int = 0


@dataclass(frozen=True)
class ProposalWindow:
    id: str
    date: date
    start_at: datetime
    end_at: datetime
    games: tuple[ProposalGame, ...]
    split_reason: str | None


def derive_proposal_windows(
    games: list[ProposalGame],
    timezone: ZoneInfo,
    split_gap_minutes: int = 240,
    pre_margin_minutes: int = 30,
    post_margin_minutes: int = 30,
) -> list[ProposalWindow]:
    """Group games into day-level kiosk windows.

    Games are grouped per calendar day, rather than one window per event.  A
    long break between kickoffs starts a new window; otherwise the resulting
    window covers the first kickoff (minus the configured pre-margin) through
    the last game's end (plus the post-margin).  Legacy rows without a known
    duration use a zero duration and therefore retain the old behaviour.
    """
    ordered = sorted(games, key=lambda game: (game.date, game.kickoff_time, str(game.id)))
    groups: list[list[ProposalGame]] = []
    for game in ordered:
        if not groups or groups[-1][-1].date != game.date:
            groups.append([game])
            continue
        previous = groups[-1][-1]
        previous_at = datetime.combine(previous.date, previous.kickoff_time, timezone)
        current_at = datetime.combine(game.date, game.kickoff_time, timezone)
        if current_at - previous_at > timedelta(minutes=split_gap_minutes):
            groups.append([game])
        else:
            groups[-1].append(game)

    result: list[ProposalWindow] = []
    date_counts: dict[date, int] = {}
    for group in groups:
        date_counts[group[0].date] = date_counts.get(group[0].date, 0) + 1
    for group in groups:
        first = datetime.combine(group[0].date, group[0].kickoff_time, timezone)
        last_kickoff = datetime.combine(group[-1].date, group[-1].kickoff_time, timezone)
        last = last_kickoff + timedelta(minutes=max(0, group[-1].duration_minutes))
        key_source = ",".join(sorted(str(game.id) for game in group))
        key = hashlib.sha256(key_source.encode()).hexdigest()
        split = "KICKOFF_GAP_EXCEEDED" if date_counts[group[0].date] > 1 else None
        result.append(
            ProposalWindow(
                key,
                group[0].date,
                first - timedelta(minutes=max(0, pre_margin_minutes)),
                last + timedelta(minutes=max(0, post_margin_minutes)),
                tuple(group),
                split,
            )
        )
    return result


def exclude_past_windows(windows: list[ProposalWindow], today: date) -> list[ProposalWindow]:
    """Drop windows dated before today; used by list_windows(include_past=False)."""
    return [window for window in windows if window.date >= today]


class ProposalService:
    def __init__(self, db: Session, organization_id: uuid.UUID, split_gap_minutes: int = 240):
        self.db = db
        self.organization_id = organization_id
        self.split_gap_minutes = split_gap_minutes

    def list_windows(self, include_past: bool = False) -> list[ProposalWindowResponse]:
        organization = self.db.get(Organization, self.organization_id)
        if organization is None:
            raise ProposalNotFoundError
        settings = self.db.scalar(
            select(OrganizationSettings).where(
                OrganizationSettings.organization_id == self.organization_id
            )
        )
        lead_minutes = settings.kiosk_lead_minutes if settings else 30
        trail_minutes = settings.kiosk_trail_minutes if settings else 30
        default_duration = settings.default_game_duration_minutes if settings else 90
        patterns = set(
            self.db.scalars(
                select(HomeVenue.name_normalized).where(
                    HomeVenue.organization_id == self.organization_id, HomeVenue.is_active.is_(True)
                )
            )
        )
        events = self.db.scalars(
            select(Event)
            .join(Season)
            .join(ClubYear)
            .where(
                ClubYear.organization_id == self.organization_id,
                Event.kickoff_time.is_not(None),
                Event.status != EventStatus.CANCELLED,
            )
            .order_by(Event.date, Event.kickoff_time)
        ).all()
        games = [
            ProposalGame(
                event.id,
                event.title,
                event.date,
                event.kickoff_time,
                event.location,
                event.duration_minutes or default_duration,
            )
            for event in events
            if event.kickoff_time is not None
            and _matches_home_venue(normalize_venue_name(event.location), patterns)
        ]
        windows = derive_proposal_windows(
            games,
            ZoneInfo(organization.timezone),
            self.split_gap_minutes,
            lead_minutes,
            trail_minutes,
        )
        if not include_past:
            today = datetime.now(ZoneInfo(organization.timezone)).date()
            windows = exclude_past_windows(windows, today)
        overrides = {
            item.window_key: item
            for item in self.db.scalars(
                select(ProposalOverride)
                .options(selectinload(ProposalOverride.splits))
                .where(ProposalOverride.organization_id == self.organization_id)
            )
        }
        rules = list(
            self.db.scalars(
                select(CrewSizeRule)
                .where(
                    CrewSizeRule.organization_id == self.organization_id,
                    CrewSizeRule.is_active.is_(True),
                )
                .order_by(CrewSizeRule.sort_order)
            )
        )
        return [self._response(window, overrides.get(window.id), rules) for window in windows]

    def update(
        self, window_id: str, payload: ProposalOverrideUpdate, actor_user_id: uuid.UUID
    ) -> ProposalWindowResponse:
        windows = {window.id: window for window in self.list_windows(include_past=True)}
        current = windows.get(window_id)
        if current is None:
            raise ProposalNotFoundError
        starts_at = payload.starts_at or current.start_at
        ends_at = payload.ends_at or current.end_at
        if (
            starts_at >= ends_at
            or starts_at.date() != current.date
            or ends_at.date() != current.date
        ):
            raise ProposalValidationError(
                "override times must be ordered and stay on the proposal date"
            )
        item = self.db.scalar(
            select(ProposalOverride)
            .where(
                ProposalOverride.organization_id == self.organization_id,
                ProposalOverride.window_key == window_id,
            )
            .with_for_update()
        )
        if item is None:
            item = ProposalOverride(
                organization_id=self.organization_id,
                window_key=window_id,
                proposal_date=current.date,
            )
            self.db.add(item)
        for field in payload.model_fields_set:
            setattr(item, field, getattr(payload, field))
        self.db.flush()
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="PROPOSAL_OVERRIDE_CHANGED",
                entity_type="proposal_override",
                entity_id=item.id,
                event_metadata={
                    "window_key": window_id,
                    "changed_fields": sorted(payload.model_fields_set),
                },
            )
        )
        self.db.commit()
        return next(
            window for window in self.list_windows(include_past=True) if window.id == window_id
        )

    def confirm(
        self, window_id: str, kind: str, actor_user_id: uuid.UUID
    ) -> ProposalWindowResponse:
        """Confirm one derived window as a real, public signup-capable shift."""
        if kind not in {"kiosk", "grill"}:
            raise ProposalValidationError("unknown proposal type")
        windows = {window.id: window for window in self.list_windows(include_past=True)}
        current = windows.get(window_id)
        if current is None:
            raise ProposalNotFoundError
        item = self.db.scalar(
            select(ProposalOverride)
            .where(
                ProposalOverride.organization_id == self.organization_id,
                ProposalOverride.window_key == window_id,
            )
            .with_for_update()
        )
        if item is None:
            item = ProposalOverride(
                organization_id=self.organization_id,
                window_key=window_id,
                proposal_date=current.date,
            )
            self.db.add(item)
            self.db.flush()
        event_id = current.covered_event_ids[0]
        if kind == "kiosk":
            if not current.kiosk_open:
                raise ProposalValidationError("Kiosk ist für diesen Vorschlag deaktiviert")
            item.kiosk_confirmed = True
            # Kiosk confirmation only unlocks the downstream grill proposal; the
            # materialised shift(s) therefore stay CLOSED rather than OPEN, i.e.
            # not yet public-signup-capable. An admin who split this window into
            # several timed Kiosk sub-shifts (see update_kiosk_shift_splits) gets
            # one real Shift per split instead of the single window-wide shift;
            # each is deduped independently so re-confirming after adding one
            # more split does not touch the already-materialised ones. Only
            # KIOSK-kind splits are read here — any GRILL-kind splits coexisting
            # on the same override are irrelevant to a Kiosk confirmation.
            kiosk_splits = [split for split in item.splits if split.shift_type == ShiftType.KIOSK]
            shift_specs = (
                [
                    (split.starts_at, split.ends_at, split.required_volunteers)
                    for split in kiosk_splits
                ]
                if kiosk_splits
                else [(current.start_at, current.end_at, current.proposed_kiosk_slots or 1)]
            )
            self._materialize_shifts(event_id, ShiftType.KIOSK, ShiftStatus.CLOSED, shift_specs)
            self.db.add(
                AuditEvent(
                    organization_id=self.organization_id,
                    actor_user_id=actor_user_id,
                    action="PROPOSAL_CONFIRMED",
                    entity_type="proposal_override",
                    entity_id=item.id,
                    event_metadata={
                        "window_key": window_id,
                        "kind": kind,
                        "shift_count": len(shift_specs),
                    },
                )
            )
            self.db.commit()
            return next(
                window for window in self.list_windows(include_past=True) if window.id == window_id
            )
        if not current.grill_required:
            raise ProposalValidationError("Grill ist für diesen Vorschlag deaktiviert")
        # A grill proposal may only ever be tied to an already-confirmed Kiosk
        # window; validate before mutating any state on this override.
        if not item.kiosk_confirmed:
            raise ProposalValidationError("Der Kiosk muss zuerst bestätigt werden")
        item.grill_confirmed = True
        required = max(1, current.proposed_grill_slots)
        # Mirrors the Kiosk branch above: only GRILL-kind splits are read here,
        # so an already-saved Kiosk split on the same override is never required
        # by, nor consumed by, confirming Grill.
        grill_splits = [split for split in item.splits if split.shift_type == ShiftType.GRILL]
        shift_specs = (
            [(split.starts_at, split.ends_at, split.required_volunteers) for split in grill_splits]
            if grill_splits
            else [(current.start_at, current.end_at, required)]
        )
        self._materialize_shifts(event_id, ShiftType.GRILL, ShiftStatus.OPEN, shift_specs)
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action="PROPOSAL_CONFIRMED",
                entity_type="proposal_override",
                entity_id=item.id,
                event_metadata={
                    "window_key": window_id,
                    "kind": kind,
                    "shift_count": len(shift_specs),
                },
            )
        )
        self.db.commit()
        return next(
            window for window in self.list_windows(include_past=True) if window.id == window_id
        )

    def _materialize_shifts(
        self,
        event_id: uuid.UUID,
        shift_type: ShiftType,
        status: ShiftStatus,
        shift_specs: list[tuple[datetime, datetime, int]],
    ) -> None:
        """Create one real Shift per (starts_at, ends_at, required_volunteers)
        spec, reconciling against whatever this event/kind already has
        materialised so repeated or racing confirm/reconcile calls converge on
        exactly one Shift per spec instead of accumulating extras:

        - A shift whose time no longer matches any current spec (e.g. an old
          whole-window shift left over from before a later split change) is
          "orphaned" and gets cancelled.
        - Two or more shifts that share the same time (e.g. created by two
          overlapping confirm requests racing each other) are a duplicate
          group; all but one are cancelled.

        Either case is blocked instead of silently resolved if it would drop a
        real volunteer commitment: an orphan with signups, or a duplicate
        group with signups on more than one of its shifts, raises instead of
        cancelling — the caller must resolve that in Anwesenheit first."""
        target_ranges = {(starts_at, ends_at) for starts_at, ends_at, _ in shift_specs}
        existing_shifts = self.db.scalars(
            select(Shift)
            .where(
                Shift.event_id == event_id,
                Shift.shift_type == shift_type,
                Shift.status != ShiftStatus.CANCELLED,
            )
            .order_by(Shift.starts_at, Shift.id)
            .with_for_update()
        ).all()
        orphaned = [
            shift
            for shift in existing_shifts
            if (shift.starts_at, shift.ends_at) not in target_ranges
        ]
        if any(shift.signups for shift in orphaned):
            raise ProposalValidationError(
                "Für eine abweichende Schichtzeit bestehen bereits Anmeldungen. "
                "Bitte zuerst im Bereich Anwesenheit bereinigen, bevor die Aufteilung "
                "geändert wird."
            )
        groups_by_range: dict[tuple[datetime, datetime], list[Shift]] = {}
        for shift in existing_shifts:
            if shift in orphaned:
                continue
            groups_by_range.setdefault((shift.starts_at, shift.ends_at), []).append(shift)

        to_cancel = list(orphaned)
        kept_by_range: dict[tuple[datetime, datetime], Shift] = {}
        for range_key, group in groups_by_range.items():
            with_signups = [shift for shift in group if shift.signups]
            if len(with_signups) > 1:
                raise ProposalValidationError(
                    "Für dieselbe Schichtzeit bestehen mehrere Schichten mit Anmeldungen. "
                    "Bitte zuerst im Bereich Anwesenheit bereinigen."
                )
            keeper = with_signups[0] if with_signups else group[0]
            kept_by_range[range_key] = keeper
            to_cancel.extend(shift for shift in group if shift is not keeper)

        for shift in to_cancel:
            shift.status = ShiftStatus.CANCELLED
        for starts_at, ends_at, required_volunteers in shift_specs:
            if (starts_at, ends_at) not in kept_by_range:
                self.db.add(
                    Shift(
                        event_id=event_id,
                        starts_at=starts_at,
                        ends_at=ends_at,
                        required_volunteers=required_volunteers,
                        status=status,
                        shift_type=shift_type,
                        assignment_mode=ShiftAssignmentMode.OPEN_SIGNUP,
                    )
                )

    def _response(
        self, window: ProposalWindow, override: ProposalOverride | None, rules: list[CrewSizeRule]
    ) -> ProposalWindowResponse:
        count = 1 if len(window.games) <= 3 else 2
        contexts: list[str] = []
        for rule in rules:
            if (
                rule.pattern
                and len(window.games) >= rule.min_games_per_shift
                and any(rule.pattern.casefold() in game.title.casefold() for game in window.games)
            ):
                count = rule.required_griller_count
                contexts.append(rule.pattern)
                break
        start = override.starts_at if override and override.starts_at else window.start_at
        end = override.ends_at if override and override.ends_at else window.end_at
        kiosk = override.kiosk_open if override and override.kiosk_open is not None else True
        grill_requested = (
            override.grill_required if override and override.grill_required is not None else True
        )
        grill = kiosk and grill_requested
        slots = (
            override.proposed_grill_slots
            if override and override.proposed_grill_slots is not None
            else count
        )
        kiosk_slots = (
            override.proposed_kiosk_slots
            if override and override.proposed_kiosk_slots is not None
            else 1
        )
        if not grill:
            slots = 0
        zone = window.start_at.tzinfo
        return ProposalWindowResponse(
            id=window.id,
            date=window.date,
            start_at=start,
            end_at=end,
            kiosk_open=kiosk,
            grill_required=grill,
            proposed_grill_slots=slots,
            proposed_kiosk_slots=kiosk_slots,
            override_state="MANUAL" if override else "PROPOSAL",
            is_overridden=override is not None,
            split_reason=window.split_reason,
            venues=sorted({game.venue for game in window.games}),
            crew_rule_context=", ".join(contexts) or None,
            covered_event_ids=[game.id for game in window.games],
            games=[
                ProposalGameResponse(
                    title=game.title,
                    kickoff_at=datetime.combine(game.date, game.kickoff_time, zone),
                    venue=game.venue,
                )
                for game in window.games
            ],
            kiosk_confirmed=bool(override and override.kiosk_confirmed),
            grill_confirmed=bool(override and override.grill_confirmed),
            grill_shift_splits=[
                ProposalShiftSplitResponse.model_validate(split)
                for split in (override.splits if override else [])
                if split.shift_type == ShiftType.GRILL
            ],
            kiosk_shift_splits=[
                ProposalShiftSplitResponse.model_validate(split)
                for split in (override.splits if override else [])
                if split.shift_type == ShiftType.KIOSK
            ],
        )

    def update_grill_shift_splits(
        self,
        window_id: str,
        payload: ProposalGrillSplitsUpdate,
        actor_user_id: uuid.UUID,
    ) -> ProposalWindowResponse:
        """Replace a window's admin-defined grill sub-shifts (full replace).

        Only touches this override's GRILL-kind splits; any KIOSK-kind splits
        already saved on the same row (see update_kiosk_shift_splits) are left
        untouched, since Kiosk and Grill splits coexist as independent rows.
        """
        return self._replace_shift_splits(
            window_id, payload, actor_user_id, ShiftType.GRILL, "PROPOSAL_GRILL_SPLITS_CHANGED"
        )

    def update_kiosk_shift_splits(
        self,
        window_id: str,
        payload: ProposalKioskSplitsUpdate,
        actor_user_id: uuid.UUID,
    ) -> ProposalWindowResponse:
        """Replace a window's admin-defined Kiosk sub-shifts (full replace).

        Mirrors update_grill_shift_splits exactly, except the new rows are
        KIOSK-kind and only this override's KIOSK-kind splits are replaced; any
        GRILL-kind splits already saved on the same row are left untouched.
        """
        return self._replace_shift_splits(
            window_id, payload, actor_user_id, ShiftType.KIOSK, "PROPOSAL_KIOSK_SPLITS_CHANGED"
        )

    def _replace_shift_splits(
        self,
        window_id: str,
        payload: ProposalGrillSplitsUpdate,
        actor_user_id: uuid.UUID,
        shift_type: ShiftType,
        audit_action: str,
    ) -> ProposalWindowResponse:
        """Full-replace one kind (GRILL or KIOSK) of a window's admin-defined
        sub-shifts, scoped to the still-derived window date (mirroring update()'s
        existing same-day guard) so a split cannot silently drift onto a
        different calendar day than the proposal it belongs to.

        Grill and Kiosk splits coexist as independent rows on the same
        ProposalOverride; a full replace here only ever removes and re-adds
        rows matching `shift_type`, leaving the other kind's rows untouched.
        """
        windows = {window.id: window for window in self.list_windows(include_past=True)}
        current = windows.get(window_id)
        if current is None:
            raise ProposalNotFoundError
        for split in payload.shifts:
            if split.starts_at.date() != current.date or split.ends_at.date() != current.date:
                raise ProposalValidationError("split times must stay on the proposal date")
        item = self.db.scalar(
            select(ProposalOverride)
            .options(selectinload(ProposalOverride.splits))
            .where(
                ProposalOverride.organization_id == self.organization_id,
                ProposalOverride.window_key == window_id,
            )
            .with_for_update()
        )
        if item is None:
            item = ProposalOverride(
                organization_id=self.organization_id,
                window_key=window_id,
                proposal_date=current.date,
            )
            self.db.add(item)
            self.db.flush()
        for existing_split in [split for split in item.splits if split.shift_type == shift_type]:
            item.splits.remove(existing_split)
        for index, split in enumerate(payload.shifts):
            item.splits.append(
                ProposalShiftSplit(
                    starts_at=split.starts_at,
                    ends_at=split.ends_at,
                    required_volunteers=split.required_volunteers,
                    shift_type=shift_type,
                    sort_order=index,
                )
            )
        self.db.add(
            AuditEvent(
                organization_id=self.organization_id,
                actor_user_id=actor_user_id,
                action=audit_action,
                entity_type="proposal_override",
                entity_id=item.id,
                event_metadata={"window_key": window_id, "split_count": len(payload.shifts)},
            )
        )
        self.db.commit()
        return next(
            window for window in self.list_windows(include_past=True) if window.id == window_id
        )
