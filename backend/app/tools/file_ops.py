"""Safe file operations with path validation."""

from pathlib import Path

from app.core.logging import get_logger
from app.security.validator import validate_path, validate_file_extension

logger = get_logger("tools.file_ops")


def read_file(file_path: str, max_lines: int = 200) -> dict:
    """Read the contents of a validated file."""
    is_valid, reason = validate_path(file_path)
    if not is_valid:
        return {"error": reason}

    path = Path(file_path)
    if not path.exists():
        return {"error": f"File not found: {file_path}"}
    if not path.is_file():
        return {"error": f"Not a file: {file_path}"}

    try:
        size = path.stat().st_size
        if size > 10 * 1024 * 1024:  # 10MB limit
            return {"error": "File too large (>10MB)"}

        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        truncated = len(lines) > max_lines
        content = "\n".join(lines[:max_lines])
        return {
            "path": str(path),
            "content": content,
            "lines": min(len(lines), max_lines),
            "total_lines": len(lines),
            "truncated": truncated,
            "size_bytes": size,
        }
    except Exception as e:
        return {"error": str(e)}


def write_file(file_path: str, content: str, append: bool = False) -> dict:
    """Write content to a validated file path."""
    is_valid, reason = validate_path(file_path)
    if not is_valid:
        return {"error": reason}

    ext_valid, ext_reason = validate_file_extension(file_path, for_write=True)
    if not ext_valid:
        return {"error": ext_reason}

    try:
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append else "w"
        path.open(mode, encoding="utf-8").write(content)
        logger.info(f"Wrote file: {path} ({len(content)} chars, append={append})")
        return {
            "path": str(path),
            "written": True,
            "size_bytes": path.stat().st_size,
            "mode": "append" if append else "write",
        }
    except Exception as e:
        return {"error": str(e)}


def list_directory(dir_path: str, show_hidden: bool = False) -> dict:
    """List contents of a validated directory."""
    is_valid, reason = validate_path(dir_path)
    if not is_valid:
        return {"error": reason}

    path = Path(dir_path)
    if not path.exists():
        return {"error": f"Directory not found: {dir_path}"}
    if not path.is_dir():
        return {"error": f"Not a directory: {dir_path}"}

    try:
        items = []
        for item in sorted(path.iterdir()):
            if not show_hidden and item.name.startswith("."):
                continue
            items.append({
                "name": item.name,
                "type": "directory" if item.is_dir() else "file",
                "size": item.stat().st_size if item.is_file() else None,
            })

        return {"path": str(path), "items": items[:200], "total": len(items)}
    except PermissionError:
        return {"error": f"Permission denied: {dir_path}"}
    except Exception as e:
        return {"error": str(e)}


def create_directory(dir_path: str) -> dict:
    """Create a directory at a validated path."""
    is_valid, reason = validate_path(dir_path)
    if not is_valid:
        return {"error": reason}

    try:
        path = Path(dir_path)
        path.mkdir(parents=True, exist_ok=True)
        return {"path": str(path), "created": True}
    except Exception as e:
        return {"error": str(e)}


def get_file_info(file_path: str) -> dict:
    """Get metadata about a file."""
    is_valid, reason = validate_path(file_path)
    if not is_valid:
        return {"error": reason}

    path = Path(file_path)
    if not path.exists():
        return {"error": f"Path not found: {file_path}"}

    try:
        stat = path.stat()
        return {
            "path": str(path),
            "name": path.name,
            "extension": path.suffix,
            "type": "directory" if path.is_dir() else "file",
            "size_bytes": stat.st_size,
            "size_human": _human_size(stat.st_size),
            "modified": stat.st_mtime,
            "created": stat.st_ctime,
        }
    except Exception as e:
        return {"error": str(e)}


def _human_size(size: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if size < 1024:
            return f"{size:.1f} {unit}"
        size /= 1024
    return f"{size:.1f} TB"

