"""Web tools — URL opening, live search, and bounded public-page extraction."""

import asyncio
import ipaddress
import socket
import webbrowser
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlsplit

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.security.validator import validate_url

logger = get_logger("tools.web")
MAX_PAGE_BYTES = 1_000_000
MAX_PAGE_TEXT = 5_000
MAX_PAGE_REDIRECTS = 4
MAX_PAGES_PER_SEARCH = 4


class _SearchResultHTML(HTMLParser):
    """Collect result links from server-rendered search pages."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results: list[dict[str, str]] = []
        self._anchor: dict[str, str] | None = None
        self._anchor_text: list[str] = []
        self._in_heading = False

    def handle_starttag(self, tag: str, attrs):
        attributes = dict(attrs)
        classes = set((attributes.get("class") or "").split())
        if tag == "h3":
            self._in_heading = True
        if tag == "a" and ({"result__a", "result-link"} & classes or self._in_heading):
            href = attributes.get("href", "")
            if href:
                self._anchor = {"url": href}
                self._anchor_text = []

    def handle_endtag(self, tag: str):
        if tag == "a" and self._anchor:
            title = " ".join(" ".join(self._anchor_text).split())
            if title:
                self.results.append({**self._anchor, "title": title[:500]})
            self._anchor = None
            self._anchor_text = []
        if tag == "h3":
            self._in_heading = False

    def handle_data(self, data: str):
        if self._anchor:
            self._anchor_text.append(data)


class _ReadableHTML(HTMLParser):
    """Extract visible text and a page title without executing page content."""

    _SKIPPED_TAGS = {"script", "style", "noscript", "svg", "nav", "header", "footer", "aside", "form"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self._skip_depth = 0
        self._in_title = False
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []

    def handle_starttag(self, tag: str, _attrs):
        if tag in self._SKIPPED_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag in {"p", "br", "div", "li", "h1", "h2", "h3", "tr"}:
            self.text_parts.append("\n")

    def handle_endtag(self, tag: str):
        if tag in self._SKIPPED_TAGS and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        elif tag in {"p", "div", "li", "h1", "h2", "h3", "tr"}:
            self.text_parts.append("\n")

    def handle_data(self, data: str):
        if self._in_title:
            self.title_parts.append(data)
        if not self._skip_depth:
            self.text_parts.append(data)

    def extract(self) -> tuple[str, str]:
        title = " ".join(" ".join(self.title_parts).split())[:500]
        content = " ".join(" ".join(self.text_parts).split())[:MAX_PAGE_TEXT]
        return title, content


def _resolve_public_host(host: str, port: int) -> bool:
    """Reject local, reserved, or private IP destinations before fetching."""
    normalized_host = host.rstrip(".").lower()
    if normalized_host in {"localhost", "localhost.localdomain"} or not "." in normalized_host:
        return False
    try:
        addresses = {ipaddress.ip_address(normalized_host)}
    except ValueError:
        try:
            addresses = {
                ipaddress.ip_address(item[4][0])
                for item in socket.getaddrinfo(normalized_host, port, type=socket.SOCK_STREAM)
            }
        except (OSError, ValueError):
            return False
    return bool(addresses) and all(address.is_global for address in addresses)


async def _validate_public_page_url(url: str) -> tuple[bool, str]:
    is_valid, reason = validate_url(url)
    if not is_valid:
        return False, reason
    parsed = urlsplit(url)
    if parsed.port not in (None, 80, 443):
        return False, "Only standard HTTP and HTTPS ports are allowed."
    try:
        public_host = await asyncio.wait_for(
            asyncio.to_thread(_resolve_public_host, parsed.hostname or "", parsed.port or (443 if parsed.scheme == "https" else 80)),
            timeout=2.5,
        )
    except TimeoutError:
        return False, "Public host validation timed out."
    if not public_host:
        return False, "The page host is not a verified public address."
    return True, "OK"


async def _fetch_readable_page(client: httpx.AsyncClient, url: str) -> dict[str, Any]:
    current_url = url
    for redirect_index in range(MAX_PAGE_REDIRECTS + 1):
        is_public, reason = await _validate_public_page_url(current_url)
        if not is_public:
            return {"fetch_error": reason}
        try:
            async with client.stream("GET", current_url, headers={"Accept": "text/html, application/xhtml+xml, text/plain"}) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        return {"fetch_error": "The page returned a redirect without a destination."}
                    if redirect_index >= MAX_PAGE_REDIRECTS:
                        return {"fetch_error": "The page exceeded the redirect limit."}
                    current_url = urljoin(current_url, location)
                    continue
                if response.status_code == 429:
                    return {"fetch_error": "The page rate-limited this request (HTTP 429)."}
                if response.status_code >= 400:
                    return {"fetch_error": f"The page returned HTTP {response.status_code}."}
                content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if content_type not in {"text/html", "application/xhtml+xml", "text/plain"}:
                    return {"fetch_error": f"Unsupported page content type: {content_type or 'unknown'}."}
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_PAGE_BYTES:
                        return {"fetch_error": "The page exceeded the 1 MB extraction limit."}
        except httpx.TimeoutException:
            return {"fetch_error": "The page request timed out."}
        except httpx.HTTPError:
            logger.info("A public search result page could not be fetched.")
            return {"fetch_error": "The page could not be reached."}

        encoding = response.encoding or "utf-8"
        text = bytes(body).decode(encoding, errors="replace")
        if content_type == "text/plain":
            return {"content": " ".join(text.split())[:MAX_PAGE_TEXT], "fetched_url": current_url}
        parser = _ReadableHTML()
        try:
            parser.feed(text)
        except Exception:
            logger.info("A fetched HTML page could not be parsed.")
            return {"fetch_error": "The page content could not be extracted."}
        title, content = parser.extract()
        if not content:
            return {"fetch_error": "The page contained no readable text."}
        return {
            "content": content,
            "fetched_url": current_url,
            **({"page_title": title} if title else {}),
        }
    return {"fetch_error": "The page exceeded the redirect limit."}


def open_url(url: str) -> dict:
    """Open a URL in the default browser."""
    is_valid, reason = validate_url(url)
    if not is_valid:
        return {"error": reason}

    try:
        opened = webbrowser.open(url)
        if not opened:
            return {"error": "The default browser did not confirm opening the URL."}
        logger.info("Opened a validated URL in the default browser.")
        return {"opened": True, "url": url}
    except Exception as e:
        return {"error": str(e)}


async def search_web(query: str) -> dict[str, Any]:
    """Fetch a keyless HTML search page and extract bounded, verifiable results."""
    cleaned_query = query.strip()
    if not cleaned_query:
        return {"success": False, "error": "Search query cannot be empty."}
    if len(cleaned_query) > 500:
        return {"success": False, "error": "Search query cannot exceed 500 characters."}

    configured_url = settings.search_engine_url.strip()
    search_url = (
        configured_url.replace("{query}", quote_plus(cleaned_query))
        if "{query}" in configured_url
        else f"{configured_url}{'&' if '?' in configured_url else '?'}q={quote_plus(cleaned_query)}"
    )
    is_valid, reason = validate_url(search_url)
    if not is_valid:
        logger.warning("Configured search-engine URL was rejected: %s", reason)
        return {"success": False, "error": "The configured search-engine URL is invalid."}

    try:
        timeout = httpx.Timeout(settings.search_timeout_seconds, connect=min(settings.search_timeout_seconds, 4.0))
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False) as client:
            public_search_url, validation_error = await _validate_public_page_url(search_url)
            if not public_search_url:
                return {"success": False, "error": f"Search engine is unavailable: {validation_error}"}
            async with client.stream(
                "GET",
                search_url,
                headers={"Accept": "text/html, application/xhtml+xml"},
            ) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    return {"success": False, "error": "The search engine redirected the request; open it in a browser instead."}
                if response.status_code >= 400:
                    return {"success": False, "error": f"The search engine returned HTTP {response.status_code}."}
                content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                if content_type not in {"text/html", "application/xhtml+xml"}:
                    return {"success": False, "error": "The search engine did not return an HTML results page."}
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_PAGE_BYTES:
                        return {"success": False, "error": "The search results exceeded the 1 MB extraction limit."}
                page_encoding = response.encoding or "utf-8"
                html = bytes(body).decode(page_encoding, errors="replace")
    except httpx.TimeoutException:
        logger.warning("Configured keyless search engine timed out.")
        return {"success": False, "error": "The search engine timed out. Please try again."}
    except httpx.HTTPError as exc:
        logger.info("Configured keyless search could not be reached: %s", type(exc).__name__)
        return {"success": False, "error": "The search engine could not be reached. Open the search URL in a browser or try again."}

    parser = _SearchResultHTML()
    try:
        parser.feed(html)
    except Exception as exc:
        logger.info("Search-result HTML extraction failed: %s", type(exc).__name__)
        return {"success": False, "error": "The search results could not be extracted; the search site may have changed."}

    engine_host = (urlsplit(search_url).hostname or "").lower()
    results: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    for item in parser.results:
        url = urljoin(search_url, item["url"])
        parsed = urlsplit(url)
        if parsed.hostname and parsed.hostname.lower().endswith("duckduckgo.com"):
            redirect_target = parse_qs(parsed.query).get("uddg", [])
            if redirect_target:
                url = unquote(redirect_target[0])
                parsed = urlsplit(url)
        if (
            not validate_url(url)[0]
            or not parsed.hostname
            or parsed.hostname.lower() == engine_host
            or url in seen_urls
        ):
            continue
        results.append({"title": item["title"][:500], "url": url, "snippet": ""})
        seen_urls.add(url)

    # Fetch a small set of results from distinct hosts; failures are attached
    # to their result rather than treated as extracted page content.
    selected_results = []
    selected_hosts = set()
    for result in results:
        host = (urlsplit(result["url"]).hostname or "").lower()
        if host in selected_hosts:
            continue
        selected_hosts.add(host)
        selected_results.append(result)
        if len(selected_results) >= MAX_PAGES_PER_SEARCH:
            break

    try:
        timeout = httpx.Timeout(settings.search_timeout_seconds, connect=min(settings.search_timeout_seconds, 4.0))
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False) as client:
            page_results = await asyncio.gather(
                *(_fetch_readable_page(client, result["url"]) for result in selected_results),
                return_exceptions=True,
            )
        for result, page in zip(selected_results, page_results):
            if isinstance(page, Exception):
                logger.info("A search-result page extraction failed: %s", type(page).__name__)
                result["fetch_error"] = "The page could not be fetched."
            else:
                result.update(page)
    except httpx.HTTPError:
        logger.exception("Could not create a client for extracting search-result pages.")

    return {
        "success": bool(results),
        "provider": "keyless-html",
        "query": cleaned_query,
        "search_url": search_url,
        "results": results,
        "sources": [{
            "title": item.get("page_title") or item["title"],
            "url": item.get("fetched_url") or item["url"],
            **({"date": item["date"]} if "date" in item else {}),
        } for item in results],
        **({} if results else {
            "error": "No extractable results were found. Open the search page in a browser; this engine may block automated extraction."
        }),
    }
