"""Minimal checks to keep credential-like strings out of long-term memory."""

import re

_SENSITIVE_PATTERNS = (
    re.compile(r"\b(?:api[\s_-]?key|password|passwd|secret|access[\s_-]?token|refresh[\s_-]?token)\b\s*[:=]\s*\S+", re.IGNORECASE),
    re.compile(r"\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,})\b"),
    re.compile(r"\b(?:bearer\s+)[A-Za-z0-9._~+/=-]{16,}", re.IGNORECASE),
)


def contains_sensitive_data(content: str) -> bool:
    return any(pattern.search(content) for pattern in _SENSITIVE_PATTERNS)


def safe_memory_text(content: str) -> str:
    if contains_sensitive_data(content):
        return "[Hidden because this memory may contain a credential. Edit or delete it to manage it.]"
    return content
