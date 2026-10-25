"""Tests for validated, persistent runtime settings."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def test_legacy_search_settings_fall_back_to_keyless_search():
    from app.core.config import Settings

    assert Settings(search_provider="none").search_provider == "duckduckgo"
    assert Settings(search_provider="serper").search_provider == "duckduckgo"


@pytest.mark.asyncio
async def test_settings_reject_unknown_and_invalid_values(monkeypatch):
    from app.core.config import settings

    before = settings.ai_provider
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        unknown = await client.put(
            "/api/settings",
            json={"key": "openai_api_key", "value": "must-not-store"},
        )
        invalid_provider = await client.put(
            "/api/settings",
            json={"key": "ai_provider", "value": "invalid"},
        )
        invalid_speed = await client.put(
            "/api/settings",
            json={"key": "voice_speed", "value": "9"},
        )

    assert unknown.status_code == 422
    assert invalid_provider.status_code == 422
    assert invalid_speed.status_code == 422
    assert settings.ai_provider == before


@pytest.mark.asyncio
async def test_settings_update_applies_runtime_value_and_saves(monkeypatch):
    from app.api import settings as settings_api
    from app.core.config import settings
    from app.memory.repository import SettingsRepository

    stored = []

    async def record_setting(_db, key, value):
        stored.append((key, value))

    monkeypatch.setattr(SettingsRepository, "set_setting", record_setting)
    monkeypatch.setattr(settings, "ai_provider", "auto")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.put(
            "/api/settings",
            json={"key": "ai_provider", "value": "ollama"},
        )

    assert response.status_code == 200
    assert settings.ai_provider == "ollama"
    assert stored == [("ai_provider", "ollama")]
    assert settings_api.SettingsUpdate(key="voice_speed", value="1.4").value == "1.4"


@pytest.mark.asyncio
async def test_settings_reports_local_readiness_and_keyless_search(client, monkeypatch):
    from app.ai.provider import ai_provider
    from app.core.config import settings
    from app.memory.repository import SettingsRepository

    async def no_saved_settings(_db):
        return {}

    async def local_provider():
        return "ollama"

    async def local_status():
        return {
            "installed": True,
            "available": True,
            "model": "qwen3:8b",
            "model_available": True,
            "models": ["qwen3:8b"],
            "guidance": "",
        }

    monkeypatch.setattr(SettingsRepository, "get_all_settings", no_saved_settings)
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    monkeypatch.setattr(ai_provider, "get_active_provider", local_provider)
    monkeypatch.setattr(ai_provider, "ollama_status", local_status)

    response = await client.get("/api/settings")

    assert response.status_code == 200
    data = response.json()
    assert data["ai_provider"] == "ollama"
    assert data["active_provider"] == "ollama"
    assert data["ollama_model_available"] is True
    assert data["search_available"] is True
    assert "youtube_music_configured" not in data
    assert "spotify_music" not in data


@pytest.mark.asyncio
async def test_ollama_pull_endpoint_streams_progress(client, monkeypatch):
    from app.ai.provider import ai_provider

    async def pull():
        yield {"status": "pulling manifest"}
        yield {"status": "downloading", "total": 100, "completed": 50}
        yield {"status": "success"}

    monkeypatch.setattr(ai_provider, "pull_ollama_model", pull)

    response = await client.post("/api/settings/ollama/pull")

    assert response.status_code == 200
    assert '"type": "progress"' in response.text
    assert '"completed": 50' in response.text
    assert '"type": "complete"' in response.text


@pytest.mark.asyncio
async def test_tts_setting_disables_piper_endpoint(client, monkeypatch):
    from app.core.config import settings
    from app.voice import tts

    monkeypatch.setattr(settings, "tts_enabled", False)
    monkeypatch.setattr(
        tts,
        "_synthesize_sync",
        lambda _text: (_ for _ in ()).throw(AssertionError("Piper must not run when disabled")),
    )

    response = await client.post("/api/voice/synthesize", json={"text": "hello"})

    assert response.status_code == 503
    assert "disabled in Settings" in response.json()["detail"]
