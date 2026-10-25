"""
CRUD operations for conversations, messages, memories, tasks, settings, and audit logs.
"""

import json
import re
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update, delete, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.memory.models import (
    AuditLog,
    Conversation,
    Memory,
    Message,
    Setting,
    Task,
    generate_uuid,
    utcnow,
)
from app.memory.privacy import contains_sensitive_data
from app.core.logging import get_logger

logger = get_logger("repository")


class ConversationRepository:
    """CRUD operations for conversations and messages."""

    @staticmethod
    async def create_conversation(db: AsyncSession, title: str = "New Conversation") -> Conversation:
        """Create a new conversation."""
        conversation = Conversation(id=generate_uuid(), title=title)
        db.add(conversation)
        await db.flush()
        logger.info(f"Created conversation: {conversation.id}")
        return conversation

    @staticmethod
    async def get_conversation(db: AsyncSession, conversation_id: str) -> Optional[Conversation]:
        """Get a conversation by ID with messages."""
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.id == conversation_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_conversations(db: AsyncSession, limit: int = 50, offset: int = 0) -> list[Conversation]:
        """List conversations ordered by most recent."""
        result = await db.execute(
            select(Conversation)
            .where(Conversation.is_archived == False)
            .order_by(desc(Conversation.updated_at))
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    @staticmethod
    async def update_conversation(db: AsyncSession, conversation_id: str, **kwargs) -> Optional[Conversation]:
        """Update a conversation."""
        kwargs["updated_at"] = utcnow()
        await db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(**kwargs)
        )
        await db.flush()
        return await ConversationRepository.get_conversation(db, conversation_id)

    @staticmethod
    async def delete_conversation(db: AsyncSession, conversation_id: str) -> bool:
        """Delete a conversation and all its messages."""
        result = await db.execute(
            delete(Conversation).where(Conversation.id == conversation_id)
        )
        await db.flush()
        return result.rowcount > 0


class MessageRepository:
    """CRUD operations for messages."""

    @staticmethod
    async def add_message(
        db: AsyncSession,
        conversation_id: str,
        role: str,
        content: str,
        tool_calls: Optional[str] = None,
        tool_call_id: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Message:
        """Add a message to a conversation."""
        message = Message(
            id=generate_uuid(),
            conversation_id=conversation_id,
            role=role,
            content=content,
            tool_calls=tool_calls,
            tool_call_id=tool_call_id,
            name=name,
        )
        db.add(message)
        # Update conversation timestamp
        await db.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(updated_at=utcnow())
        )
        await db.flush()
        return message

    @staticmethod
    async def get_messages(
        db: AsyncSession, conversation_id: str, limit: int = 100
    ) -> list[Message]:
        """Get messages for a conversation."""
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(desc(Message.created_at))
            .limit(limit)
        )
        return list(reversed(result.scalars().all()))


