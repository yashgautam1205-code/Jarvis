"""Application launcher with allowlist validation."""

import subprocess
import sys

from app.core.logging import get_logger
from app.security.validator import validate_application

logger = get_logger("tools.app_launcher")


def launch_app(app_name: str, args: str = "") -> dict:
    """Launch an allowlisted application."""
    is_valid, exe_or_reason = validate_application(app_name)
    if not is_valid:
        return {"launched": False, "error": exe_or_reason}

    try:
        if args:
            return {"launched": False, "error": "Application arguments are disabled for safety."}
        subprocess.Popen([exe_or_reason], shell=False)

        logger.info(f"Launched application: {app_name} ({exe_or_reason})")
        return {"launched": True, "app": app_name, "executable": exe_or_reason}

    except FileNotFoundError:
        return {"launched": False, "error": f"Application '{exe_or_reason}' not found on this system"}
    except Exception as e:
        return {"launched": False, "error": str(e)}
