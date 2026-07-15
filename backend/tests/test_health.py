"""Smoke-Test für den Health-Endpoint (Sprint 1)."""

from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    # "database" ist "ok" mit laufender DB, sonst "unavailable" – nie ein stiller Fehler.
    assert body["database"] in {"ok", "unavailable"}


def test_ready_returns_service_status(client: TestClient) -> None:
    response = client.get("/api/ready")
    assert response.status_code in {200, 503}
    if response.status_code == 200:
        assert response.json() == {"status": "ok", "database": "ok"}
