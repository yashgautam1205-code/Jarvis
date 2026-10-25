"""
AI Provider supporting OpenAI and Ollama (Local AI) with automatic fallback and streaming.
"""

import json
import os
import re
import shutil
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

import httpx
from openai import AsyncOpenAI, APIError, AuthenticationError, APIConnectionError

from app.ai.functions import TOOL_DEFINITIONS
from app.ai.prompts import JARVIS_SYSTEM_PROMPT
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("ai.provider")

# Instant responses for common greetings / conversational phrases (< 2ms latency)
FAST_RESPONSES: dict[str, str] = {
    "hello": "Hello! I am online and listening. How may I assist you today?",
    "hi": "Hi there! J.A.R.V.I.S. at your service. What can I do for you?",
    "hey": "Hey! All systems are ready. What is on your mind?",
    "hey jarvis": "Yes, I am here. How can I help you?",
    "hello jarvis": "Hello! All diagnostics are green. How may I assist you today?",
    "hi jarvis": "Hello! Standing by for your instructions.",
    "hello there": "General Kenobi! Just kidding. Hello! How can I assist you?",
    "hi there": "Hello! Ready and waiting for your command.",
    "greetings": "Greetings! All systems operational. How can I help?",
    "good morning": "Good morning! I hope you are having a wonderful day. How can I help?",
    "good morning jarvis": "Good morning! All diagnostics are nominal. Ready when you are.",
    "good afternoon": "Good afternoon! Standing by for your instructions.",
    "good afternoon jarvis": "Good afternoon! How may I assist you today?",
    "good evening": "Good evening! Ready whenever you are.",
    "good evening jarvis": "Good evening! Systems are online and at your service.",
    "good night": "Good night! Rest well. I will remain on standby.",
    "good night jarvis": "Good night! Have a great rest.",
    "how are you": "I am operating at peak efficiency, thank you. How are you doing?",
    "how are you doing": "Running smoothly and ready to assist you. What can I do for you?",
    "how are you jarvis": "I am operating optimally, thank you for asking. How are you?",
    "who are you": "I am J.A.R.V.I.S., your personal AI assistant.",
    "what is your name": "My name is J.A.R.V.I.S., Just A Rather Very Intelligent System.",
    "what can you do": "I can converse with you, launch applications, monitor system hardware, manage files, and automate tasks.",
    "are you there": "Yes, I am here and listening.",
    "are you awake": "Always awake and ready to assist you.",
    "wake up": "Systems initialized and standing by for your commands.",
    "can you hear me": "Yes, I can hear you loud and clear.",
    "ping": "Pong! Communication link is active and healthy.",
    "test": "System diagnostics complete. Audio and processing channels are functioning normally.",
    "thank you": "You are very welcome! Let me know if you need anything else.",
    "thank you jarvis": "It is my pleasure. Always here to help.",
    "thanks": "My pleasure! Happy to help.",
    "thanks jarvis": "Always at your service.",
    "bye": "Goodbye! Have a great day.",
    "goodbye": "Goodbye! I will be here when you need me.",
    "see you later": "Until next time! Have a wonderful day.",
}


