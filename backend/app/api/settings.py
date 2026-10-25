"""Settings API endpoints."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
import httpx
import re
from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal
import json

from app.core.database import get_db
from app.core.config import settings
from app.memory.repository import SettingsRepository
from app.ai.provider import ai_provider
from app.voice.wake_word import wake_word_service
from app.core.logging import get_logger

router = APIRouter()
logger = get_logger("api.settings")
SettingKey = Literal[
    "ai_provider",
    "ai_model",
    "ollama_model",
    "tts_enabled",
    "voice_speed",
    "theme_intensity",
    "animations_enabled",
    "scan_lines",
    "particles",
    "confirm_dangerous",
    "spotify_client_id",
]


class SettingsUpdate(BaseModel):
    key: SettingKey
    value: str = Field(max_length=200)

    @model_validator(mode="after")
    def validate_setting_value(self):
        if self.key == "ai_provider" and self.value not in {"auto", "openai", "ollama"}:
            raise ValueError("AI provider must be auto, openai, or ollama.")
        if self.key in {
            "tts_enabled",
            "animations_enabled",
            "scan_lines",
            "particles",
            "confirm_dangerous",
        } and self.value not in {"true", "false"}:
            raise ValueError(f"{self.key} must be true or false.")
        if self.key == "voice_speed":
            try:
                speed = float(self.value)
            except ValueError as exc:
                raise ValueError("Voice speed must be between 0.5 and 2.") from exc
            if not 0.5 <= speed <= 2:
                raise ValueError("Voice speed must be between 0.5 and 2.")
        if self.key == "theme_intensity":
            try:
                intensity = int(self.value)
            except ValueError as exc:
                raise ValueError("Theme intensity must be between 0 and 150.") from exc
            if not 0 <= intensity <= 150:
                raise ValueError("Theme intensity must be between 0 and 150.")
        if self.key in {"ai_model", "ollama_model"} and not self.value.strip():
            raise ValueError("Model name cannot be empty.")
        if self.key == "spotify_client_id" and self.value.strip() and not re.fullmatch(r"[A-Za-z0-9]{20,100}", self.value.strip()):
            raise ValueError("Spotify Client ID must contain 20 to 100 letters or numbers.")
        return self


def apply_runtime_setting(key: str, value: str) -> None:
    """Apply a validated persisted setting to the active backend process."""
    runtime_fields = {
        "ai_provider": "ai_provider",
        "ai_model": "openai_model",
        "ollama_model": "ollama_model",
    }
    if key in runtime_fields:
        setattr(settings, runtime_fields[key], value)
    elif key == "tts_enabled":
        settings.tts_enabled = value == "true"
    elif key == "voice_speed":
        settings.voice_speed = float(value)


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Get all application settings."""
    db_settings = await SettingsRepository.get_all_settings(db)
    valid_settings: dict[str, str] = {}
    for key, value in db_settings.items():
        try:
            validated = SettingsUpdate(key=key, value=value)
        except ValidationError:
            continue
        valid_settings[validated.key] = validated.value
        apply_runtime_setting(validated.key, validated.value)
    active = await ai_provider.get_active_provider()
    ollama = await ai_provider.ollama_status()

    return {
        "ai_provider": settings.ai_provider,
        "ai_model": settings.openai_model,
        "ollama_model": settings.ollama_model,
        "ai_available": active in ("openai", "ollama"),
        "active_provider": active,
        "openai_configured": settings.has_openai_key,
        "ollama_available": ollama["available"],
        "ollama_installed": ollama["installed"],
        "ollama_model_available": ollama["model_available"],
        "ollama_models": ollama["models"],
        "ollama_guidance": ollama["guidance"],
        "tts_enabled": str(settings.tts_enabled).lower(),
        "voice_speed": str(settings.voice_speed),
        "wake_word_enabled": str(wake_word_service.status()["enabled"]).lower(),
        "search_provider": settings.search_provider,
        "search_engine_url": settings.search_engine_url,
        "search_available": True,
        "theme_intensity": valid_settings.get("theme_intensity", "100"),
        "animations_enabled": valid_settings.get("animations_enabled", "true"),
        "scan_lines": valid_settings.get("scan_lines", "true"),
        "particles": valid_settings.get("particles", "true"),
        "confirm_dangerous": valid_settings.get("confirm_dangerous", "true"),
        "spotify_client_id": valid_settings.get("spotify_client_id", ""),
    }


@router.post("/settings/ollama/pull")
async def pull_ollama_model():
    """Stream local Ollama model-download progress as newline-delimited JSON."""
    async def progress():
        try:
            completed = False
            async for update in ai_provider.pull_ollama_model():
                completed = completed or update.get("status") == "success"
                yield json.dumps({"type": "progress", **update}, ensure_ascii=True) + "\n"
            if not completed:
                yield json.dumps({
                    "type": "error",
                    "message": "Ollama ended the model download without confirming success.",
                }) + "\n"
                return
            yield json.dumps({"type": "complete", "model": settings.ollama_model}) + "\n"
        except (httpx.HTTPError, json.JSONDecodeError, RuntimeError) as exc:
            logger.warning("Ollama model download failed: %s", type(exc).__name__)
            yield json.dumps({
                "type": "error",
                "message": "Ollama could not download the model. Check that Ollama is installed, running, and connected to the internet.",
            }) + "\n"

    return StreamingResponse(progress(), media_type="application/x-ndjson")


@router.put("/settings")
async def update_setting(update: SettingsUpdate, db: AsyncSession = Depends(get_db)):
    """Update a setting."""
    apply_runtime_setting(update.key, update.value)
    await SettingsRepository.set_setting(db, update.key, update.value)
    await db.commit()
    return {"key": update.key, "value": update.value}
