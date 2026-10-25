"""System monitoring API endpoints."""

from fastapi import APIRouter
from app.monitoring.system import get_all_metrics

router = APIRouter()


@router.get("/system/metrics")
async def system_metrics():
    """Return real system metrics."""
    return get_all_metrics()

