"""Tool registry, keyless integrations, and safety tests."""

import pytest
from app.tools.registry import tool_registry


def test_list_tools():
    tools = tool_registry.list_tools()
    assert len(tools) > 0
    names = [tool["name"] for tool in tools]
    assert {"launch_app", "get_time", "read_file", "get_system_info"} <= set(names)


def test_get_tool_info():
    info = tool_registry.get_tool_info("launch_app")
    assert info is not None
    assert info["name"] == "launch_app"
    assert info["category"] == "system"


def test_get_unknown_tool():
    assert tool_registry.get_tool_info("nonexistent_tool") is None


def test_get_time():
    from app.tools.system_tools import get_time

    result = get_time()
    assert {"date", "time", "iso"} <= result.keys()


def test_get_system_info():
    from app.tools.system_tools import get_system_info

    result = get_system_info()
    assert "cpu" in result
    assert "memory" in result


@pytest.mark.asyncio
async def test_search_web_uses_configured_keyless_engine(httpx_mock, monkeypatch):
    from app.core.config import settings
    from app.tools.web_tools import search_web

    search_url = "https://html.duckduckgo.com/html/?q=Python+documentation"
    monkeypatch.setattr(settings, "search_provider", "duckduckgo")
    monkeypatch.setattr(
        settings, "search_engine_url",
        "https://html.duckduckgo.com/html/?q={query}",
    )
    httpx_mock.add_response(
        url=search_url,
        headers={"content-type": "text/html; charset=utf-8"},
        text='<a class="result__a" href="https://docs.python.org/">Python documentation</a>',
    )
    httpx_mock.add_response(
        url="https://docs.python.org/",
        headers={"content-type": "text/html; charset=utf-8"},
        text="<html><title>Python docs</title><body><nav>Menu</nav><h1>Python Guide</h1><p>Install Python here.</p><script>ignore me</script></body></html>",
    )

    async def allow_public_test_host(_url):
        return True, "OK"

    monkeypatch.setattr("app.tools.web_tools._validate_public_page_url", allow_public_test_host)
    result = await search_web("Python documentation")

    assert result["success"] is True
    assert result["provider"] == "keyless-html"
    assert result["results"][0]["title"] == "Python documentation"
    assert result["results"][0]["url"] == "https://docs.python.org/"
    assert result["results"][0]["content"] == "Python docs Python Guide Install Python here."
    assert result["results"][0]["page_title"] == "Python docs"
    assert result["sources"][0]["url"] == "https://docs.python.org/"
    assert httpx_mock.get_request(url=search_url, method="GET").headers.get("X-API-KEY") is None


@pytest.mark.asyncio
async def test_search_web_reports_blocked_or_unextractable_results(httpx_mock, monkeypatch):
    from app.core.config import settings
    from app.tools.web_tools import search_web

    monkeypatch.setattr(settings, "search_engine_url", "https://search.example/?q={query}")
    httpx_mock.add_response(
        url="https://search.example/?q=blocked+query",
        headers={"content-type": "text/html"},
        text="<html><body>Automated traffic is blocked</body></html>",
    )

    async def allow_public_test_host(_url):
        return True, "OK"

    monkeypatch.setattr("app.tools.web_tools._validate_public_page_url", allow_public_test_host)
    result = await search_web("blocked query")

    assert result["success"] is False
    assert "No extractable results" in result["error"]
    assert "search_url" in result


@pytest.mark.asyncio
async def test_page_extraction_stops_at_private_redirect(monkeypatch):
    import httpx
    from app.tools.web_tools import _fetch_readable_page

    requested_urls = []

    async def public_url_check(url):
        if url == "https://public.example/article":
            return True, "OK"
        return False, "The page host is not a verified public address."

    def respond(request):
        requested_urls.append(str(request.url))
        return httpx.Response(
            302,
            headers={"Location": "http://127.0.0.1/private"},
            request=request,
        )

    monkeypatch.setattr("app.tools.web_tools._validate_public_page_url", public_url_check)
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        result = await _fetch_readable_page(client, "https://public.example/article")

    assert len(requested_urls) == 1
    assert result["fetch_error"] == "The page host is not a verified public address."