def normalize_fast_text(text: str) -> str:
    """Strip all punctuation, extra spaces, and lowercase."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return " ".join(cleaned.split())


def match_fast_response(messages: list[dict[str, Any]]) -> Optional[str]:
    """Check if the latest user message can be answered instantly in < 2ms."""
    for m in reversed(messages):
        if m.get("role") == "user":
            content = str(m.get("content", "")).strip()
            norm = normalize_fast_text(content)
            if not norm:
                return None

            # Exact normalized match
            if norm in FAST_RESPONSES:
                return FAST_RESPONSES[norm]

            # Common compound greeting patterns
            if norm.startswith("hello ") or norm.startswith("hi ") or norm.startswith("hey "):
                # If it's a short 2-3 word greeting like "hello jarvis how are you"
                if "how are you" in norm:
                    return FAST_RESPONSES["how are you"]
                if "jarvis" in norm and len(norm.split()) <= 3:
                    return FAST_RESPONSES["hello jarvis"]

            if norm in ("who made you", "who created you"):
                return "I was created as an intelligent assistant inspired by J.A.R.V.I.S."

            return None

    return None


class AIProvider:
    """Multi-provider AI service supporting OpenAI and local Ollama."""

    def __init__(self) -> None:
        self._openai_client: Optional[AsyncOpenAI] = None
        self._ollama_client: Optional[AsyncOpenAI] = None

    @property
    def openai_client(self) -> Optional[AsyncOpenAI]:
        """Lazily initialize the OpenAI client."""
        if self._openai_client is None and settings.has_openai_key:
            self._openai_client = AsyncOpenAI(api_key=settings.openai_api_key)
        return self._openai_client

    @property
    def ollama_client(self) -> AsyncOpenAI:
        """Initialize or return the Ollama OpenAI-compatible client."""
        if self._ollama_client is None:
            self._ollama_client = AsyncOpenAI(
                base_url=settings.ollama_base_url,
                api_key="ollama",
                timeout=90.0,
            )
        return self._ollama_client

    async def is_ollama_available(self) -> bool:
        """Check if local Ollama daemon is reachable."""
        try:
            url = settings.ollama_base_url.replace("/v1", "") + "/api/tags"
            async with httpx.AsyncClient(timeout=1.5) as http_client:
                res = await http_client.get(url)
                return res.status_code == 200
        except httpx.HTTPError:
            return False

    async def get_ollama_models(self) -> list[str]:
        """Fetch installed Ollama models."""
        try:
            url = settings.ollama_base_url.replace("/v1", "") + "/api/tags"
            async with httpx.AsyncClient(timeout=2.0) as http_client:
                res = await http_client.get(url)
                if res.status_code == 200:
                    data = res.json()
                    return [m.get("name") for m in data.get("models", []) if m.get("name")]
        except Exception as e:
            logger.debug("Could not list Ollama models: %s", type(e).__name__)
        return []

    def is_ollama_installed(self) -> bool:
        """Check PATH and the standard per-user Windows installation location."""
        if shutil.which("ollama"):
            return True
        if os.name == "nt":
            local_app_data = os.environ.get("LOCALAPPDATA")
            if local_app_data and (Path(local_app_data) / "Programs" / "Ollama" / "ollama.exe").is_file():
                return True
        return False

    async def ollama_status(self) -> dict[str, Any]:
        """Report local installation, service, and selected model readiness."""
        available = await self.is_ollama_available()
        models = await self.get_ollama_models() if available else []
        selected_model = settings.ollama_model
        model_available = any(
            model == selected_model
            or model.removesuffix(":latest") == selected_model.removesuffix(":latest")
            for model in models
        )
        installed = available or self.is_ollama_installed()
        if not installed:
            guidance = "Install Ollama from https://ollama.com/download and start it, then return to JARVIS."
        elif not available:
            guidance = "Start the Ollama application and ensure its local service is running at the configured Ollama URL."
        elif not model_available:
            guidance = f"Download {selected_model} in Settings, or run `ollama pull {selected_model}`."
        else:
            guidance = ""
        return {
            "installed": installed,
            "available": available,
            "model": selected_model,
            "model_available": model_available,
            "models": models,
            "guidance": guidance,
        }

    async def pull_ollama_model(self):
        """Yield progress messages from Ollama's local model-pull endpoint."""
        url = settings.ollama_base_url.removesuffix("/v1").rstrip("/") + "/api/pull"
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(
                "POST",
                url,
                json={"name": settings.ollama_model, "stream": True},
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.strip():
                        update = json.loads(line)
                        if update.get("error"):
                            raise RuntimeError("Ollama reported a model-download failure.")
                        yield update

    async def get_active_provider(self, ollama_available: Optional[bool] = None) -> str:
        """Determine which provider should be used."""
        pref = (settings.ai_provider or "auto").lower()
        if ollama_available is None:
            ollama_available = await self.is_ollama_available()

        if pref == "openai":
            if settings.has_openai_key:
                return "openai"

        if ollama_available:
            models = await self.get_ollama_models()
            selected_model = settings.ollama_model
            if any(
                model == selected_model
                or model.removesuffix(":latest") == selected_model.removesuffix(":latest")
                for model in models
            ):
                return "ollama"

        return "demo"

    async def chat_completion(
        self,
        messages: list[dict[str, Any]],
        tools: Optional[list[dict]] = None,
        stream: bool = False,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> dict[str, Any]:
        """
        Get a chat completion with automatic provider selection and fallback.
        """
        # Sub-millisecond instant responses for conversational greetings
        fast = match_fast_response(messages)
        if fast:
            return {
                "role": "assistant",
                "content": fast,
                "finish_reason": "stop",
                "provider": "instant",
            }

        active_provider = await self.get_active_provider()

        # Prepend system prompt if missing
        if not messages or messages[0].get("role") != "system":
            messages = [{"role": "system", "content": JARVIS_SYSTEM_PROMPT}] + messages

        # 1. Try OpenAI if selected
        if active_provider == "openai" and self.openai_client is not None:
            try:
                res = await self._call_openai(
                    messages=messages,
                    tools=tools,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                res["provider"] = "openai"
                return res
            except AuthenticationError as e:
                logger.warning("OpenAI authentication failed (%s); falling back to local Ollama.", type(e).__name__)
            except (APIConnectionError, APIError) as e:
                logger.warning("OpenAI request failed (%s); falling back to local Ollama.", type(e).__name__)
            except Exception as e:
                logger.error("OpenAI request failed unexpectedly (%s); falling back to local Ollama.", type(e).__name__)

        # 2. Try Ollama (primary or fallback)
        if await self.is_ollama_available():
            try:
                res = await self._call_ollama(
                    messages=messages,
                    tools=tools,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                res["provider"] = "ollama"
                return res
            except Exception as e:
                logger.error("Ollama execution failed: %s", type(e).__name__)

        # 3. Report local setup requirements instead of silently switching providers.
        ollama = await self.ollama_status()
        guidance = ollama["guidance"]
        if not guidance and active_provider == "ollama":
            guidance = "Ollama is available, but it could not complete the local model request. Check the Ollama service and try again."
        return self._demo_response(messages, guidance)

    async def _call_openai(
        self,
        messages: list[dict[str, Any]],
        tools: Optional[list[dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> dict[str, Any]:
        """Execute request via OpenAI."""
        kwargs: dict[str, Any] = {
            "model": settings.openai_model,
            "messages": messages,
            "temperature": temperature or settings.openai_temperature,
            "max_tokens": max_tokens or settings.openai_max_tokens,
        }
        if tools is None:
            tools = TOOL_DEFINITIONS
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        response = await self.openai_client.chat.completions.create(**kwargs)
        choice = response.choices[0]
        message = choice.message

        result: dict[str, Any] = {
            "role": "assistant",
            "content": message.content or "",
            "finish_reason": choice.finish_reason,
        }

        if message.tool_calls:
            result["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in message.tool_calls
            ]

        return result

    async def _call_ollama(
        self,
        messages: list[dict[str, Any]],
        tools: Optional[list[dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> dict[str, Any]:
        """Execute request via local Ollama."""
        models = await self.get_ollama_models()
        model_to_use = settings.ollama_model
        if not any(
            model == model_to_use
            or model.removesuffix(":latest") == model_to_use.removesuffix(":latest")
            for model in models
        ):
            raise RuntimeError(
                f"Configured Ollama model '{model_to_use}' is not installed. "
                f"Installed models: {', '.join(models) if models else 'none'}. "
                f"Download it with `ollama pull {model_to_use}`."
            )

        logger.info(f"Using local Ollama model: {model_to_use}")

        kwargs: dict[str, Any] = {
            "model": model_to_use,
            "messages": messages,
            "temperature": temperature or settings.openai_temperature,
            "max_tokens": max_tokens or 600,
        }

        if tools is None:
            tools = TOOL_DEFINITIONS
        if tools:
            kwargs["tools"] = tools

        response = await self.ollama_client.chat.completions.create(**kwargs)

        choice = response.choices[0]
        message = choice.message
        content = message.content or ""

        # Clean reasoning tags if present in output (e.g. <think>...</think>)
        cleaned_content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()
        if not cleaned_content and content:
            cleaned_content = content.strip()

        result: dict[str, Any] = {
            "role": "assistant",
            "content": cleaned_content,
            "finish_reason": choice.finish_reason,
            "model": model_to_use,
        }

        if getattr(message, "tool_calls", None):
            result["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {
                        "name": tc.function.name,
                        "arguments": tc.function.arguments,
                    },
                }
                for tc in message.tool_calls
            ]

        return result

    async def chat_completion_stream(
        self,
        messages: list[dict[str, Any]],
        tools: Optional[list[dict]] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[dict[str, Any], None]:
        """
        Stream chat completion with automatic provider fallback.
        """
        # Sub-millisecond instant responses for conversational greetings
        fast = match_fast_response(messages)
        if fast:
            yield {"type": "content_delta", "content": fast}
            yield {"type": "done", "finish_reason": "stop", "provider": "instant"}
            return

        active_provider = await self.get_active_provider()

        if not messages or messages[0].get("role") != "system":
            messages = [{"role": "system", "content": JARVIS_SYSTEM_PROMPT}] + messages

        # 1. Try OpenAI streaming
        if active_provider == "openai" and self.openai_client is not None:
            failed = False
            try:
                kwargs: dict[str, Any] = {
                    "model": settings.openai_model,
                    "messages": messages,
                    "temperature": temperature or settings.openai_temperature,
                    "max_tokens": max_tokens or settings.openai_max_tokens,
                    "stream": True,
                }
                stream = await self.openai_client.chat.completions.create(**kwargs)
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        yield {"type": "content_delta", "content": chunk.choices[0].delta.content}
                yield {"type": "done", "finish_reason": "stop", "provider": "openai"}
                return
            except AuthenticationError:
                logger.warning("OpenAI Auth error during stream. Falling back to local Ollama...")
                failed = True
            except (APIConnectionError, APIError) as e:
                logger.warning("OpenAI streaming request failed (%s); falling back to Ollama.", type(e).__name__)
                failed = True
            except Exception as e:
                logger.error("OpenAI streaming request failed (%s); falling back to Ollama.", type(e).__name__)
                failed = True

        # 2. Try Ollama streaming
        if await self.is_ollama_available():
            try:
                models = await self.get_ollama_models()
                model_to_use = settings.ollama_model
                if not any(
                    model == model_to_use
                    or model.removesuffix(":latest") == model_to_use.removesuffix(":latest")
                    for model in models
                ):
                    raise RuntimeError(
                        f"Configured Ollama model '{model_to_use}' is not installed."
                    )

                logger.info(f"Streaming from local Ollama model: {model_to_use}")

                kwargs = {
                    "model": model_to_use,
                    "messages": messages,
                    "temperature": temperature or settings.openai_temperature,
                    "max_tokens": max_tokens or 300,
                    "stream": True,
                }
                stream = await self.ollama_client.chat.completions.create(**kwargs)

                in_think_block = False
                async for chunk in stream:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        if "<think>" in content:
                            in_think_block = True
                            content = content.replace("<think>", "")
                        if "</think>" in content:
                            in_think_block = False
                            content = content.split("</think>")[-1]
                        if not in_think_block and content:
                            yield {"type": "content_delta", "content": content}

                yield {"type": "done", "finish_reason": "stop", "provider": "ollama", "model": model_to_use}
                return
            except Exception as e:
                logger.error("Ollama streaming failed: %s", type(e).__name__)

        # 3. Demo fallback
        ollama = await self.ollama_status()
        guidance = ollama["guidance"]
        if not guidance and active_provider == "ollama":
            guidance = "Ollama is available, but it could not complete the local model request. Check the Ollama service and try again."
        demo = self._demo_response(messages, guidance)
        yield {"type": "content_delta", "content": demo["content"]}
        yield {"type": "done", "finish_reason": "stop", "provider": "demo"}

    def _demo_response(
        self,
        messages: list[dict[str, Any]],
        setup_guidance: str = "",
    ) -> dict[str, Any]:
        """Generate a demo response when no AI provider is available."""
        user_msg = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_msg = msg.get("content", "").lower()
                break

        guidance = setup_guidance or (
            "Install Ollama from https://ollama.com/download, start it, then download "
            f"the configured model ({settings.ollama_model}) from JARVIS Settings."
        )
        if re.search(r"\b(cpu|ram|memory usage|system (?:metrics|status)|status report)\b", user_msg):
            content = (
                "System metrics are shown in the dashboard when the backend is connected. "
                "I cannot query live telemetry while the AI provider is unavailable. "
                f"Local AI setup: {guidance}"
            )
        else:
            content = (
                "Local AI is not ready yet. "
                + guidance
                + " Hosted AI is optional and is used only when explicitly selected and configured."
            )

        return {
            "role": "assistant",
            "content": content,
            "demo_mode": True,
        }


# Singleton provider instance
ai_provider = AIProvider()
