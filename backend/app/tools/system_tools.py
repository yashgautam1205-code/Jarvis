"""System information tools."""

from datetime import datetime

from app.monitoring.system import get_all_metrics


def get_system_info() -> dict:
    """Get current system metrics."""
    return get_all_metrics()


def get_time(timezone: str = "local") -> dict:
    """Get current date and time."""
    now = datetime.now()
    return {
        "date": now.strftime("%A, %B %d, %Y"),
        "time": now.strftime("%I:%M:%S %p"),
        "iso": now.isoformat(),
        "timestamp": now.timestamp(),
    }

