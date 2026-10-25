"""
JARVIS AI Desktop Assistant — FastAPI Application Entry Point.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import async_session_factory, init_db, close_db
from app.core.logging import logger

from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.system import router as system_router
from app.api.settings import router as settings_router
from app.api.memory import router as memory_router
from app.api.tools import router as tools_router
from app.api.voice import router as voice_router
from app.voice.wake_word import wake_word_service
from app.api.settings import SettingsUpdate, apply_runtime_setting
from app.memory.repository import SettingsRepository
from pydantic import ValidationError


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    await init_db()
    logger.info("Database initialized")
    async with async_session_factory() as db:
        stored_settings = await SettingsRepository.get_all_settings(db)
    for key, value in stored_settings.items():
        try:
            validated = SettingsUpdate(key=key, value=value)
        except ValidationError:
            logger.warning("Ignoring invalid persisted setting: %s", key)
            continue
        apply_runtime_setting(validated.key, validated.value)
    wake_word_service.start()
    yield
    logger.info("Shutting down...")
    wake_word_service.stop()
    await close_db()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health_router, prefix="/api", tags=["Health"])
app.include_router(chat_router, prefix="/api", tags=["Chat"])
app.include_router(system_router, prefix="/api", tags=["System"])
app.include_router(settings_router, prefix="/api", tags=["Settings"])
app.include_router(memory_router, prefix="/api", tags=["Memory"])
app.include_router(tools_router, prefix="/api", tags=["Tools"])
app.include_router(voice_router, prefix="/api", tags=["Voice"])
