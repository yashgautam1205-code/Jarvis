"""Tests for bounded chat tool execution and source propagation."""

from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("play the song called Him & I from YouTube", (True, "Him & I")),
        ("play Him & I song from youtube", (True, "Him & I")),
        ("play Him & I on Spotify", (True, "Him & I")),
        ("Play Him & I by G-Eazy on Spotify", (True, "Him & I by G-Eazy")),
    ],
)
def test_named_music_request_removes_platform_suffix_from_title(message, expected):
    from app.api.chat import _music_request

    assert _music_request(message) == expected


@pytest.mark.asyncio
async def test_chat_executes_multiple_tool_rounds_and_returns_sources(monkeypatch):
    from app.ai.provider import ai_provider
    from app.tools.registry import tool_registry

    responses = iter([
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "call-one",
                "function": {"name": "search_web", "arguments": '{"query":"official docs"}'},
            }],
        },
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "call-two",
                "function": {"name": "get_time", "arguments": "{}"},
            }],
        },
        {"role": "assistant", "content": "The sources confirm the answer.", "finish_reason": "stop"},
    ])
    executed = []

    async def fake_completion(_messages, **_kwargs):
        return next(responses)

    async def fake_execute(name, parameters, db=None, confirmed=False):
        executed.append(name)
        if name == "search_web":
            return {
                "success": True,
                "result": {
                    "sources": [{"title": "Official docs", "url": "https://docs.example.org/"}],
                },
            }
        return {"success": True, "result": {"time": "12:00"}}

    monkeypatch.setattr(ai_provider, "chat_completion", fake_completion)
    monkeypatch.setattr(tool_registry, "execute_tool", fake_execute)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/chat", json={"message": "Find and check this."})

    assert response.status_code == 200
    data = response.json()
    assert data["message"]["content"] == "The sources confirm the answer."
    assert [result["name"] for result in data["tool_results"]] == ["search_web", "get_time"]
    assert data["sources"] == [{"title": "Official docs", "url": "https://docs.example.org/"}]
    assert executed == ["search_web", "get_time"]


@pytest.mark.asyncio
async def test_chat_tool_loop_stops_at_round_limit(monkeypatch):
    from app.ai.provider import ai_provider
    from app.api import chat

    async def always_call_tool(_messages, **_kwargs):
        return {
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "call-repeat",
                "function": {"name": "get_time", "arguments": "{}"},
            }],
        }

    async def execute_tool(_name, _parameters, db=None, confirmed=False):
        return {"success": True, "result": {"time": "12:00"}}

    monkeypatch.setattr(ai_provider, "chat_completion", always_call_tool)
    monkeypatch.setattr(chat.tool_registry, "execute_tool", execute_tool)
    monkeypatch.setattr(chat, "MAX_TOOL_ROUNDS", 2)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/chat", json={"message": "Keep checking."})

    assert response.status_code == 200
    assert "safe limit" in response.json()["message"]["content"]
    assert len(response.json()["tool_results"]) == 2


@pytest.mark.asyncio
async def test_chat_includes_only_relevant_non_sensitive_memories(client, monkeypatch):
    from app.ai.provider import ai_provider
    from app.api import chat

    async def matching_memories(_db, _query, limit=5):
        assert limit == 5
        return [
            SimpleNamespace(content="The user prefers concise explanations."),
            SimpleNamespace(content="API_KEY=sk-12345678901234567890"),
        ]

    captured_messages = []

    async def answer(messages, **_kwargs):
        captured_messages.extend(messages)
        return {"role": "assistant", "content": "Understood."}

    monkeypatch.setattr(chat.MemoryRepository, "search_relevant_memories", matching_memories)
    monkeypatch.setattr(ai_provider, "chat_completion", answer)

    response = await client.post("/api/chat", json={"message": "Keep this concise."})

    assert response.status_code == 200
    memory_messages = [
        item for item in captured_messages
        if item["role"] == "system" and "user-saved memories" in item["content"]
    ]
    assert len(memory_messages) == 1
    assert "prefers concise explanations" in memory_messages[0]["content"]
    assert "API_KEY" not in memory_messages[0]["content"]


