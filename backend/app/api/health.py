"""Health check endpoint."""

from fastapi import APIRouter
from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Return process liveness without waiting on optional local AI services."""
    return {
        "status": "online",
        "app": settings.app_name,
        "version": settings.app_version,
    }
