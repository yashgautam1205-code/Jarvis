"""
Security validators: path validation, action validation, allowlists.
"""

import re
from pathlib import Path
from urllib.parse import urlsplit

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("security.validator")

# Allowlisted applications that can be launched
ALLOWED_APPLICATIONS: dict[str, str] = {
    "notepad": "notepad.exe",
    "calculator": "calc.exe",
    "explorer": "explorer.exe",
    "vscode": "code",
    "chrome": "chrome.exe",
    "edge": "msedge.exe",
    "firefox": "firefox.exe",
    "paint": "mspaint.exe",
    "task_manager": "taskmgr.exe",
}

# Blocked file extensions for safety
BLOCKED_EXTENSIONS: set[str] = {
    ".exe", ".bat", ".cmd", ".com", ".scr", ".pif", ".vbs", ".vbe",
    ".js", ".jse", ".wsf", ".wsh", ".msi", ".msp", ".reg",
}

# Allowed actions for tools
ALLOWED_ACTIONS: set[str] = {
    "launch_app", "open_url", "read_file", "write_file", "list_directory",
    "get_system_info", "get_time", "get_date", "search_web", "search_music", "control_media",
    "create_directory", "get_file_info",
}


def validate_path(path_str: str) -> tuple[bool, str]:
    """
    Validate a file path against allowed directories.
    Returns (is_valid, reason).
    """
    try:
        target = Path(path_str).resolve()
    except (ValueError, OSError) as e:
        return False, f"Invalid path: {e}"

    # Check for null bytes
    if "\x00" in path_str:
        return False, "Path contains null bytes"

    # Check for path traversal patterns
    if ".." in path_str:
        # Still resolve and check against allowed dirs
        pass

    # Check against allowed directories
    allowed_dirs = settings.allowed_directory_list
    is_allowed = any(
        _is_subpath(target, allowed_dir.resolve())
        for allowed_dir in allowed_dirs
    )

    if not is_allowed:
        logger.warning(f"Path access denied: {target}")
        return False, f"Path '{target}' is outside allowed directories"

    return True, "OK"


def _is_subpath(path: Path, parent: Path) -> bool:
    """Check if path is a subpath of parent."""
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def validate_application(app_name: str) -> tuple[bool, str]:
    """
    Validate that an application is in the allowlist.
    Returns (is_valid, executable_name).
    """
    app_key = app_name.lower().strip()
    if app_key in ALLOWED_APPLICATIONS:
        return True, ALLOWED_APPLICATIONS[app_key]
    return False, f"Application '{app_name}' is not in the allowlist. Allowed: {', '.join(sorted(ALLOWED_APPLICATIONS.keys()))}"


def validate_url(url: str) -> tuple[bool, str]:
    """
    Validate a URL for safety.
    Returns (is_valid, reason).
    """
    url = url.strip()
    if not url:
        return False, "URL is empty"

    try:
        parsed = urlsplit(url)
        valid_port = parsed.port is None or 1 <= parsed.port <= 65535
    except ValueError:
        return False, "Invalid URL format"

    if (
        parsed.scheme.lower() not in {"http", "https"}
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or not valid_port
        or any(character.isspace() for character in url)
    ):
        return False, f"Invalid URL format: {url}"

    return True, "OK"


def validate_file_extension(filename: str, for_write: bool = False) -> tuple[bool, str]:
    """
    Validate file extension.
    Returns (is_valid, reason).
    """
    ext = Path(filename).suffix.lower()
    if for_write and ext in BLOCKED_EXTENSIONS:
        return False, f"Writing files with extension '{ext}' is not allowed"
    return True, "OK"


def validate_action(action: str) -> tuple[bool, str]:
    """
    Validate that an action is allowed.
    Returns (is_valid, reason).
    """
    if action in ALLOWED_ACTIONS:
        return True, "OK"
    return False, f"Action '{action}' is not allowed. Allowed: {', '.join(sorted(ALLOWED_ACTIONS))}"


def sanitize_filename(filename: str) -> str:
    """Sanitize a filename by removing dangerous characters."""
    # Remove null bytes and path separators
    filename = filename.replace("\x00", "").replace("/", "_").replace("\\", "_")
    # Remove other dangerous characters
    filename = re.sub(r'[<>:"|?*]', '_', filename)
    # Limit length
    if len(filename) > 255:
        filename = filename[:255]
    return filename
