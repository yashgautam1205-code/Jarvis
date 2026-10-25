"""
System monitoring using psutil. Returns real system metrics.
"""

from datetime import datetime, timezone
from typing import Any, Optional

import psutil

from app.core.logging import get_logger

logger = get_logger("monitoring.system")


def get_cpu_metrics() -> dict[str, Any]:
    """Get CPU usage metrics."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.5)
        cpu_count = psutil.cpu_count()
        cpu_count_logical = psutil.cpu_count(logical=True)
        cpu_freq = psutil.cpu_freq()

        return {
            "percent": cpu_percent,
            "count_physical": cpu_count,
            "count_logical": cpu_count_logical,
            "frequency_mhz": round(cpu_freq.current, 2) if cpu_freq else None,
            "frequency_max_mhz": round(cpu_freq.max, 2) if cpu_freq and cpu_freq.max else None,
        }
    except Exception as e:
        logger.error(f"Error getting CPU metrics: {e}")
        return {"percent": 0, "error": str(e)}


def get_memory_metrics() -> dict[str, Any]:
    """Get RAM usage metrics."""
    try:
        mem = psutil.virtual_memory()
        return {
            "total_gb": round(mem.total / (1024 ** 3), 2),
            "available_gb": round(mem.available / (1024 ** 3), 2),
            "used_gb": round(mem.used / (1024 ** 3), 2),
            "percent": mem.percent,
        }
    except Exception as e:
        logger.error(f"Error getting memory metrics: {e}")
        return {"percent": 0, "error": str(e)}


def get_disk_metrics() -> list[dict[str, Any]]:
    """Get disk usage metrics for all partitions."""
    disks = []
    try:
        for partition in psutil.disk_partitions(all=False):
            try:
                usage = psutil.disk_usage(partition.mountpoint)
                disks.append({
                    "device": partition.device,
                    "mountpoint": partition.mountpoint,
                    "fstype": partition.fstype,
                    "total_gb": round(usage.total / (1024 ** 3), 2),
                    "used_gb": round(usage.used / (1024 ** 3), 2),
                    "free_gb": round(usage.free / (1024 ** 3), 2),
                    "percent": usage.percent,
                })
            except (PermissionError, OSError):
                continue
    except Exception as e:
        logger.error(f"Error getting disk metrics: {e}")
    return disks


def get_network_metrics() -> dict[str, Any]:
    """Get network I/O metrics."""
    try:
        net_io = psutil.net_io_counters()
        return {
            "bytes_sent": net_io.bytes_sent,
            "bytes_recv": net_io.bytes_recv,
            "bytes_sent_mb": round(net_io.bytes_sent / (1024 ** 2), 2),
            "bytes_recv_mb": round(net_io.bytes_recv / (1024 ** 2), 2),
            "packets_sent": net_io.packets_sent,
            "packets_recv": net_io.packets_recv,
        }
    except Exception as e:
        logger.error(f"Error getting network metrics: {e}")
        return {"error": str(e)}


def get_battery_metrics() -> Optional[dict[str, Any]]:
    """Get battery metrics if available."""
    try:
        battery = psutil.sensors_battery()
        if battery is None:
            return None
        return {
            "percent": battery.percent,
            "power_plugged": battery.power_plugged,
            "seconds_left": battery.secsleft if battery.secsleft != psutil.POWER_TIME_UNLIMITED else None,
            "time_left": _format_time(battery.secsleft) if battery.secsleft not in (
                psutil.POWER_TIME_UNLIMITED, psutil.POWER_TIME_UNKNOWN
            ) else "N/A",
        }
    except Exception as e:
        logger.error(f"Error getting battery metrics: {e}")
        return None


def _format_time(seconds: int) -> str:
    """Format seconds into human-readable time."""
    if seconds <= 0:
        return "N/A"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours}h {minutes}m"


def get_all_metrics() -> dict[str, Any]:
    """Get all system metrics."""
    return {
        "cpu": get_cpu_metrics(),
        "memory": get_memory_metrics(),
        "disk": get_disk_metrics(),
        "network": get_network_metrics(),
        "battery": get_battery_metrics(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "boot_time": datetime.fromtimestamp(
            psutil.boot_time(), tz=timezone.utc
        ).isoformat(),
    }