class MemoryRepository:
    """CRUD operations for long-term memories."""

    @staticmethod
    async def create_memory(
        db: AsyncSession,
        content: str,
        category: str = "general",
        importance: float = 0.5,
    ) -> Memory:
        """Create a new memory entry."""
        memory = Memory(
            id=generate_uuid(),
            content=content,
            category=category,
            importance=max(0.0, min(1.0, importance)),
        )
        db.add(memory)
        await db.flush()
        logger.info(f"Created memory: {memory.id} ({category})")
        return memory

    @staticmethod
    async def get_memory(db: AsyncSession, memory_id: str) -> Optional[Memory]:
        """Get a memory by ID."""
        result = await db.execute(
            select(Memory).where(Memory.id == memory_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def list_memories(
        db: AsyncSession,
        category: Optional[str] = None,
        query_text: Optional[str] = None,
        active_only: bool = True,
        limit: int = 100,
    ) -> list[Memory]:
        """List memories, optionally filtered by category."""
        query = select(Memory)
        if active_only:
            query = query.where(Memory.is_active == True)
        if category:
            query = query.where(Memory.category == category)
        if query_text:
            query = query.where(Memory.content.contains(query_text, autoescape=True))
        query = query.order_by(desc(Memory.importance), desc(Memory.updated_at)).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def search_relevant_memories(
        db: AsyncSession,
        query_text: str,
        limit: int = 5,
    ) -> list[Memory]:
        """Return only active, non-sensitive memories matching query terms."""
        terms = {
            term.lower()
            for term in re.findall(r"[A-Za-z0-9_'-]{3,}", query_text)
            if term.lower() not in {
                "what", "when", "where", "which", "that", "this", "with", "from",
                "have", "does", "about", "could", "would", "please", "explain",
                "tell", "more", "help", "jarvis",
            }
        }
        if not terms:
            return []

        result = await db.execute(
            select(Memory)
            .where(Memory.is_active == True)
            .order_by(desc(Memory.importance), desc(Memory.updated_at))
            .limit(500)
        )
        ranked = []
        for memory in result.scalars().all():
            if contains_sensitive_data(memory.content):
                continue
            content_terms = set(re.findall(r"[A-Za-z0-9_'-]{3,}", memory.content.lower()))
            matches = terms & content_terms
            if matches:
                updated_timestamp = memory.updated_at.timestamp() if memory.updated_at else 0
                ranked.append((len(matches), memory.importance, updated_timestamp, memory))
        ranked.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
        return [item[3] for item in ranked[:max(1, min(limit, 10))]]

    @staticmethod
    async def update_memory(db: AsyncSession, memory_id: str, **kwargs) -> Optional[Memory]:
        """Update a memory entry."""
        if "importance" in kwargs:
            kwargs["importance"] = max(0.0, min(1.0, kwargs["importance"]))
        kwargs["updated_at"] = utcnow()
        await db.execute(
            update(Memory).where(Memory.id == memory_id).values(**kwargs)
        )
        await db.flush()
        return await MemoryRepository.get_memory(db, memory_id)

    @staticmethod
    async def delete_memory(db: AsyncSession, memory_id: str) -> bool:
        """Soft-delete a memory by deactivating it."""
        result = await db.execute(
            update(Memory)
            .where(Memory.id == memory_id)
            .values(is_active=False, updated_at=utcnow())
        )
        await db.flush()
        return result.rowcount > 0


class TaskRepository:
    """CRUD operations for tasks."""

    @staticmethod
    async def create_task(
        db: AsyncSession,
        title: str,
        description: str = "",
        priority: int = 0,
        due_date: Optional[datetime] = None,
    ) -> Task:
        """Create a new task."""
        task = Task(
            id=generate_uuid(),
            title=title,
            description=description,
            priority=max(0, min(2, priority)),
            due_date=due_date,
        )
        db.add(task)
        await db.flush()
        return task

    @staticmethod
    async def get_task(db: AsyncSession, task_id: str) -> Optional[Task]:
        """Get a task by ID."""
        result = await db.execute(select(Task).where(Task.id == task_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def list_tasks(
        db: AsyncSession,
        status: Optional[str] = None,
        limit: int = 100,
    ) -> list[Task]:
        """List tasks, optionally filtered by status."""
        query = select(Task)
        if status:
            query = query.where(Task.status == status)
        query = query.order_by(desc(Task.priority), Task.created_at).limit(limit)
        result = await db.execute(query)
        return list(result.scalars().all())

    @staticmethod
    async def update_task(db: AsyncSession, task_id: str, **kwargs) -> Optional[Task]:
        """Update a task."""
        kwargs["updated_at"] = utcnow()
        await db.execute(
            update(Task).where(Task.id == task_id).values(**kwargs)
        )
        await db.flush()
        return await TaskRepository.get_task(db, task_id)

    @staticmethod
    async def delete_task(db: AsyncSession, task_id: str) -> bool:
        """Delete a task."""
        result = await db.execute(delete(Task).where(Task.id == task_id))
        await db.flush()
        return result.rowcount > 0


class SettingsRepository:
    """CRUD operations for application settings."""

    @staticmethod
    async def get_setting(db: AsyncSession, key: str) -> Optional[str]:
        """Get a setting value by key."""
        result = await db.execute(select(Setting).where(Setting.key == key))
        setting = result.scalar_one_or_none()
        return setting.value if setting else None

    @staticmethod
    async def get_all_settings(db: AsyncSession) -> dict[str, str]:
        """Get all settings as a dictionary."""
        result = await db.execute(select(Setting))
        settings_list = result.scalars().all()
        return {s.key: s.value for s in settings_list}

    @staticmethod
    async def set_setting(db: AsyncSession, key: str, value: str) -> Setting:
        """Set a setting value (upsert)."""
        result = await db.execute(select(Setting).where(Setting.key == key))
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
            existing.updated_at = utcnow()
            await db.flush()
            return existing
        else:
            setting = Setting(key=key, value=value, updated_at=utcnow())
            db.add(setting)
            await db.flush()
            return setting

    @staticmethod
    async def delete_setting(db: AsyncSession, key: str) -> bool:
        """Delete a setting."""
        result = await db.execute(delete(Setting).where(Setting.key == key))
        await db.flush()
        return result.rowcount > 0


class AuditLogRepository:
    """CRUD operations for audit logs."""

    @staticmethod
    async def log_action(
        db: AsyncSession,
        action: str,
        tool_name: Optional[str] = None,
        parameters: Optional[dict] = None,
        result: Optional[str] = None,
        status: str = "success",
        ip_address: Optional[str] = None,
    ) -> AuditLog:
        """Create an audit log entry."""
        entry = AuditLog(
            id=generate_uuid(),
            action=action,
            tool_name=tool_name,
            parameters=json.dumps(parameters) if parameters else None,
            result=result,
            status=status,
            ip_address=ip_address,
        )
        db.add(entry)
        await db.flush()
        return entry

    @staticmethod
    async def get_recent_logs(
        db: AsyncSession, limit: int = 100
    ) -> list[AuditLog]:
        """Get recent audit log entries."""
        result = await db.execute(
            select(AuditLog)
            .order_by(desc(AuditLog.created_at))
            .limit(limit)
        )
        return list(result.scalars().all())
