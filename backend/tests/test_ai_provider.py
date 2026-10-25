"""AI provider tests for tool compatibility and model selection."""

from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_ollama_receives_tool_schemas_for_default_model(monkeypatch):
    from app.ai.provider import AIProvider
    from app.core.config import settings

    captured = {}

    async def create(**kwargs):
        captured.update(kwargs)
        message = SimpleNamespace(content="ready", tool_calls=None)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message, finish_reason="stop")]
        )

    provider = AIProvider()
    provider._ollama_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=create),
        )
    )
    monkeypatch.setattr(settings, "ollama_model", "qwen3:8b")

    async def installed_models():
        return ["qwen3:8b"]

    monkeypatch.setattr(provider, "get_ollama_models", installed_models)

    await provider._call_ollama([{"role": "user", "content": "search web"}])

    assert captured["model"] == "qwen3:8b"
    assert captured["tools"]
    assert captured["tools"][0]["function"]["name"] == "launch_app"


@pytest.mark.asyncio
async def test_ollama_does_not_retry_without_tools_when_model_rejects_them(monkeypatch):
    from app.ai.provider import AIProvider
    from app.core.config import settings

    calls = []

    async def create(**kwargs):
        calls.append(kwargs)
        raise RuntimeError("tools are not supported")

    provider = AIProvider()
    provider._ollama_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(create=create),
        )
    )
    monkeypatch.setattr(settings, "ollama_model", "gemma:2b")

    async def installed_models():
        return ["gemma:2b"]

    monkeypatch.setattr(provider, "get_ollama_models", installed_models)

    with pytest.raises(RuntimeError, match="tools are not supported"):
        await provider._call_ollama([{"role": "user", "content": "search web"}])

    assert len(calls) == 1
    assert calls[0]["tools"]


@pytest.mark.asyncio
async def test_ollama_does_not_silently_switch_to_another_installed_model(monkeypatch):
    from app.ai.provider import AIProvider
    from app.core.config import settings

    provider = AIProvider()
    monkeypatch.setattr(settings, "ollama_model", "qwen3:8b")

    async def installed_models():
        return ["gemma:2b"]

    monkeypatch.setattr(provider, "get_ollama_models", installed_models)

    with pytest.raises(RuntimeError, match="Configured Ollama model 'qwen3:8b' is not installed"):
        await provider._call_ollama([{"role": "user", "content": "hello"}])


@pytest.mark.asyncio
async def test_auto_provider_never_uses_optional_openai_implicitly(monkeypatch):
    from app.ai.provider import AIProvider
    from app.core.config import settings

    provider = AIProvider()
    monkeypatch.setattr(settings, "ai_provider", "auto")
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    monkeypatch.setattr(settings, "ollama_model", "qwen3:8b")
    monkeypatch.setattr(provider, "is_ollama_available", lambda: _async_value(True))
    monkeypatch.setattr(provider, "get_ollama_models", lambda: _async_value(["qwen3:8b"]))

    assert await provider.get_active_provider() == "ollama"


@pytest.mark.asyncio
async def test_ollama_status_reports_missing_model_guidance(monkeypatch):
    from app.ai.provider import AIProvider
    from app.core.config import settings

    provider = AIProvider()
    monkeypatch.setattr(settings, "ollama_model", "qwen3:8b")
    monkeypatch.setattr(provider, "is_ollama_available", lambda: _async_value(True))
    monkeypatch.setattr(provider, "get_ollama_models", lambda: _async_value(["gemma3:4b"]))

    status = await provider.ollama_status()

    assert status["available"] is True
    assert status["model_available"] is False
    assert "ollama pull qwen3:8b" in status["guidance"]


@pytest.mark.asyncio
async def test_ollama_stream_does_not_silently_substitute_an_installed_model(monkeypatch):
    from app.ai.provider import AIProvider
    from app.core.config import settings

    provider = AIProvider()
    monkeypatch.setattr(settings, "ollama_model", "qwen3:8b")
    monkeypatch.setattr(provider, "get_active_provider", lambda: _async_value("ollama"))
    monkeypatch.setattr(provider, "is_ollama_available", lambda: _async_value(True))
    monkeypatch.setattr(provider, "get_ollama_models", lambda: _async_value(["gemma3:4b"]))

    events = [
        event async for event in provider.chat_completion_stream([
            {"role": "user", "content": "Tell me something useful."},
        ])
    ]

    assert "ollama pull qwen3:8b" in events[0]["content"]
    assert events[-1]["provider"] == "demo"


async def _async_value(value):
    return value


def test_demo_fallback_does_not_misclassify_words_containing_hi_as_greetings():
    from app.ai.provider import AIProvider

    result = AIProvider()._demo_response([
        {"role": "user", "content": "This music request needs a local player."},
    ])

    assert "Hello!" not in result["content"]
    assert "Install Ollama" in result["content"]


def test_demo_fallback_does_not_claim_live_metrics_are_available():
    from app.ai.provider import AIProvider

    result = AIProvider()._demo_response([
        {"role": "user", "content": "Show me memory usage."},
    ])

    assert "cannot query live telemetry" in result["content"]


def test_fast_response_does_not_repeat_a_greeting_from_older_history():
    from app.ai.provider import match_fast_response

    assert match_fast_response([
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "Hello! How can I help?"},
        {"role": "user", "content": "play Him & I song from youtube"},
    ]) is None
