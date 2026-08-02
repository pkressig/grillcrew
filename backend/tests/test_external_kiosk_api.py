from fastapi.routing import APIRoute

from app.api import external_kiosk
from app.api.dependencies import validate_csrf
from app.main import app


def test_external_kiosk_routes_use_coordination_guard_and_mutations_use_csrf() -> None:
    routes = [route for route in external_kiosk.router.routes if isinstance(route, APIRoute)]
    assert routes
    for route in routes:
        dependencies = {dependency.call for dependency in route.dependant.dependencies}
        assert external_kiosk.manage in dependencies
        if (route.methods or set()) & {"POST", "PATCH", "DELETE"}:
            assert validate_csrf in dependencies


def test_external_kiosk_api_is_not_publicly_mounted() -> None:
    assert not any(
        "/api/public/" in path and "external-kiosk" in path for path in app.openapi()["paths"]
    )