@pytest.mark.asyncio
async def test_named_music_request_starts_matching_track_without_requiring_ai(client, monkeypatch):
    from app.ai.provider import ai_provider
    from app.tools.registry import tool_registry

    calls = []

    async def search_music(name, parameters, db=None, confirmed=False):
        calls.append((name, parameters))
        return {
            "success": True,
            "result": {
                "success": True,
                "status": "pending_browser_playback",
                "service": "youtube",
                "query": "Him & I",
            },
        }

    async def unexpected_ai_call(*_args, **_kwargs):
        raise AssertionError("Named music request should not depend on an AI provider.")

    monkeypatch.setattr(tool_registry, "execute_tool", search_music)
    monkeypatch.setattr(ai_provider, "chat_completion", unexpected_ai_call)

    response = await client.post(
        "/api/chat",
        json={"message": "play Him & I song from youtube"},
    )

    assert response.status_code == 200
    assert calls == [(
        "search_music",
        {"query": "Him & I", "service": "youtube"},
    )]
    assert "I’m searching YouTube for “Him & I”" in response.json()["message"]["content"]


@pytest.mark.asyncio
async def test_named_music_request_streams_player_command(client, monkeypatch):
    from app.tools.registry import tool_registry

    async def search_music(_name, _parameters, db=None, confirmed=False):
        return {
            "success": True,
            "result": {
                "success": True,
                "status": "pending_browser_playback",
                "service": "youtube",
                "query": "Tumera Sanam Huware",
            },
        }

    monkeypatch.setattr(tool_registry, "execute_tool", search_music)

    response = await client.post(
        "/api/chat/stream",
        json={"message": "Play the song called Tumera Sanam Huware"},
    )

    assert response.status_code == 200
    assert '"type": "media"' in response.text
    assert '"query": "Tumera Sanam Huware"' in response.text
    assert "Tumera Sanam Huware" in response.text


@pytest.mark.asyncio
async def test_ambiguous_music_match_asks_user_instead_of_playing(client, monkeypatch):
    from app.tools.registry import tool_registry

    async def ambiguous_match(_name, _parameters, db=None, confirmed=False):
        return {
            "success": True,
            "result": {
                "success": True,
                "status": "ambiguous",
                "candidates": [
                    {"title": "Him & I", "artist": "G-Eazy"},
                    {"title": "Him & I (Cover)", "artist": "Another Artist"},
                ],
            },
        }

    monkeypatch.setattr(tool_registry, "execute_tool", ambiguous_match)

    response = await client.post(
        "/api/chat",
        json={"message": "play Him & I song from YouTube"},
    )

    assert response.status_code == 200
    assert "Which artist or version" in response.json()["message"]["content"]
    assert "G-Eazy" in response.json()["message"]["content"]


@pytest.mark.asyncio
async def test_music_clarification_reply_retries_original_request(client, monkeypatch):
    from app.tools.registry import tool_registry

    calls = []

    async def match_music(_name, parameters, db=None, confirmed=False):
        calls.append(parameters)
        if len(calls) == 1:
            return {
                "success": True,
                "result": {
                    "success": True,
                    "status": "ambiguous",
                    "candidates": [
                        {"title": "Him & I", "artist": "G-Eazy & Halsey"},
                        {"title": "Him & I (Cover)", "artist": "Another Artist"},
                    ],
                },
            }
        return {
            "success": True,
            "result": {
                "success": True,
                "status": "pending_browser_playback",
                "service": "youtube",
                "query": "Him & I G-Eazy and Halsey",
            },
        }

    monkeypatch.setattr(tool_registry, "execute_tool", match_music)
    first = await client.post("/api/chat", json={"message": "play Him & I song from YouTube"})
    conversation_id = first.json()["conversation_id"]
    second = await client.post(
        "/api/chat",
        json={"message": "G-Eazy and Halsey", "conversation_id": conversation_id},
    )

    assert second.status_code == 200
    assert calls == [
        {"query": "Him & I", "service": "youtube"},
        {"query": "Him & I G-Eazy and Halsey", "service": "youtube"},
    ]
    assert "searching YouTube" in second.json()["message"]["content"]


