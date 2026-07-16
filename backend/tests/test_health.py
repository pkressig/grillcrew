"""Smoke-Tests für den Health-Endpoint (Sprint 1)."""

from fastapi.testclient import TestClient

from app.db.session import get_db
from app.main import app


class _HealthyDb:
    def execute(self, *args: object, **kwargs: object) -> None:
        return None


class _UnavailableDb:
    def execute(self, *args: object, **kwargs: object) -> None:
        raise RuntimeError("database unavailable")


def test_health_returns_ok(client: TestClient) -> None:
    def fake_get_db() -> object:
        return _HealthyDb()

    app.dependency_overrides[get_db] = fake_get_db
    try:
        response = client.get("/api/health")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_returns_unavailable_when_database_check_fails(client: TestClient) -> None:
    def fake_get_db() -> object:
        return _UnavailableDb()

    app.dependency_overrides[get_db] = fake_get_db
    try:
        response = client.get("/api/health")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "unavailable"}


def test_ready_returns_ok_when_database_check_succeeds(client: TestClient) -> None:
    def fake_get_db() -> object:
        return _HealthyDb()

    app.dependency_overrides[get_db] = fake_get_db
    try:
        response = client.get("/api/ready")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_ready_returns_503_when_database_check_fails(client: TestClient) -> None:
    def fake_get_db() -> object:
        return _UnavailableDb()

    app.dependency_overrides[get_db] = fake_get_db
    try:
        response = client.get("/api/ready")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json()["detail"] == "database unavailable"
