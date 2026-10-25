"""Voice API tests that do not require downloaded speech models."""

import io
import wave
from types import SimpleNamespace

import pytest


def make_wav(sample_rate=16000, channels=1, sample_width=2):
    audio = io.BytesIO()
    with wave.open(audio, "wb") as wav_file:
        wav_file.setnchannels(channels)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00" * sample_rate * channels * sample_width)
    return audio.getvalue()


@pytest.mark.asyncio
async def test_transcribe_rejects_empty_audio(client):
    response = await client.post(
        "/api/voice/transcribe",
        files={"file": ("audio.wav", b"", "audio/wav")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_transcribe_rejects_non_wav_audio(client):
    response = await client.post(
        "/api/voice/transcribe",
        files={"file": ("audio.webm", b"not a wav file", "audio/webm")},
    )
    assert response.status_code == 415


@pytest.mark.asyncio
async def test_transcribe_returns_local_model_result(client, monkeypatch):
    from app.voice import stt

    async def fake_transcribe(_audio_bytes):
        return "hello jarvis"

    monkeypatch.setattr(stt, "transcribe", fake_transcribe)
    wav_bytes = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 40
    response = await client.post(
        "/api/voice/transcribe",
        files={"file": ("audio.wav", wav_bytes, "audio/wav")},
    )
    assert response.status_code == 200
    assert response.json() == {"text": "hello jarvis", "success": True}


@pytest.mark.asyncio
async def test_transcribe_reports_missing_model_dependency(client, monkeypatch):
    from app.voice import stt

    async def unavailable(_audio_bytes):
        raise RuntimeError("faster-whisper is not installed.")

    monkeypatch.setattr(stt, "transcribe", unavailable)
    wav_bytes = b"RIFF" + b"\x00" * 4 + b"WAVE" + b"\x00" * 40
    response = await client.post(
        "/api/voice/transcribe",
        files={"file": ("audio.wav", wav_bytes, "audio/wav")},
    )
    assert response.status_code == 503
    assert "faster-whisper" in response.json()["detail"]


@pytest.mark.asyncio
async def test_synthesize_returns_wav_audio(client, monkeypatch):
    from app.voice import tts

    async def fake_synthesize(_text):
        return b"RIFF" + b"\x00" * 4 + b"WAVE"

    monkeypatch.setattr(tts, "synthesize", fake_synthesize)
    response = await client.post(
        "/api/voice/synthesize",
        json={"text": "hello"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content.startswith(b"RIFF")


@pytest.mark.asyncio
async def test_synthesize_reports_missing_piper(client, monkeypatch):
    from app.voice import tts

    async def unavailable(_text):
        raise RuntimeError("Piper executable was not found.")

    monkeypatch.setattr(tts, "synthesize", unavailable)
    response = await client.post(
        "/api/voice/synthesize",
        json={"text": "hello"},
    )
    assert response.status_code == 503
    assert "Piper executable" in response.json()["detail"]


@pytest.mark.asyncio
async def test_synthesize_rejects_empty_text(client):
    response = await client.post(
        "/api/voice/synthesize",
        json={"text": ""},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_transcribe_decodes_pcm_without_pyav(client, monkeypatch):
    from app.voice import stt

    class FakeModel:
        def transcribe(self, audio, **_kwargs):
            assert audio.dtype.name == "float32"
            assert audio.size == 16000
            return [SimpleNamespace(text=" local transcription ")], None

    async def get_model():
        return FakeModel()

    monkeypatch.setattr(stt, "_get_model", get_model)
    assert await stt.transcribe(make_wav()) == "local transcription"


@pytest.mark.asyncio
async def test_transcribe_rejects_unsupported_pcm_width(client):
    from app.voice.stt import _decode_wav

    with pytest.raises(ValueError, match="16-bit PCM"):
        _decode_wav(make_wav(sample_width=1))


@pytest.mark.asyncio
async def test_wake_word_is_disabled_by_default(client, monkeypatch):
    from app.core.config import settings
    from app.voice.wake_word import WakeWordService

    monkeypatch.setattr(settings, "wake_word_enabled", False)
    service = WakeWordService()
    service.start()
    assert service.status()["enabled"] is False
    assert service.status()["state"] == "disabled"
    assert service.status()["local_audio_only"] is True

    response = await client.get("/api/voice/wake-word/status")
    assert response.status_code == 200
