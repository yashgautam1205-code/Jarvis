"""Keyless music launch requests for browser and desktop-player integrations."""

from typing import Any
from urllib.parse import quote


async def play_music(query: str, service: str = "youtube") -> dict[str, Any]:
    """Prepare a music request; Electron performs and verifies service playback."""
    cleaned_query = " ".join(query.split())
    if not cleaned_query:
        return {"success": False, "error": "A song or artist is required."}
    if len(cleaned_query) > 300:
        return {"success": False, "error": "Music search cannot exceed 300 characters."}

    normalized_service = service.strip().lower()
    if normalized_service == "youtube":
        return {
            "success": True,
            "status": "pending_browser_playback",
            "service": "youtube",
            "query": cleaned_query,
            "confirmed": False,
        }
    if normalized_service == "spotify":
        return {
            "success": True,
            "status": "open_search",
            "service": "spotify",
            "query": cleaned_query,
            "spotify_uri": f"spotify:search:{quote(cleaned_query, safe='')}",
            "confirmed": False,
        }
    return {"success": False, "error": "Supported music services are YouTube and Spotify."}
