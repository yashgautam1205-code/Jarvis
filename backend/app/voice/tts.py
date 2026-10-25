"""Text-to-speech using the Piper command-line executable."""

import asyncio
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("voice.tts")


def _synthesize_sync(text: str) -> bytes:
    executable = shutil.which(settings.piper_executable)
    if executable is None:
        venv_executable = Path(sys.executable).with_name(
            "piper.exe" if sys.platform == "win32" else "piper"
        )
        if venv_executable.is_file():
            executable = str(venv_executable)
    if executable is None:
        raise RuntimeError(
            f"Piper executable '{settings.piper_executable}' was not found. "
            "Install piper-tts and ensure piper is on PATH."
        )

    model_path = Path(settings.piper_model_path).expanduser()
    if not model_path.is_absolute():
        model_path = Path.cwd() / model_path
    if not model_path.is_file():
        raise RuntimeError(
            f"Piper voice model was not found at '{model_path}'. "
            "Set PIPER_MODEL_PATH to a downloaded .onnx voice model."
        )

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as output:
            temp_path = Path(output.name)

        result = subprocess.run(
            [
                executable,
                "-m",
                str(model_path),
                "--length_scale",
                str(1 / settings.voice_speed),
                "-f",
                str(temp_path),
            ],
            input=text,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or "Piper exited without an error message."
            raise RuntimeError(f"Piper TTS failed: {detail}")

        audio_data = temp_path.read_bytes()
        if not audio_data.startswith(b"RIFF") or b"WAVE" not in audio_data[:16]:
            raise RuntimeError("Piper did not produce a valid WAV audio file.")
        return audio_data
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("Piper TTS exceeded its 30-second time limit.") from exc
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink(missing_ok=True)
            except OSError:
                logger.exception("Could not remove temporary speech file")


async def synthesize(text: str) -> bytes:
    """Convert text to WAV without blocking FastAPI's event loop."""
    if not text.strip():
        raise ValueError("Text to synthesize cannot be empty.")
    if len(text) > 5000:
        raise ValueError("Text to synthesize cannot exceed 5000 characters.")
    if not settings.tts_enabled:
        raise RuntimeError("Piper text-to-speech is disabled in Settings.")
    try:
        return await asyncio.to_thread(_synthesize_sync, text.strip())
    except Exception:
        logger.exception("Piper synthesis failed")
        raise
