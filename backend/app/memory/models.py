"""
SQLAlchemy 2.0+ models for JARVIS database.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, Integer, String, Text, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def generate_uuid() -> str:
    """Generate a new UUID string."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


class Conversation(Base):
    """A chat conversation containing multiple messages."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(255), default="New Conversation")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="conversation", cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Message(Base):
    """A single message within a conversation."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    conversation_id: Mapped[str] = mapped_column(String(36), ForeignKey("conversations.id", ondelete="CASCADE"))
    role: Mapped[str] = mapped_column(String(20))  # 'user', 'assistant', 'system', 'tool'
    content: Mapped[str] = mapped_column(Text, default="")
    tool_calls: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string of tool calls
    tool_call_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)  # tool name for role=tool
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")


class Memory(Base):
    """Long-term memory entries for JARVIS."""

    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    category: Mapped[str] = mapped_column(String(50), default="general")  # 'preference', 'fact', 'context', 'general'
    content: Mapped[str] = mapped_column(Text)
    importance: Mapped[float] = mapped_column(Float, default=0.5)  # 0.0 to 1.0
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Task(Base):
    """Tasks that JARVIS tracks."""

    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")  # 'pending', 'in_progress', 'done', 'cancelled'
    priority: Mapped[int] = mapped_column(Integer, default=0)  # 0=low, 1=medium, 2=high
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class Setting(Base):
    """Application settings stored in the database."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AuditLog(Base):
    """Audit log for tool executions and security events."""

    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    action: Mapped[str] = mapped_column(String(100))
    tool_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    parameters: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    result: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="success")  # 'success', 'error', 'denied'
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
