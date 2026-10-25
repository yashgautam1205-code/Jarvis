"""
Application configuration using Pydantic Settings.
All environment variables are loaded here.
"""

import os
from pathlib import Path
from typing import Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_env_files = [
    Path(__file__).resolve().parents[3] / ".env",
    Path(__file__).resolve().parents[2] / ".env",
]
if os.environ.get("JARVIS_ENV_FILE"):
    _env_files.append(Path(os.environ["JARVIS_ENV_FILE"]))


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=tuple(_env_files),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    app_name: str = "JARVIS AI Desktop Assistant"
    app_version: str = "1.0.0"
    debug: bool = False

    @field_validator("debug", mode="before")
    @classmethod
    def parse_debug(cls, v):
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes", "on", "debug")
        return bool(v)
    host: str = "127.0.0.1"
    port: int = 8000

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"

    # Local Ollama is the default; hosted OpenAI is opt-in.
    ai_provider: str = "ollama"

    # Optional hosted AI. Only used when ai_provider is explicitly 'openai'.
    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o-mini"
    openai_max_tokens: int = 4096
    openai_temperature: float = 0.7

    # Ollama (Local AI - 'gemma:2b' for instant ms replies, 'qwen3:8b' for heavy reasoning)
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen3:8b"

    # Keyless HTML search. Use {query} in the URL for engines with custom paths.
    search_provider: str = "duckduckgo"
    search_engine_url: str = "https://html.duckduckgo.com/html/?q={query}"
    search_timeout_seconds: float = Field(default=10.0, gt=0, le=60)

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/jarvis.db"
    database_path: str = str(Path(__file__).resolve().parent.parent.parent / "data" / "jarvis.db")

    # Voice
    whisper_model: str = "base"
    tts_enabled: bool = False
    voice_speed: float = Field(default=1.0, ge=0.5, le=2.0)
    piper_executable: str = "piper"
    piper_model_path: str = "models/en_US-lessac-medium.onnx"
    wake_word_enabled: bool = False
    wake_word_model: str = "hey_jarvis"
    wake_word_threshold: float = Field(default=0.5, ge=0.1, le=1)
    wake_word_cooldown_seconds: float = Field(default=5.0, ge=1, le=60)

    # Security
    allowed_directories: str = str(Path.home())
    max_file_size_mb: int = 50

    # Logging
    log_level: str = "INFO"
    log_file: str = str(Path(__file__).resolve().parent.parent.parent / "data" / "jarvis.log")

    @property
    def cors_origin_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_directory_list(self) -> list[Path]:
        """Parse allowed directories from comma-separated string."""
        return [Path(d.strip()) for d in self.allowed_directories.split(",") if d.strip()]

    @property
    def has_openai_key(self) -> bool:
        """Check if OpenAI API key is configured and not a placeholder."""
        if not self.openai_api_key or not self.openai_api_key.strip():
            return False
        key = self.openai_api_key.strip()
        if "your-key" in key or "your-openai" in key or key.startswith("sk-your"):
            return False
        return True

    @field_validator("search_provider")
    @classmethod
    def validate_search_provider(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized in {"none", "serper"}:
            return "duckduckgo"
        if normalized not in {"duckduckgo", "custom"}:
            raise ValueError("SEARCH_PROVIDER must be either 'duckduckgo' or 'custom'.")
        return normalized


# Singleton settings instance
settings = Settings()
