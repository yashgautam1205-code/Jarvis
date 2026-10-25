"""
Structured logging setup for the JARVIS backend.
"""

import logging
import logging.handlers
import sys
from pathlib import Path

from app.core.config import settings


def setup_logging() -> logging.Logger:
    """Configure structured logging with file and console handlers."""
    logger = logging.getLogger("jarvis")
    logger.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))

    # Prevent duplicate handlers on re-init
    if logger.handlers:
        return logger

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.DEBUG if settings.debug else logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # File handler with rotation
    try:
        log_path = Path(settings.log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.handlers.RotatingFileHandler(
            filename=str(log_path),
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except (OSError, PermissionError) as e:
        logger.warning(f"Could not create log file: {e}")

    return logger


# Module-level logger instance
logger = setup_logging()


def get_logger(name: str) -> logging.Logger:
    """Get a child logger with the given name."""
    return logging.getLogger(f"jarvis.{name}")
