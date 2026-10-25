"""Opt-in local microphone wake-word detection using openWakeWord."""

import asyncio
import queue
import threading
import time
from typing import Any

import numpy as np

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger("voice.wake_word")
AUDIO_SAMPLE_RATE = 16_000
AUDIO_FRAME_SAMPLES = 1_280


class WakeWordService:
    """Capture short audio frames locally and publish wake events without storing audio."""

    def __init__(self) -> None:
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()
        self._suspended = threading.Event()
        self._state = "disabled"
        self._error: str | None = None

    def start(self) -> None:
        if not settings.wake_word_enabled:
            self._state = "disabled"
            return
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._state = "starting"
            self._error = None
            self._thread = threading.Thread(
                target=self._run,
                name="jarvis-wake-word",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        with self._lock:
            self._state = "disabled"

    def set_suspended(self, suspended: bool) -> None:
        if suspended:
            self._suspended.set()
        else:
            self._suspended.clear()

    def status(self) -> dict[str, Any]:
        return {
            "enabled": settings.wake_word_enabled,
            "state": self._state,
            "model": settings.wake_word_model,
            "local_audio_only": True,
            "error": self._error,
        }

    def subscribe(self) -> asyncio.Queue:
        subscriber: asyncio.Queue = asyncio.Queue(maxsize=1)
        with self._lock:
            self._subscribers.add((asyncio.get_running_loop(), subscriber))
        return subscriber

    def unsubscribe(self, subscriber: asyncio.Queue) -> None:
        with self._lock:
            self._subscribers = {
                item for item in self._subscribers if item[1] is not subscriber
            }

    def _publish(self, event: dict[str, Any]) -> None:
        with self._lock:
            subscribers = tuple(self._subscribers)
        for loop, subscriber in subscribers:
            if loop.is_closed():
                continue
            loop.call_soon_threadsafe(self._publish_to_queue, subscriber, event)

    @staticmethod
    def _publish_to_queue(subscriber: asyncio.Queue, event: dict[str, Any]) -> None:
        if subscriber.full():
            try:
                subscriber.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            subscriber.put_nowait(event)
        except asyncio.QueueFull:
            pass

    def _run(self) -> None:
        try:
            import sounddevice as sd
            from openwakeword.model import Model
            from openwakeword.utils import download_models

            download_models(model_names=[settings.wake_word_model])
            model = Model(wakeword_models=[settings.wake_word_model], inference_framework="onnx")
            audio_frames: queue.Queue[np.ndarray] = queue.Queue(maxsize=8)

            def capture_callback(indata, _frames, _time_info, status) -> None:
                if status:
                    logger.warning("Wake-word audio capture reported a device status issue.")
                if self._suspended.is_set() or self._stop_event.is_set():
                    return
                frame = np.asarray(indata, dtype=np.int16).reshape(-1).copy()
                try:
                    audio_frames.put_nowait(frame)
                except queue.Full:
                    try:
                        audio_frames.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        audio_frames.put_nowait(frame)
                    except queue.Full:
                        pass

            last_detection = 0.0
            with sd.InputStream(
                samplerate=AUDIO_SAMPLE_RATE,
                channels=1,
                dtype="int16",
                blocksize=AUDIO_FRAME_SAMPLES,
                callback=capture_callback,
            ) as stream:
                self._state = "active"
                logger.info("Local wake-word detector started; audio is not stored or transmitted.")
                while not self._stop_event.is_set():
                    if self._suspended.is_set():
                        if stream.active:
                            stream.stop()
                        while True:
                            try:
                                audio_frames.get_nowait()
                            except queue.Empty:
                                break
                        time.sleep(0.1)
                        continue
                    if not stream.active:
                        stream.start()
                    try:
                        frame = audio_frames.get(timeout=0.2)
                    except queue.Empty:
                        continue
                    scores = model.predict(frame)
                    score = max(
                        (float(value) for value in scores.values()),
                        default=0.0,
                    )
                    now = time.monotonic()
                    if (
                        score >= settings.wake_word_threshold
                        and now - last_detection >= settings.wake_word_cooldown_seconds
                    ):
                        last_detection = now
                        self._publish({"type": "wake_detected", "score": round(score, 3)})
        except Exception as exc:
            self._error = (
                "Wake-word detection could not start. Check the microphone permission, "
                "install the optional dependencies, and download the configured model."
            )
            self._state = "unavailable"
            logger.warning("Local wake-word detection unavailable: %s", type(exc).__name__)
        else:
            self._state = "disabled"


wake_word_service = WakeWordService()
