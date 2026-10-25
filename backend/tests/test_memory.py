"""Memory repository tests."""

import uuid

import pytest
import pytest_asyncio
from app.core.database import async_session_factory, init_db
from app.memory.repository import (
    ConversationRepository,
    MessageRepository,
    MemoryRepository,
    SettingsRepository,
)


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.mark.asyncio
async def test_create_conversation():
    async with async_session_factory() as db:
        conv = await ConversationRepository.create_conversation(db, "Test")
        assert conv.id is not None
        assert conv.title == "Test"
        await db.commit()


@pytest.mark.asyncio
async def test_add_message():
    async with async_session_factory() as db:
        conv = await ConversationRepository.create_conversation(db, "Msg Test")
        msg = await MessageRepository.add_message(db, conv.id, "user", "Hello")
        assert msg.role == "user"
        assert msg.content == "Hello"
        await db.commit()


@pytest.mark.asyncio
async def test_create_memory():
    async with async_session_factory() as db:
        mem = await MemoryRepository.create_memory(db, "User likes Python", "preference", 0.8)
        assert mem.content == "User likes Python"
        assert mem.category == "preference"
        assert mem.importance == 0.8
        await db.commit()


@pytest.mark.asyncio
async def test_settings_crud():
    async with async_session_factory() as db:
        await SettingsRepository.set_setting(db, "theme", "dark")
        val = await SettingsRepository.get_setting(db, "theme")
        assert val == "dark"

        await SettingsRepository.set_setting(db, "theme", "light")
        val = await SettingsRepository.get_setting(db, "theme")
        assert val == "light"
        await db.commit()


@pytest.mark.asyncio
async def test_memory_retrieval_returns_matching_non_sensitive_facts():
    unique_term = f"fact{uuid.uuid4().hex}"
    async with async_session_factory() as db:
        preference = await MemoryRepository.create_memory(
            db, f"User prefers concise {unique_term} explanations", "preference", 0.9
        )
        unrelated = await MemoryRepository.create_memory(
            db, "User enjoys hiking on weekends", "fact", 0.7
        )
        secret = await MemoryRepository.create_memory(
            db, "API_KEY=sk-12345678901234567890", "general", 1.0
        )
        await db.commit()
        retrieved = await MemoryRepository.search_relevant_memories(
            db, f"Please explain {unique_term} simply"
        )

    assert [item.id for item in retrieved] == [preference.id]
    assert unrelated.id not in {item.id for item in retrieved}
    assert secret.id not in {item.id for item in retrieved}


@pytest.mark.asyncio
async def test_memory_api_requires_consent_rejects_credentials_and_updates(client):
    no_consent = await client.post(
        "/api/memories",
        json={"content": "I prefer concise answers", "category": "preference"},
    )
    assert no_consent.status_code == 400

    sensitive = await client.post(
        "/api/memories",
        json={"content": "API_KEY=sk-12345678901234567890", "consent": True},
    )
    assert sensitive.status_code == 422

    created = await client.post(
        "/api/memories",
        json={
            "content": "I prefer concise answers",
            "category": "preference",
            "consent": True,
        },
    )
    assert created.status_code == 200
    memory_id = created.json()["id"]

    update_without_consent = await client.put(
        f"/api/memories/{memory_id}",
        json={"content": "I like detailed answers"},
    )
    assert update_without_consent.status_code == 400

    updated = await client.put(
        f"/api/memories/{memory_id}",
        json={"content": "I like detailed answers", "consent": True},
    )
    assert updated.status_code == 200
    assert updated.json()["content"] == "I like detailed answers"

    deleted = await client.delete(f"/api/memories/{memory_id}")
    assert deleted.json()["deleted"] is True