@pytest.mark.asyncio
async def test_play_music_without_title_controls_current_session(client, monkeypatch):
    from app.tools.registry import tool_registry

    calls = []

    async def control_media(name, parameters, db=None, confirmed=False):
        calls.append((name, parameters))
        return {
            "success": False,
            "error": "Windows reports no active media session.",
        }

    monkeypatch.setattr(tool_registry, "execute_tool", control_media)

    response = await client.post("/api/chat", json={"message": "Please play some music"})

    assert response.status_code == 200
    assert calls == [("control_media", {"action": "play"})]
    assert "no active media session" in response.json()["message"]["content"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("message", "expected_action"),
    [
        ("pause the music", "pause"),
        ("resume playback", "resume"),
        ("next track", "next"),
        ("previous song", "previous"),
        ("stop music", "stop"),
    ],
)
async def test_media_commands_are_routed_without_ai(message, expected_action, client, monkeypatch):
    from app.ai.provider import ai_provider
    from app.tools.registry import tool_registry

    calls = []

    async def control_media(name, parameters, db=None, confirmed=False):
        calls.append((name, parameters))
        return {
            "success": True,
            "result": {
                "success": True,
                "message": f"The active Windows media session accepted {expected_action}.",
            },
        }

    async def unexpected_ai_call(*_args, **_kwargs):
        raise AssertionError("Explicit media commands should not depend on AI tool selection.")

    monkeypatch.setattr(tool_registry, "execute_tool", control_media)
    monkeypatch.setattr(ai_provider, "chat_completion", unexpected_ai_call)

    response = await client.post("/api/chat", json={"message": message})

    assert response.status_code == 200
    assert calls == [("control_media", {"action": expected_action})]
    assert expected_action in response.json()["message"]["content"]


@pytest.mark.asyncio
async def test_streaming_media_command_exposes_failed_session_for_desktop_fallback(client, monkeypatch):
    from app.tools.registry import tool_registry

    async def no_active_session(_name, _parameters, db=None, confirmed=False):
        return {
            "success": False,
            "error": "Windows reports no active media session.",
            "result": {"success": False, "error": "Windows reports no active media session."},
        }

    monkeypatch.setattr(tool_registry, "execute_tool", no_active_session)

    response = await client.post("/api/chat/stream", json={"message": "next track"})

    assert response.status_code == 200
    assert '"type": "media_control"' in response.text
    assert '"success": false' in response.text
    assert "Windows reports no active media session." in response.text


@pytest.mark.asyncio
async def test_streaming_chat_uses_single_completion_when_no_tool_is_needed(client, monkeypatch):
    from app.ai.provider import ai_provider

    calls = []

    async def completion(_messages, **_kwargs):
        calls.append("completion")
        return {"role": "assistant", "content": "A single grounded answer."}

    async def unexpected_stream(*_args, **_kwargs):
        raise AssertionError("Streaming should not run a second provider request.")

    monkeypatch.setattr(ai_provider, "chat_completion", completion)
    monkeypatch.setattr(ai_provider, "chat_completion_stream", unexpected_stream)

    response = await client.post("/api/chat/stream", json={"message": "Answer once."})

    assert response.status_code == 200
    assert response.text.count("A single grounded answer.") == 1
    assert calls == ["completion"]


@pytest.mark.asyncio
async def test_streaming_chat_returns_final_tool_completion_without_extra_inference(client, monkeypatch):
    from app.ai.provider import ai_provider
    from app.tools.registry import tool_registry

    completions = iter([
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "call-time",
                "function": {"name": "get_time", "arguments": "{}"},
            }],
        },
        {"role": "assistant", "content": "It is noon.", "finish_reason": "stop"},
    ])
    calls = []

    async def completion(_messages, **_kwargs):
        calls.append("completion")
        return next(completions)

    async def execute_tool(*_args, **_kwargs):
        return {"success": True, "result": {"time": "12:00"}}

    async def unexpected_stream(*_args, **_kwargs):
        raise AssertionError("Tool finalization should not invoke another completion.")

    monkeypatch.setattr(ai_provider, "chat_completion", completion)
    monkeypatch.setattr(ai_provider, "chat_completion_stream", unexpected_stream)
    monkeypatch.setattr(tool_registry, "execute_tool", execute_tool)

    response = await client.post("/api/chat/stream", json={"message": "What time is it?"})

    assert response.status_code == 200
    assert "It is noon." in response.text
    assert calls == ["completion", "completion"]
