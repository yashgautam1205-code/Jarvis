"""Voice API endpoints — STT and TTS."""

import logging

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

from app.voice.wake_word import wake_word_service

router = APIRouter()
logger = logging.getLogger("jarvis.api.voice")
MAX_AUDIO_BYTES = 25 * 1024 * 1024


class SynthesisRequest(BaseModel):
    text: str


class WakeWordSuspendRequest(BaseModel):
    suspended: bool


@router.get("/voice/wake-word/status")
async def wake_word_status():
    """Return the configured local wake-word detector status."""
    return wake_word_service.status()


@router.post("/voice/wake-word/suspend")
async def suspend_wake_word(request: WakeWordSuspendRequest):
    """Temporarily suspend detection during JARVIS listening and speech output."""
    wake_word_service.set_suspended(request.suspended)
    return {"suspended": request.suspended}


@router.websocket("/voice/wake-word/events")
async def wake_word_events(websocket: WebSocket):
    """Deliver wake events only; microphone audio never crosses this socket."""
    if not wake_word_service.status()["enabled"]:
        await websocket.close(code=1008, reason="Wake-word detection is disabled.")
        return
    await websocket.accept()
    subscriber = wake_word_service.subscribe()
    try:
        while True:
            event = await subscriber.get()
            await websocket.send_json(event)
    except WebSocketDisconnect:
        pass
    finally:
        wake_word_service.unsubscribe(subscriber)


@router.post("/voice/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe an uploaded recording using the local Whisper model."""
    try:
        from app.voice.stt import transcribe

        audio_bytes = await file.read(MAX_AUDIO_BYTES + 1)
        if not audio_bytes:
            raise HTTPException(status_code=400, detail="Uploaded audio is empty.")
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio must be 25 MB or smaller.")
        if not audio_bytes.startswith(b"RIFF") or b"WAVE" not in audio_bytes[:16]:
            raise HTTPException(status_code=415, detail="Audio must be a PCM WAV recording.")
        text = await transcribe(audio_bytes)
        return {"text": text, "success": True}
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Voice transcription unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Voice transcription request failed")
        raise HTTPException(status_code=500, detail="Voice transcription failed.") from exc
    finally:
        await file.close()


@router.post("/voice/synthesize")
async def synthesize_speech(request: SynthesisRequest):
    """Synthesize text to Piper WAV audio."""
    try:
        from app.voice.tts import synthesize

        audio_data = await synthesize(request.text)
        return Response(content=audio_data, media_type="audio/wav")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.error("Piper synthesis unavailable: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Voice synthesis request failed")
        raise HTTPException(status_code=500, detail="Voice synthesis failed.") from exc
