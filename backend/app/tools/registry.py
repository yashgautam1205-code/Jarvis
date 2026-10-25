"""
Tool registry — central hub for all JARVIS tools with validation and audit logging.
"""

import json
from typing import Any, Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.security.audit import audit_tool_execution
from app.security.validator import validate_action

logger = get_logger("tools.registry")


class ToolInfo:
    """Metadata about a registered tool."""

    def __init__(
        self,
        name: str,
        description: str,
        category: str,
        handler: Callable,
        requires_confirmation: bool = False,
    ):
        self.name = name
        self.description = description
        self.category = category
        self.handler = handler
        self.requires_confirmation = requires_confirmation


class ToolRegistry:
    """Registry of all available JARVIS tools."""

    def __init__(self):
        self._tools: dict[str, ToolInfo] = {}
        self._register_defaults()

    def register(
        self,
        name: str,
        description: str,
        category: str,
        handler: Callable,
        requires_confirmation: bool = False,
    ):
        """Register a new tool."""
        self._tools[name] = ToolInfo(
            name=name,
            description=description,
            category=category,
            handler=handler,
            requires_confirmation=requires_confirmation,
        )
        logger.info(f"Registered tool: {name} ({category})")

    def get_tool_info(self, name: str) -> Optional[dict]:
        """Get info about a tool."""
        tool = self._tools.get(name)
        if not tool:
            return None
        return {
            "name": tool.name,
            "description": tool.description,
            "category": tool.category,
            "requires_confirmation": tool.requires_confirmation,
        }

    def list_tools(self) -> list[dict]:
        """List all registered tools."""
        return [
            {
                "name": t.name,
                "description": t.description,
                "category": t.category,
                "requires_confirmation": t.requires_confirmation,
            }
            for t in self._tools.values()
        ]

    async def execute_tool(
        self,
        name: str,
        parameters: dict[str, Any],
        db: Optional[AsyncSession] = None,
        confirmed: bool = False,
    ) -> dict[str, Any]:
        """Execute a tool with validation and audit logging."""
        # Validate action
        is_valid, reason = validate_action(name)
        if not is_valid:
            logger.warning(f"Tool action denied: {name} — {reason}")
            if db:
                await audit_tool_execution(db, name, parameters, reason, "denied")
            return {"success": False, "error": reason}

        tool = self._tools.get(name)
        if not tool:
            return {"success": False, "error": f"Unknown tool: {name}"}

        if tool.requires_confirmation and not confirmed:
            if db:
                await audit_tool_execution(
                    db,
                    name,
                    _audit_parameters(name, parameters),
                    "Explicit user confirmation is required.",
                    "denied",
                )
            return {
                "success": False,
                "requires_confirmation": True,
                "error": f"Action '{name}' requires explicit user confirmation.",
            }

        try:
            result = await tool.handler(**parameters) if _is_async(tool.handler) else tool.handler(**parameters)
            succeeded = not (
                isinstance(result, dict)
                and (result.get("success") is False or "error" in result)
            )
            if db:
                await audit_tool_execution(
                    db,
                    name,
                    _audit_parameters(name, parameters),
                    json.dumps(result)[:500],
                    "success" if succeeded else "error",
                )
            return {"success": succeeded, "result": result} if succeeded else {
                "success": False,
                "error": result.get("error") or "Tool execution failed.",
                "result": result,
                **({"requires_confirmation": True} if result.get("requires_confirmation") else {}),
            }
        except Exception as e:
            logger.error(f"Tool execution error: {name} — {e}")
            if db:
                await audit_tool_execution(db, name, _audit_parameters(name, parameters), str(e), "error")
            return {"success": False, "error": str(e)}

    def _register_defaults(self):
        """Register all default tools."""
        from app.tools.app_launcher import launch_app
        from app.tools.file_ops import read_file, write_file, list_directory, create_directory, get_file_info
        from app.tools.web_tools import open_url, search_web
        from app.tools.music import play_music
        from app.tools.media_control import control_media
        from app.tools.system_tools import get_system_info, get_time

        self.register("launch_app", "Launch an allowlisted application", "system", launch_app)
        self.register("open_url", "Open a URL in the default browser", "web", open_url)
        self.register("read_file", "Read file contents", "files", read_file)
        self.register("write_file", "Write content to a file", "files", write_file, requires_confirmation=True)
        self.register("list_directory", "List directory contents", "files", list_directory)
        self.register("create_directory", "Create a directory", "files", create_directory, requires_confirmation=True)
        self.register("get_file_info", "Get file metadata", "files", get_file_info)
        self.register("get_system_info", "Get system metrics", "system", get_system_info)
        self.register("get_time", "Get current time and date", "utility", get_time)
        self.register("search_web", "Search the web", "web", search_web)
        self.register("search_music", "Find an unambiguous song match and start playback on YouTube or Spotify", "media", play_music)
        self.register("control_media", "Control the active Windows media session", "media", control_media)


def _is_async(func: Callable) -> bool:
    """Check if a function is async."""
    import asyncio
    return asyncio.iscoroutinefunction(func)


def _audit_parameters(name: str, parameters: dict[str, Any]) -> dict[str, Any]:
    """Avoid retaining potentially personal search text in the audit log."""
    if name in {"search_web", "search_music"}:
        return {**parameters, "query": "[redacted]"}
    return parameters


# Singleton
tool_registry = ToolRegistry()
