"""Memory CRUD API endpoints."""

from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.memory.repository import MemoryRepository
from app.memory.privacy import contains_sensitive_data, safe_memory_text

router = APIRouter()


class MemoryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    category: Literal["general", "fact", "preference", "context"] = "general"
    importance: float = Field(default=0.5, ge=0, le=1)
    consent: bool = False


class MemoryUpdate(BaseModel):
    content: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    category: Optional[Literal["general", "fact", "preference", "context"]] = None
    importance: Optional[float] = Field(default=None, ge=0, le=1)
    consent: bool = False


@router.get("/memories")
async def list_memories(
    category: Optional[str] = None,
    q: Optional[str] = Query(default=None, max_length=200),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List memories."""
    memories = await MemoryRepository.list_memories(
        db, category=category, query_text=q, limit=limit
    )
    return [{
        "id": m.id,
        "content": safe_memory_text(m.content),
        "category": m.category,
        "importance": m.importance,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    } for m in memories]


@router.post("/memories")
async def create_memory(body: MemoryCreate, db: AsyncSession = Depends(get_db)):
    """Create a new memory."""
    if not body.consent:
        raise HTTPException(status_code=400, detail="Explicit consent is required before saving a memory.")
    if contains_sensitive_data(body.content):
        raise HTTPException(status_code=422, detail="Credential-like content cannot be saved as a memory.")
    memory = await MemoryRepository.create_memory(
        db, content=body.content, category=body.category, importance=body.importance
    )
    await db.commit()
    return {
        "id": memory.id,
        "content": safe_memory_text(memory.content),
        "category": memory.category,
        "importance": memory.importance,
    }


@router.put("/memories/{memory_id}")
async def update_memory(memory_id: str, body: MemoryUpdate, db: AsyncSession = Depends(get_db)):
    """Update a saved memory after explicit user consent."""
    if not body.consent:
        raise HTTPException(status_code=400, detail="Explicit consent is required before updating a memory.")
    if body.content is not None and contains_sensitive_data(body.content):
        raise HTTPException(status_code=422, detail="Credential-like content cannot be saved as a memory.")
    changes = body.model_dump(exclude={"consent"}, exclude_none=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Provide at least one memory field to update.")
    memory = await MemoryRepository.update_memory(db, memory_id, **changes)
    if not memory or not memory.is_active:
        raise HTTPException(status_code=404, detail="Memory not found.")
    await db.commit()
    return {
        "id": memory.id,
        "content": safe_memory_text(memory.content),
        "category": memory.category,
        "importance": memory.importance,
        "updated_at": memory.updated_at.isoformat() if memory.updated_at else None,
    }


@router.delete("/memories/{memory_id}")
async def delete_memory(memory_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a memory."""
    deleted = await MemoryRepository.delete_memory(db, memory_id)
    await db.commit()
    return {"deleted": deleted}
