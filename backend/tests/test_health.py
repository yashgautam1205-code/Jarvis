"""Health endpoint tests."""

import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert "version" in data


@pytest.mark.asyncio
async def test_health_check_does_not_depend_on_ollama(client, monkeypatch):
    from app.ai.provider import ai_provider

    async def ollama_must_not_be_checked():
        raise AssertionError("Liveness should not depend on Ollama.")

    monkeypatch.setattr(ai_provider, "is_ollama_available", ollama_must_not_be_checked)

    response = await client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "online"


@pytest.mark.asyncio
async def test_system_metrics(client):
    response = await client.get("/api/system/metrics")
    assert response.status_code == 200
    data = response.json()
    assert "cpu" in data
    assert "memory" in data
    assert "disk" in data
    assert "timestamp" in data
    # Verify real data
    assert isinstance(data["cpu"]["percent"], (int, float))
    assert isinstance(data["memory"]["percent"], (int, float))
