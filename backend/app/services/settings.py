"""Organization settings, home-venue allowlist, and crew-size rule administration."""

import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.organization import (
    CrewSizeRule,
    HomeVenue,
    MenuType,
    Organization,
    OrganizationSettings,
    Theme,
)
from app.schemas.settings import (
    CrewSizeRuleCreate,
    CrewSizeRuleUpdate,
    HomeVenueCreate,
    HomeVenueUpdate,
    OrganizationSettingsUpdate,
    ThemeUpdate,
)

_DEFAULT_CATCHALL_MENU_TYPE = MenuType.FRIES_NUGGETS
_DEFAULT_CATCHALL_GRILLER_COUNT = 1


class SettingsNotFoundError(Exception):
    pass


class SettingsConflictError(Exception):
    pass


class SettingsValidationError(Exception):
    pass


def normalize_venue_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip()).casefold()


class SettingsService:
    def __init__(self, db: Session, organization_id: uuid.UUID) -> None:
        self.db = db
        self.organization_id = organization_id

    # -- Organization settings -------------------------------------------------

    def get_organization_settings(self) -> OrganizationSettings:
        settings = self.db.scalar(
            select(OrganizationSettings).where(
                OrganizationSettings.organization_id == self.organization_id
            )
        )
        if settings is None:
            raise SettingsNotFoundError
        return settings

    def update_organization_settings(
        self, payload: OrganizationSettingsUpdate
    ) -> OrganizationSettings:
        settings = self.get_organization_settings()
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(settings, field, value)
        self.db.commit()
        self.db.refresh(settings)
        return settings

    # -- Theme / branding --------------------------------------------------------

    def get_theme(self) -> Theme:
        organization = self.db.scalar(
            select(Organization).where(Organization.id == self.organization_id)
        )
        if organization is None:
            raise SettingsNotFoundError
        theme = self.db.scalar(select(Theme).where(Theme.id == organization.theme_id))
        if theme is None:
            raise SettingsNotFoundError
        return theme

    def update_theme(self, payload: ThemeUpdate) -> Theme:
        theme = self.get_theme()
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(theme, field, value)
        self.db.commit()
        self.db.refresh(theme)
        return theme

    # -- Home venues -------------------------------------------------------------

    def list_home_venues(self) -> list[HomeVenue]:
        return list(
            self.db.scalars(
                select(HomeVenue)
                .where(HomeVenue.organization_id == self.organization_id)
                .order_by(HomeVenue.name)
            )
        )

    def create_home_venue(self, payload: HomeVenueCreate) -> HomeVenue:
        name_normalized = normalize_venue_name(payload.name)
        existing = self.db.scalar(
            select(HomeVenue).where(
                HomeVenue.organization_id == self.organization_id,
                HomeVenue.name_normalized == name_normalized,
            )
        )
        if existing is not None:
            existing.name = payload.name
            existing.is_active = True
            self.db.commit()
            self.db.refresh(existing)
            return existing
        venue = HomeVenue(
            organization_id=self.organization_id,
            name=payload.name,
            name_normalized=name_normalized,
            is_active=True,
        )
        self.db.add(venue)
        self.db.commit()
        self.db.refresh(venue)
        return venue

    def update_home_venue(self, venue_id: uuid.UUID, payload: HomeVenueUpdate) -> HomeVenue:
        venue = self._get_home_venue(venue_id)
        updates = payload.model_dump(exclude_unset=True)
        if "name" in updates:
            name_normalized = normalize_venue_name(updates["name"])
            conflict = self.db.scalar(
                select(HomeVenue).where(
                    HomeVenue.organization_id == self.organization_id,
                    HomeVenue.name_normalized == name_normalized,
                    HomeVenue.id != venue_id,
                )
            )
            if conflict is not None:
                raise SettingsConflictError("a home venue with this name already exists")
            venue.name_normalized = name_normalized
        for field, value in updates.items():
            setattr(venue, field, value)
        self.db.commit()
        self.db.refresh(venue)
        return venue

    def _get_home_venue(self, venue_id: uuid.UUID) -> HomeVenue:
        venue = self.db.scalar(
            select(HomeVenue).where(
                HomeVenue.id == venue_id,
                HomeVenue.organization_id == self.organization_id,
            )
        )
        if venue is None:
            raise SettingsNotFoundError
        return venue

    # -- Crew-size rules -----------------------------------------------------

    def list_crew_size_rules(self) -> list[CrewSizeRule]:
        self._ensure_catchall_rule()
        return self._ordered_rules()

    def create_crew_size_rule(self, payload: CrewSizeRuleCreate) -> CrewSizeRule:
        self._ensure_catchall_rule()
        next_order = self.db.scalar(
            select(CrewSizeRule.sort_order)
            .where(
                CrewSizeRule.organization_id == self.organization_id,
                CrewSizeRule.pattern.is_not(None),
            )
            .order_by(CrewSizeRule.sort_order.desc())
        )
        rule = CrewSizeRule(
            organization_id=self.organization_id,
            sort_order=(next_order + 1) if next_order is not None else 0,
            pattern=payload.pattern,
            menu_type=payload.menu_type,
            required_griller_count=payload.required_griller_count,
            min_games_per_shift=payload.min_games_per_shift,
            is_active=True,
        )
        self.db.add(rule)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def update_crew_size_rule(
        self, rule_id: uuid.UUID, payload: CrewSizeRuleUpdate
    ) -> CrewSizeRule:
        rule = self._get_crew_size_rule(rule_id)
        updates = payload.model_dump(exclude_unset=True)
        is_catchall = rule.pattern is None
        if "pattern" in updates:
            if is_catchall and updates["pattern"] is not None:
                raise SettingsValidationError("the default rule must keep an empty pattern")
            if not is_catchall and updates["pattern"] is None:
                raise SettingsValidationError("only the default rule may have an empty pattern")
        if is_catchall and updates.get("is_active") is False:
            raise SettingsValidationError("the default rule cannot be deactivated")
        for field, value in updates.items():
            setattr(rule, field, value)
        self.db.commit()
        self.db.refresh(rule)
        return rule

    def reorder_crew_size_rules(self, ordered_ids: list[uuid.UUID]) -> list[CrewSizeRule]:
        self._ensure_catchall_rule()
        rules = {
            rule.id: rule
            for rule in self.db.scalars(
                select(CrewSizeRule).where(
                    CrewSizeRule.organization_id == self.organization_id,
                    CrewSizeRule.pattern.is_not(None),
                )
            )
        }
        if set(ordered_ids) != set(rules.keys()):
            raise SettingsValidationError(
                "ordered_ids must contain exactly the organization's non-default rules"
            )
        for index, rule_id in enumerate(ordered_ids):
            rules[rule_id].sort_order = index
        self.db.commit()
        return self._ordered_rules()

    def _get_crew_size_rule(self, rule_id: uuid.UUID) -> CrewSizeRule:
        rule = self.db.scalar(
            select(CrewSizeRule).where(
                CrewSizeRule.id == rule_id,
                CrewSizeRule.organization_id == self.organization_id,
            )
        )
        if rule is None:
            raise SettingsNotFoundError
        return rule

    def _ensure_catchall_rule(self) -> CrewSizeRule:
        catchall = self.db.scalar(
            select(CrewSizeRule).where(
                CrewSizeRule.organization_id == self.organization_id,
                CrewSizeRule.pattern.is_(None),
            )
        )
        if catchall is not None:
            return catchall
        catchall = CrewSizeRule(
            organization_id=self.organization_id,
            sort_order=0,
            pattern=None,
            menu_type=_DEFAULT_CATCHALL_MENU_TYPE,
            required_griller_count=_DEFAULT_CATCHALL_GRILLER_COUNT,
            min_games_per_shift=1,
            is_active=True,
        )
        self.db.add(catchall)
        self.db.commit()
        self.db.refresh(catchall)
        return catchall

    def _ordered_rules(self) -> list[CrewSizeRule]:
        return list(
            self.db.scalars(
                select(CrewSizeRule)
                .where(CrewSizeRule.organization_id == self.organization_id)
                .order_by(CrewSizeRule.pattern.is_(None), CrewSizeRule.sort_order)
            )
        )

    def suggest_crew_size(self, team_text: str, concurrent_games: int = 1) -> CrewSizeRule | None:
        """Return the first active rule whose pattern matches `team_text`.

        Rules are evaluated in `_ordered_rules()` order (catch-all always last, regardless of
        stored `sort_order`), first match wins. A rule only matches when `concurrent_games` meets
        its `min_games_per_shift` threshold; since a `Shift` belongs to exactly one `Event` today,
        callers always pass `concurrent_games=1`, so rules requiring more than one concurrent game
        never match yet (multi-game shift consolidation is a future, undecided contract).
        """
        normalized_text = team_text.casefold()
        for rule in self._ordered_rules():
            if not rule.is_active:
                continue
            if concurrent_games < rule.min_games_per_shift:
                continue
            if rule.pattern is None or rule.pattern.casefold() in normalized_text:
                return rule
        return None
