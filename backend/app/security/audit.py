"""
Audit logging for security-relevant events.
"""

import json
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.memory.repository import AuditLogRepository

logger = get_logger("security.audit")


async def audit_tool_execution(
    db: AsyncSession,
    tool_name: str,
    parameters: Optional[dict] = None,
    result: Optional[str] = None,
    status: str = "success",
    ip_address: Optional[str] = None,
) -> None:
    """Log a tool execution to the audit trail."""
    try:
        await AuditLogRepository.log_action(
            db=db,
            action="tool_execution",
            tool_name=tool_name,
            parameters=_safe_parameters(tool_name, parameters),
            result=(
                "Search result content redacted."
                if tool_name == "search_web" and result
                else result[:1000] if result else None
            ),
            status=status,
            ip_address=ip_address,
        )
        logger.info(
            f"Audit: tool={tool_name} status={status} "
            f"params={json.dumps(_safe_parameters(tool_name, parameters)) if parameters else 'none'}"
        )
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


def _safe_parameters(tool_name: str, parameters: Optional[dict]) -> Optional[dict]:
    if tool_name == "search_web" and parameters:
        return {**parameters, "query": "[redacted]"}
    return parameters


async def audit_security_event(
    db: AsyncSession,
    action: str,
    details: Optional[dict] = None,
    status: str = "denied",
    ip_address: Optional[str] = None,
) -> None:
    """Log a security event (e.g., access denied)."""
    try:
        await AuditLogRepository.log_action(
            db=db,
            action=f"security_{action}",
            parameters=details,
            status=status,
            ip_address=ip_address,
        )
        logger.warning(
            f"Security event: action={action} status={status} "
            f"details={json.dumps(details) if details else 'none'}"
        )
    except Exception as e:
        logger.error(f"Failed to write security audit log: {e}")
