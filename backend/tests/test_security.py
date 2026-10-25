"""Security validator tests."""

import pytest
from pathlib import Path
from app.security.validator import (
    validate_path,
    validate_application,
    validate_url,
    validate_file_extension,
    validate_action,
    sanitize_filename,
)


def test_validate_application_allowed():
    is_valid, exe = validate_application("notepad")
    assert is_valid
    assert exe == "notepad.exe"


def test_validate_application_denied():
    is_valid, reason = validate_application("malware")
    assert not is_valid
    assert "not in the allowlist" in reason


def test_validate_url_valid():
    assert validate_url("https://google.com")[0] is True
    assert validate_url("http://localhost:8000")[0] is True


def test_validate_url_invalid():
    assert validate_url("")[0] is False
    assert validate_url("ftp://bad.com")[0] is False
    assert validate_url("javascript:alert(1)")[0] is False


def test_validate_file_extension():
    assert validate_file_extension("test.txt")[0] is True
    assert validate_file_extension("test.exe", for_write=True)[0] is False
    assert validate_file_extension("test.bat", for_write=True)[0] is False
    assert validate_file_extension("test.py", for_write=True)[0] is True


def test_validate_action():
    assert validate_action("launch_app")[0] is True
    assert validate_action("read_file")[0] is True
    assert validate_action("delete_system32")[0] is False


def test_sanitize_filename():
    assert sanitize_filename("test.txt") == "test.txt"
    assert "\\" not in sanitize_filename("path\\file.txt")
    assert "/" not in sanitize_filename("path/file.txt")
    assert "\x00" not in sanitize_filename("null\x00byte.txt")

