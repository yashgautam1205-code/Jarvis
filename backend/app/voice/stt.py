"""Local speech-to-text using a lazily initialized faster-whisper model."""

import asyncio
import io
import wave
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("voice.stt")
_model: Any = None
_model_lock = asyncio.Lock()


def _create_model():
    from faster_whisper import WhisperModel

    return WhisperModel(settings.whisper_model, device="cpu", compute_type="int8")


async def _get_model():
    global _model
    if _model is None:
        async with _model_lock:
            if _model is None:
                try:
                    _model = await asyncio.to_thread(_create_model)
                except ImportError as exc:
                    raise RuntimeError(
                        "faster-whisper is not installed. Install backend requirements "
                        "to enable local speech recognition."
                    ) from exc
                logger.info("Loaded faster-whisper model %s", settings.whisper_model)
    return _model


def _decode_wav(audio_bytes: bytes):
    import numpy as np

    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            sample_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            if wav_file.getcomptype() != "NONE" or sample_width != 2:
                raise ValueError("Audio must be uncompressed 16-bit PCM WAV.")
            if channels < 1 or sample_rate < 1:
                raise ValueError("Audio has invalid channel or sample-rate metadata.")
            samples = np.frombuffer(wav_file.readframes(frame_count), dtype="<i2")
    except (wave.Error, EOFError) as exc:
        raise ValueError("Audio is not a valid PCM WAV recording.") from exc

    if channels > 1:
        samples = samples.reshape(-1, channels).astype(np.float32).mean(axis=1)
    else:
        samples = samples.astype(np.float32)
    samples /= 32768.0

    if sample_rate != 16_000 and samples.size:
        target_length = max(1, round(samples.size * 16_000 / sample_rate))
        source_positions = np.arange(samples.size, dtype=np.float64)
        target_positions = np.arange(target_length, dtype=np.float64) * sample_rate / 16_000
        samples = np.interp(target_positions, source_positions, samples).astype(np.float32)
    return samples


def _transcribe_audio(model, audio_bytes: bytes) -> str:
    samples = _decode_wav(audio_bytes)
    if not samples.size:
        return ""
    segments, _ = model.transcribe(samples, language="en", vad_filter=True)
    return " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()


async def transcribe(audio_bytes: bytes) -> str:
    """Transcribe a WAV recording with the configured local Whisper model."""
    if not audio_bytes:
        return ""

    model = await _get_model()
    try:
        text = await asyncio.to_thread(_transcribe_audio, model, audio_bytes)
    except Exception:
        logger.exception("faster-whisper transcription failed")
        raise
    logger.info("Audio transcription completed (%d characters)", len(text))
    return text