@pytest.mark.asyncio
async def test_music_requests_need_no_developer_credentials():
    from app.tools.music import play_music

    youtube = await play_music("Him & I", "youtube")
    spotify = await play_music("Him & I", "spotify")

    assert youtube == {
        "success": True,
        "status": "pending_browser_playback",
        "service": "youtube",
        "query": "Him & I",
        "confirmed": False,
    }
    assert spotify["status"] == "open_search"
    assert spotify["spotify_uri"] == "spotify:search:Him%20%26%20I"
    assert spotify["confirmed"] is False


@pytest.mark.asyncio
async def test_music_requests_reject_empty_and_oversized_queries():
    from app.tools.music import play_music

    assert (await play_music("  "))["success"] is False
    assert (await play_music("x" * 301))["success"] is False


@pytest.mark.asyncio
async def test_media_control_reports_no_session_and_reports_session_confirmation(monkeypatch):
    import app.tools.media_control as media

    class FakeSession:
        def try_skip_next_async(self):
            async def accepted():
                return True

            return accepted()

        def get_playback_info(self):
            return type("Playback", (), {"playback_status": "PLAYING"})()

    class FakeManager:
        session = None

        @staticmethod
        async def request_async():
            return FakeManager()

        def get_current_session(self):
            return self.session

    monkeypatch.setattr(media.sys, "platform", "win32")
    monkeypatch.setattr(media, "_get_session_manager_type", lambda: FakeManager)
    no_session = await media.control_media("next")
    assert no_session["success"] is False
    assert "no active media session" in no_session["error"]

    FakeManager.session = FakeSession()
    confirmed = await media.control_media("next")
    assert confirmed["success"] is True
    assert confirmed["confirmed"] is True
    assert confirmed["playback_state"] == "PLAYING"


@pytest.mark.asyncio
async def test_media_control_does_not_claim_success_when_player_rejects(monkeypatch):
    import app.tools.media_control as media

    class FakeSession:
        async def try_pause_async(self):
            return False

    class FakeManager:
        @staticmethod
        async def request_async():
            return FakeManager()

        def get_current_session(self):
            return FakeSession()

    monkeypatch.setattr(media.sys, "platform", "win32")
    monkeypatch.setattr(media, "_get_session_manager_type", lambda: FakeManager)
    result = await media.control_media("pause")
    assert result["success"] is False
    assert "rejected" in result["error"]


@pytest.mark.asyncio
async def test_media_volume_command_is_bounded_and_not_reported_as_verified(monkeypatch):
    from types import SimpleNamespace
    import app.tools.media_control as media

    calls = []
    fake_user32 = SimpleNamespace(keybd_event=lambda *args: calls.append(args))
    monkeypatch.setattr(media.sys, "platform", "win32")
    monkeypatch.setattr(media.ctypes, "windll", SimpleNamespace(user32=fake_user32), raising=False)

    result = await media.control_media("volume_up")

    assert result["success"] is True
    assert result["confirmed"] is False
    assert "could not be verified" in result["message"]
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_consequential_tool_requires_confirmation():
    result = await tool_registry.execute_tool(
        "create_directory",
        {"dir_path": "C:\\Jarvis\\backend\\data\\must-not-create"},
    )
    assert result["success"] is False
    assert result["requires_confirmation"] is True


def test_file_access_is_denied_outside_allowed_directories(tmp_path, monkeypatch):
    from app.core.config import settings
    from app.security.validator import validate_path

    allowed_dir = tmp_path / "allowed"
    allowed_dir.mkdir()
    monkeypatch.setattr(settings, "allowed_directories", str(allowed_dir))

    is_allowed, reason = validate_path(str(tmp_path / "private.txt"))

    assert is_allowed is False
    assert "outside allowed directories" in reason
