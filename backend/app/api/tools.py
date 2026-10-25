"""Tools API endpoints."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.core.database import get_db
from app.tools.registry import tool_registry

router = APIRouter()


class ToolExecuteRequest(BaseModel):
    tool_name: str
    parameters: dict = {}
    confirmed: bool = False


@router.get("/tools")
async def list_tools():
    """List available tools."""
    return tool_registry.list_tools()


@router.post("/tools/execute")
async def execute_tool(request: ToolExecuteRequest, db: AsyncSession = Depends(get_db)):
    """Execute a tool with validation."""
    tool_info = tool_registry.get_tool_info(request.tool_name)
    if not tool_info:
        return {"success": False, "error": f"Unknown tool: {request.tool_name}"}

    if tool_info.get("requires_confirmation") and not request.confirmed:
        return {
            "success": False,
            "requires_confirmation": True,
            "message": f"Action '{request.tool_name}' requires confirmation. Set confirmed=true to proceed.",
        }

    result = await tool_registry.execute_tool(
        request.tool_name,
        request.parameters,
        db=db,
        confirmed=request.confirmed,
    )
    return result
