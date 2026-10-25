"""Windows global media-session controls using the documented WinRT API."""

import asyncio
import ctypes
import sys
from typing import Any, Literal

from app.core.logging import get_logger

logger = get_logger("tools.media")

MediaAction = Literal[
    "play", "pause", "resume", "next", "previous", "stop",
    "volume_up", "volume_down", "mute",
]
VOLUME_KEYS = {"volume_up": 0xAF, "volume_down": 0xAE, "mute": 0xAD}
ACTION_METHODS = {
    "play": "try_play_async",
    "pause": "try_pause_async",
    "resume": "try_play_async",
    "next": "try_skip_next_async",
    "previous": "try_skip_previous_async",
    "stop": "try_stop_async",
}


def _get_session_manager_type():
    from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager

    return GlobalSystemMediaTransportControlsSessionManager


def _playback_status(session) -> str | None:
    try:
        status = session.get_playback_info().playback_status
        return getattr(status, "name", str(status))
    except Exception:
        return None


async def control_media(action: MediaAction) -> dict[str, Any]:
    """Control the current Windows media session if it supports the requested action."""
    normalized_action = action.strip().lower()
    if sys.platform != "win32":
        return {"success": False, "error": "Windows media-session controls are available only on Windows."}

    if normalized_action in VOLUME_KEYS:
        try:
            keybd_event = ctypes.windll.user32.keybd_event
            virtual_key = VOLUME_KEYS[normalized_action]
            keybd_event(virtual_key, 0, 0, 0)
            keybd_event(virtual_key, 0, 0x0002, 0)
            return {
                "success": True,
                "action": normalized_action,
                "confirmed": False,
                "message": (
                    f"Sent the Windows {normalized_action.replace('_', ' ')} command. "
                    "The exact system volume could not be verified."
                ),
            }
        except (AttributeError, OSError) as exc:
            logger.warning("Windows volume control failed: %s", type(exc).__name__)
            return {"success": False, "error": "Windows could not send the volume command."}

    method_name = ACTION_METHODS.get(normalized_action)
    if not method_name:
        return {"success": False, "error": "Unsupported media action."}
    try:
        manager_type = _get_session_manager_type()
        manager = await asyncio.wait_for(manager_type.request_async(), timeout=5)
        session = manager.get_current_session()
        if session is None:
            return {
                "success": False,
                "error": "Windows reports no active media session. Start media in a supported player first.",
            }
        method = getattr(session, method_name, None)
        if method is None:
            return {
                "success": False,
                "error": f"The active media session does not support '{normalized_action}'.",
            }
        accepted = await asyncio.wait_for(method(), timeout=5)
        if not accepted:
            return {
                "success": False,
                "error": f"The active media session rejected the '{normalized_action}' request.",
            }

        playback_state = _playback_status(session)
        logger.info("Windows media session confirmed the %s request.", normalized_action)
        return {
            "success": True,
            "action": normalized_action,
            "confirmed": True,
            "playback_state": playback_state,
            "message": f"The active Windows media session accepted the {normalized_action} command.",
        }
    except ImportError:
        return {
            "success": False,
            "error": "Windows media-session support is not installed. Install backend requirements and restart JARVIS.",
        }
    except asyncio.TimeoutError:
        return {"success": False, "error": "The Windows media session did not respond within five seconds."}
    except Exception as exc:
        logger.warning("Windows media control failed: %s", type(exc).__name__)
        return {"success": False, "error": "Windows could not control the active media session."}
