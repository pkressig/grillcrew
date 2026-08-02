from datetime import date, time
from uuid import UUID
from zoneinfo import ZoneInfo

from app.services.proposals import ProposalGame, derive_proposal_windows


def game(value: int, kickoff: time, venue: str = "Sportplatz") -> ProposalGame:
    return ProposalGame(UUID(int=value), f"Spiel {value}", date(2026, 8, 2), kickoff, venue)


def test_groups_games_with_thirty_minute_margins() -> None:
    windows = derive_proposal_windows(
        [game(1, time(10)), game(2, time(13))], ZoneInfo("Europe/Zurich")
    )
    assert len(windows) == 1
    assert windows[0].start_at.time() == time(9, 30)
    assert windows[0].end_at.time() == time(13, 30)
    assert [item.id for item in windows[0].games] == [UUID(int=1), UUID(int=2)]


def test_gap_equal_to_four_hours_remains_continuous() -> None:
    assert (
        len(derive_proposal_windows([game(1, time(10)), game(2, time(14))], ZoneInfo("UTC"))) == 1
    )


def test_gap_greater_than_four_hours_splits_and_marks_reason() -> None:
    windows = derive_proposal_windows([game(1, time(9)), game(2, time(13, 1))], ZoneInfo("UTC"))
    assert len(windows) == 2
    assert all(item.split_reason == "KICKOFF_GAP_EXCEEDED" for item in windows)


def test_empty_games_returns_empty_state() -> None:
    assert derive_proposal_windows([], ZoneInfo("UTC")) == []


def test_multiple_venues_are_kept_in_same_daily_window() -> None:
    windows = derive_proposal_windows(
        [game(1, time(10), "A"), game(2, time(11), "B")], ZoneInfo("UTC")
    )
    assert {item.venue for item in windows[0].games} == {"A", "B"}
