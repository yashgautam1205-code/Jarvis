# J.A.R.V.I.S. — AI Desktop Assistant

A futuristic personal AI desktop assistant inspired by J.A.R.V.I.S. from Marvel's Iron Man. Features a stunning cinematic command center interface, natural AI conversations, voice interaction, Windows automation, persistent memory, and system monitoring.

![JARVIS](https://img.shields.io/badge/JARVIS-AI%20Assistant-00E5FF?style=for-the-badge&logo=robot&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?style=for-the-badge&logo=fastapi&logoColor=white)

---

## Features

### 🤖 AI Conversations
- Local Ollama is the default; ordinary use needs no API key or developer account
- Optional hosted OpenAI is disabled unless selected and configured
- Streaming responses with real-time display
- Conversation context and history
- Ollama installation/model readiness guidance and in-app model download progress
- Bounded tool-calling loop with safe confirmation checks
- Clear local setup instructions when Ollama or the selected model is unavailable

### 🔎 Live Web Search
- Keyless HTML search using a configurable search-engine URL, with bounded extraction from accessible pages
- Search failures, blocked pages, and timeouts are reported rather than simulated
- Distinct source links are shown when the search engine exposes extractable results
- Search results are treated as untrusted reference content

### 🎙️ Voice Interaction
- Push-to-talk microphone input
- Speech-to-text transcription
- Text-to-speech responses
- Visual states: idle, listening, thinking, speaking
- Works fully in text-only mode when microphone is unavailable

### 🖥️ Windows Automation
- Available assistant tools include allowlisted application/site launch and scoped
  file operations, where configured and supported
- Actions are validated through security allowlists; consequential actions require
  confirmation
- Windows media-session playback controls and safe system volume keys are available
- The Automation page's workflow engine is not implemented and does not run
  workflows

### 🧠 Persistent Memory
- Conversation history and long-term memories are stored separately in SQLite
- Relevant saved user preferences and facts can be retrieved across conversations
- Full CRUD: view, search, and delete memories
- Settings persist across restarts
- Saved conversations can be viewed or deleted, but cannot yet be resumed as the
  active chat

### 📊 System Monitoring
- Real-time CPU usage
- RAM utilization
- Disk usage
- Network status
- Battery status (when available)
- All metrics from real system data via psutil

### 🎨 Stunning Interface
- Cinematic JARVIS-inspired HUD design
- Animated AI core orb with state-reactive animations
- Glassmorphism panels with cyan accents
- Particle effects and grid backgrounds
- Smooth Framer Motion transitions
- Dark futuristic color palette

---

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide React |
| **Desktop** | Electron (context isolation, secure preload) |
| **Backend** | Python, FastAPI, Pydantic, SQLAlchemy, SQLite |
| **AI** | Ollama local inference by default; optional OpenAI, function calling |
| **Voice** | Web Audio API, faster-whisper (STT), piper (TTS) |
| **Monitoring** | psutil |
| **Automation** | subprocess, pathlib, validated allowlists |

---

## Prerequisites

- **Node.js** 18+ (recommended: 20+)
- **Python** 3.10+ (recommended: 3.12+)
- **npm** 8+
- **Git**

---

## Installation

### 1. Clone and Enter the Project
```bash
cd c:\Jarvis
```

### 2. Install Frontend Dependencies
```bash
cd frontend
npm install
cd ..
```

### 3. Install Root (Electron) Dependencies
```bash
npm install
```

### 4. Set Up Python Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 5. Configure Environment
```bash
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

No API keys or developer registrations are needed for the default local AI,
browser search, or YouTube music path. Install and start Ollama; then use
**Settings → Download** to download the configured model. Optional hosted OpenAI
requires a backend `OPENAI_API_KEY` and selecting OpenAI in Settings.

---

## Running the Application

### Development Mode (Recommended)

**Terminal 1 — Start the backend:**
```bash
Set-Location C:\Jarvis\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — Start the frontend + Electron:**
```bash
Set-Location C:\Jarvis
npm run dev
```

### Frontend Only (Browser)
```bash
Set-Location C:\Jarvis\frontend
npm run dev
```
Open http://localhost:3000

### Backend Only
```bash
Set-Location C:\Jarvis\backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Local Voice Models

Install the backend dependencies (including faster-whisper and Piper) into the
backend virtual environment:

```powershell
Set-Location C:\Jarvis\backend
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m piper.download_voices --download-dir models en_US-lessac-medium
```

faster-whisper downloads the configured model (`WHISPER_MODEL`, default `base`)
on its first transcription. Piper also requires its CLI and a downloaded `.onnx`
voice model. Set `PIPER_MODEL_PATH` to that model file in the project `.env`;
the default is `backend\models\en_US-lessac-medium.onnx`. Push-to-talk audio is
transcribed by the local backend; it is not duplicated to browser speech
recognition. Text-only chat remains available when voice dependencies are missing.

Push-to-talk remains available as the microphone fallback. Optional “Hey JARVIS”
wake-word detection runs locally and is disabled by default. To enable it, install
the backend requirements, set `WAKE_WORD_ENABLED=true` in `.env`, and restart the
backend. On first enabled startup, openWakeWord downloads the configured model
(`WAKE_WORD_MODEL=hey_jarvis`). Keep microphone access enabled in Windows privacy
settings. If model setup, microphone access, or audio capture fails, the settings
panel reports wake-word detection as unavailable; push-to-talk remains available.
Audio is processed in memory in short frames and is not saved or sent to the
backend's event stream.

Named requests such as “play Him & I on YouTube” use a dedicated JARVIS player
to search YouTube, select a clear result, and attempt autoplay. JARVIS reports
success only after detecting video playback. If results are ambiguous, it asks
for the artist or version; ads, sign-in prompts, unavailable tracks, autoplay
restrictions, and YouTube site changes can prevent verification.

Spotify desktop control does not require a Developer app, OAuth, or credentials.
Run JARVIS in its Electron desktop window to use the `spotify:` Windows protocol
to launch Spotify or open local search results for requests such as “play
Believer by Imagine Dragons.” Select a result in Spotify to start playback.
Pause, resume, next, and previous first use the active Windows media session;
the fallback sends a global media key only after checking that Spotify is
running. Windows may deliver that key to another media app, so JARVIS reports
the command as sent, not as confirmed playback. Spotify track and playlist
HTTPS links can also be opened, but opening a link does not start or verify
playback. The old OAuth player source remains disconnected from the app's
runtime and is not exposed in Spotify Settings.

Once a supported player is active, Windows media controls can request play,
pause, resume, next, previous, and stop. Volume-up/down/mute use Windows
multimedia keys; the resulting volume cannot be verified.

Saved memories are separate from conversation history. Retrieval adds up to five
relevant, non-credential memories to a request; it does not send unrelated saved
facts. Saving or editing a memory requires explicit consent in the memory panel.
Credential-like values are rejected, and memories can be inspected, edited, or
deleted there.

### Configure keyless web search

The default search is keyless and uses a server-rendered DuckDuckGo HTML page.
To use another search engine, set a trusted HTML search URL in the root `.env`.
Use `{query}` as a placeholder for URL-encoded terms:

```env
SEARCH_PROVIDER=custom
SEARCH_ENGINE_URL=https://example.com/search?q={query}
SEARCH_TIMEOUT_SECONDS=10
```

The search page must be publicly reachable and expose result links in its HTML.
JARVIS safely fetches only a small number of distinct public result pages; sites
may block extraction or return content that cannot be parsed. Failed extraction
is reported, and sources are never invented.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | Provider selection (`ollama` by default; `openai` is optional) | `ollama` |
| `OLLAMA_BASE_URL` | Ollama OpenAI-compatible API URL | `http://localhost:11434/v1` |
| `OLLAMA_MODEL` | Local Ollama model | `qwen3:8b` |
| `OPENAI_API_KEY` | Optional backend-only credential; used only with OpenAI selected | (unset) |
| `OPENAI_MODEL` | Optional hosted model | `gpt-4o-mini` |
| `BACKEND_HOST` | Backend bind address | `127.0.0.1` |
| `BACKEND_PORT` | Backend port | `8000` |
| `BACKEND_SECRET_KEY` | Secret key for sessions | (change this) |
| `TTS_PROVIDER` | Text-to-speech provider | `piper` |
| `STT_PROVIDER` | Speech-to-text provider | `faster-whisper` |
| `WHISPER_MODEL` | faster-whisper model name | `base` |
| `PIPER_EXECUTABLE` | Piper CLI command or executable path | `piper` |
| `PIPER_MODEL_PATH` | Piper `.onnx` voice model path, relative to `backend` or absolute | `models/en_US-lessac-medium.onnx` |
| `WAKE_WORD_ENABLED` | Enable wake word detection | `false` |
| `WAKE_WORD_MODEL` | openWakeWord model name | `hey_jarvis` |
| `WAKE_WORD_THRESHOLD` | Detection score threshold (0.1–1) | `0.5` |
| `WAKE_WORD_COOLDOWN_SECONDS` | Minimum seconds between detections | `5` |
| `SEARCH_PROVIDER` | Keyless HTML search (`duckduckgo` or `custom`) | `duckduckgo` |
| `SEARCH_ENGINE_URL` | Search URL with `{query}` placeholder | DuckDuckGo HTML |
| `SEARCH_TIMEOUT_SECONDS` | Search request timeout (1–60 seconds) | `10` |
| `JARVIS_WORKSPACE` | Workspace for file operations | `~/JarvisWorkspace` |
| `ALLOWED_DIRS` | Directories the AI can access | `~/Documents,~/Desktop` |
| `LOG_LEVEL` | Logging level | `INFO` |

---

## Running Tests

### Backend Tests
```bash
Set-Location C:\Jarvis\backend
.\.venv\Scripts\python.exe -m pytest tests/ -v
```

### Frontend Type Check and Production Build
```powershell
Set-Location C:\Jarvis\frontend
npm run build
```

The frontend package does not currently define a separate automated test runner.

### Windows Installer Build
```powershell
Set-Location C:\Jarvis
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run build:windows
```

The generated NSIS installer is unsigned. Sign it with your organization’s
certificate before distributing it publicly. The installer does not bundle a
Python runtime or the backend's Python packages; install Python and the backend
requirements separately, then configure the application as described above.

---

## Project Structure

```
jarvis/
├── frontend/                 # React/TypeScript frontend
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── pages/            # Page views
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API client, WebSocket
│   │   ├── types/            # TypeScript interfaces
│   │   └── styles/           # Global styles
│   ├── package.json
│   └── vite.config.ts
├── desktop/                  # Electron desktop shell
│   ├── main/                 # Main process
│   └── preload/              # Preload scripts
├── backend/                  # Python FastAPI backend
│   ├── app/
│   │   ├── api/              # API route handlers
│   │   ├── ai/               # AI provider integration
│   │   ├── core/             # Config, database, logging
│   │   ├── memory/           # Persistent storage
│   │   ├── monitoring/       # System monitoring
│   │   ├── security/         # Validation, audit logging
│   │   ├── tools/            # Automation tool registry
│   │   └── voice/            # STT/TTS providers
│   ├── tests/                # Backend tests
│   └── requirements.txt
├── .env.example              # Environment template
├── .gitignore
├── package.json              # Root Electron config
└── README.md
```

---

## Security

- **No arbitrary command execution** — all automation uses validated allowlists
- **Context isolation** — Electron renderer has no direct Node.js access
- **Path validation** — prevents directory traversal attacks
- **Confirmation required** — consequential actions need user approval
- **API keys server-side only** — never exposed to the frontend
- **Parameterized queries** — prevents SQL injection
- **Audit logging** — all tool executions are logged

---

## Local AI Setup

Ollama is the default provider and does not require an API key. If it is missing,
Settings links to the Ollama installer. If its service is running but the model
is missing, download that model from Settings; the backend streams download
progress from the local Ollama service. Chat explains whether installation,
service startup, or model download is still needed. OpenAI is optional and only
used after explicit selection and backend configuration.

---

## Packaging for Distribution

On Windows, install the Node.js dependencies and prepare the Python backend
environment first, then build the frontend and NSIS installer:

```bash
Set-Location C:\Jarvis
npm install
npm run build:windows
```

The installer is written to `dist-electron/`. It includes the Electron app,
frontend, and backend source code, but does **not** bundle Python or Python
packages. Install Python 3.10+ and run
`backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt`
before launching the installed app, or set `JARVIS_PYTHON_PATH` to an interpreter
with those requirements installed. The generated user configuration is stored at
`%APPDATA%\JARVIS\.env`; SQLite data and logs are stored in the app's per-user data
directory. Optional hosted-provider credentials belong only in this backend
environment, never in frontend files.

---

## Known Limitations

- Voice features require additional setup (faster-whisper model download, piper installation)
- Wake-word detection is optional, disabled by default, and requires microphone
  permissions plus a one-time model download
- Windows media controls depend on the active player's Global System Media
  Transport Controls support; media command acceptance does not guarantee sound
- The Windows installer does not bundle Python or backend dependencies
- Keyless search and page extraction depend on the configured search engine's
  HTML structure and on sites allowing bounded public-page requests
- YouTube automation depends on the site's current page structure, autoplay
  policy, track availability, ads, and sign-in restrictions
- Spotify desktop search requires the installed Windows app and its `spotify:`
  URL protocol registration; media-key delivery is not proof of playback
- Vision/screenshot analysis requires a vision-capable model

---

## License

Private project — All rights reserved.
