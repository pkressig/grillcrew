from datetime import date, time
from io import BytesIO
from pathlib import Path

import pytest
from openpyxl import Workbook

from app.services.external_kiosk_parser import ExternalKioskCategory, parse_external_kiosk_plan


def _fixture() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Tabelle1"
    sheet.append(["Test plan"])
    sheet.append(
        [
            "Datum",
            "Zeiten",
            "Person A",
            "Person B",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "Datum",
            "Grill-Zeiten",
            "Pommes/Chicken",
            "Notiz",
        ]
    )
    sheet.append(
        [
            date(2025, 8, 2),
            "08.00-20.00",
            "08.00-Schluss",
            " --",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            date(2025, 8, 2),
            "11.00-14.00/15.00-18.00 / 1",
            "Pause 15.00",
            "Turnier",
        ]
    )
    sheet.append(
        [
            date(2025, 11, 2),
            "10.00-14.00",
            "ja",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            date(2025, 11, 2),
            "evtl. 11.00-14.00 / 1",
            None,
            None,
        ]
    )
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def test_matrix_parser_preserves_coverage_assignments_segments_and_notes() -> None:
    rows = parse_external_kiosk_plan(_fixture())
    assert len(rows) == 7
    coverage = rows[0]
    assert (coverage.category, coverage.start_time, coverage.end_time) == (
        ExternalKioskCategory.KIOSK,
        time(8),
        time(20),
    )
    assignment = rows[1]
    assert assignment.assigned_person_text == "Person A"
    assert (assignment.start_time, assignment.end_time) == (time(8), time(20))
    grills = [row for row in rows if row.category == ExternalKioskCategory.GRILL]
    assert [(row.start_time, row.end_time) for row in grills] == [
        (time(11), time(14)),
        (time(15), time(18)),
        (time(11), time(14)),
    ]
    assert grills[0].raw_time == "11.00-14.00/15.00-18.00 / 1"
    assert grills[0].source_note == "Pause 15.00; Turnier"


def test_non_time_assignment_is_preserved_as_person_presence() -> None:
    rows = parse_external_kiosk_plan(_fixture())
    assignment = next(
        row
        for row in rows
        if row.assigned_person_text == "Person A" and row.plan_date == date(2025, 11, 2)
    )
    assert assignment.start_time is None
    assert assignment.end_time is None
    assert assignment.raw_time == "ja"


def test_supplied_reference_workbook_parses_expected_matrix() -> None:
    candidates = list(Path.home().joinpath("Downloads").glob("Kiosk- u. Grillplan Fr*2026.xlsx"))
    if not candidates:
        pytest.skip("supplied reference workbook is not available")
    rows = parse_external_kiosk_plan(candidates[0].read_bytes())
    assert {row.source_row for row in rows} == set(range(3, 13)) | set(range(14, 24)) | set(
        range(25, 35)
    ) | {36}
    assert not any(row.source_row == 37 for row in rows)
    split = [
        row for row in rows if row.source_row == 31 and row.category == ExternalKioskCategory.GRILL
    ]
    assert [(row.start_time, row.end_time) for row in split] == [
        (time(11), time(14)),
        (time(15), time(18)),
    ]


def test_malformed_upload_has_safe_validation_error() -> None:
    with pytest.raises(ValueError, match="keine lesbare Excel"):
        parse_external_kiosk_plan(b"not-an-xlsx")
