const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const BackendManager = require('./backend-manager');
const { SpotifyWindows } = require('./spotify-windows');

// ─── Constants ───────────────────────────────────────────────────────────────

const IS_DEV = !app.isPackaged;
if (app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'JARVIS'));
}
const VITE_DEV_URL = 'http://localhost:3000';
const MIN_WIDTH = 1200;
const MIN_HEIGHT = 800;
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 1000;
const BG_COLOR = '#05080D';

// The dedicated YouTube player must be allowed to autoplay the user's selected result.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ─── Single Instance Lock ────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

// ─── State ───────────────────────────────────────────────────────────────────

let mainWindow = null;
let backendManager = null;
let microphonePermissionGranted = false;
const spotifyWindows = new SpotifyWindows({ shell });

// ─── Window Creation ─────────────────────────────────────────────────────────

function createMainWindow() {
  const iconPath = resolveIcon();

  mainWindow = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: BG_COLOR,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
      devTools: IS_DEV,
    },
  });

  // Graceful show after content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[Electron] Renderer process exited:', details);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[Electron] Renderer is unresponsive.');
  });

  mainWindow.webContents.on('responsive', () => {
    console.info('[Electron] Renderer is responsive again.');
  });

  // Load the app
  if (IS_DEV) {
    mainWindow.loadURL(VITE_DEV_URL).catch((err) => {
      console.error('Failed to load Vite dev server:', err.message);
      console.error('Make sure the frontend dev server is running on port 3000.');
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Icon Resolution ─────────────────────────────────────────────────────────

function resolveIcon() {
  if (app.isPackaged) {
    const packagedIcon = path.join(process.resourcesPath, 'icon.ico');
    return fs.existsSync(packagedIcon) ? packagedIcon : undefined;
  }
  const publicDir = path.join(__dirname, '..', '..', 'frontend', 'public');
  let iconFile;
  if (process.platform === 'win32') {
    iconFile = path.join(publicDir, 'icon.ico');
  } else if (process.platform === 'darwin') {
    iconFile = path.join(publicDir, 'icon.icns');
  } else {
    iconFile = path.join(publicDir, 'icon.png');
  }
  return fs.existsSync(iconFile) ? iconFile : undefined;
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIPCHandlers() {
  // Window control handlers
  ipcMain.handle('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  });

  ipcMain.handle('window-maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  ipcMain.handle('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.close();
    }
  });

  ipcMain.handle('spotify-desktop-launch', async (event) => {
    if (
      event.sender !== mainWindow?.webContents
      || event.senderFrame !== mainWindow?.webContents.mainFrame
    ) {
      return { success: false, launched: false, confirmed: false, error: 'Spotify launch was requested by an untrusted window.' };
    }
    return spotifyWindows.launch();
  });

  ipcMain.handle('spotify-desktop-search', async (event, query) => {
    if (
      event.sender !== mainWindow?.webContents
      || event.senderFrame !== mainWindow?.webContents.mainFrame
    ) {
      return { success: false, opened: false, confirmed: false, error: 'Spotify search was requested by an untrusted window.' };
    }
    return spotifyWindows.search(query);
  });

  ipcMain.handle('spotify-desktop-status', async (event) => {
    if (
      event.sender !== mainWindow?.webContents
      || event.senderFrame !== mainWindow?.webContents.mainFrame
    ) {
      return { running: false, supported: false, error: 'Spotify status was requested by an untrusted window.' };
    }
    return spotifyWindows.getStatus();
  });

  ipcMain.handle('spotify-desktop-control', async (event, action) => {
    if (
      event.sender !== mainWindow?.webContents
      || event.senderFrame !== mainWindow?.webContents.mainFrame
    ) {
      return { success: false, confirmed: false, error: 'Media control was requested by an untrusted window.' };
    }
    return spotifyWindows.control(action);
  });

  ipcMain.handle('spotify-open-url', async (event, url) => {
    if (
      event.sender !== mainWindow?.webContents
      || event.senderFrame !== mainWindow?.webContents.mainFrame
    ) {
      return { success: false, opened: false, confirmed: false, error: 'Spotify link was requested by an untrusted window.' };
    }
    return spotifyWindows.openUrl(url);
  });

  ipcMain.handle('youtube-play-query', async (event, query) => {
    if (
      event.sender !== mainWindow?.webContents
      || event.senderFrame !== mainWindow?.webContents.mainFrame
    ) {
      return { playing: false, error: 'YouTube playback was requested by an untrusted window.' };
    }
    if (typeof query !== 'string' || !query.trim() || query.length > 300) {
      return { playing: false, error: 'YouTube search text is invalid.' };
    }

    const playerWindow = new BrowserWindow({
      width: 1100,
      height: 680,
      minWidth: 640,
      minHeight: 360,
      title: 'JARVIS YouTube Player',
      backgroundColor: BG_COLOR,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    playerWindow.setMenuBarVisibility(false);
    playerWindow.show();

    try {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
      await playerWindow.loadURL(searchUrl);
      const searchDeadline = Date.now() + 15000;
      let candidates = [];
      while (Date.now() < searchDeadline && !playerWindow.isDestroyed()) {
        candidates = await playerWindow.webContents.executeJavaScript(`(() => {
          const seen = new Set();
          return Array.from(document.querySelectorAll('a[href*="/watch?v="]'))
            .map(link => {
              const href = link.getAttribute('href') || '';
              const videoId = new URL(href, location.href).searchParams.get('v');
              const renderer = link.closest('ytd-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer') || link.parentElement;
              const titleElement = renderer?.querySelector('#video-title, h3, [title]');
              const title = link.getAttribute('title')
                || titleElement?.getAttribute('title')
                || link.getAttribute('aria-label')
                || link.textContent?.trim()
                || '';
              const artist = renderer?.querySelector('#channel-name a, ytd-channel-name a, .ytd-channel-name a')?.textContent?.trim() || '';
              if (!videoId || seen.has(videoId)) return null;
              seen.add(videoId);
              return { videoId, title: title.trim(), artist };
            })
            .filter(item => /^[A-Za-z0-9_-]{11}$/.test(item?.videoId || '') && item.title)
            .slice(0, 12);
        })()`, true);
        if (candidates.length) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!candidates.length) {
        return {
          playing: false,
          error: 'YouTube did not provide readable search results. The site may have changed or blocked automated access.',
        };
      }

      const terms = query.toLowerCase().match(/[a-z0-9]+/g) || [];
      const ranked = candidates.map(candidate => {
        const candidateTerms = new Set(`${candidate.title} ${candidate.artist}`.toLowerCase().match(/[a-z0-9]+/g) || []);
        const queryTerms = new Set(terms);
        const matched = [...queryTerms].filter(term => candidateTerms.has(term)).length;
        const recall = queryTerms.size ? matched / queryTerms.size : 0;
        const precision = candidateTerms.size ? matched / candidateTerms.size : 0;
        return { ...candidate, score: 0.85 * recall + 0.15 * precision };
      }).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const second = ranked[1];
      if (best.score < 0.72) {
        return { playing: false, error: 'YouTube results did not contain a clear match. Try including the artist name.' };
      }
      if (second && best.score - second.score < 0.08) {
        return {
          playing: false,
          ambiguous: true,
          candidates: ranked.slice(0, 3).map(({ title, artist }) => ({ title, artist })),
          error: 'I found several close YouTube matches. Please tell me the artist or version you mean.',
        };
      }

      const embedUrl = `https://www.youtube.com/embed/${encodeURIComponent(best.videoId)}?autoplay=1&playsinline=1&controls=1&rel=0`;
      await playerWindow.loadURL(embedUrl);
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline && !playerWindow.isDestroyed()) {
        const state = await playerWindow.webContents.executeJavaScript(`(() => {
          const video = document.querySelector('video');
          const playButton = document.querySelector('.ytp-play-button, .ytp-large-play-button, [aria-label*="Play"], [title*="Play"]');
          const ad = Boolean(document.querySelector('.ytp-ad-player-overlay') || document.querySelector('.ytp-ad-module'));
          if (video) {
            video.muted = false;
            if (video.paused && !ad) {
              try {
                const playPromise = video.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                  playPromise.catch(() => {});
                }
              } catch (error) {
                // Ignore autoplay restrictions and retry with the visible button.
              }
            }
            if (playButton && video.paused && !ad && typeof playButton.click === 'function') {
              try {
                playButton.click();
              } catch (error) {
                // Ignore click failures while the embedded player is still loading.
              }
            }
          }
          return {
            playing: Boolean(video && !video.paused && !video.muted && video.currentTime > 0 && video.readyState >= 2),
            ad,
            videoReady: Boolean(video && video.readyState >= 2),
            muted: Boolean(video && video.muted),
            duration: Number.isFinite(video?.duration) ? video.duration : 0,
            error: video?.error?.code || 0,
            title: document.title || ''
          };
        })()`, true);
        if (state.playing && !state.ad) {
          return { playing: true, title: best.title, artist: best.artist };
        }
        await new Promise(resolve => setTimeout(resolve, 600));
      }
      return {
        playing: false,
        error: 'YouTube opened the selected result but playback could not be verified. The track may be blocked by an ad, sign-in page, unavailable video, or autoplay restrictions in the embedded player.',
      };
    } catch (error) {
      console.error('[Electron] YouTube playback failed:', error.message);
      return { playing: false, error: 'Could not start the selected YouTube video.' };
    }
  });

  // System info handler
  ipcMain.handle('get-system-info', () => {
    const cpus = os.cpus();
    return {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      username: os.userInfo().username,
      osVersion: os.release(),
      osType: os.type(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
      cpuCores: cpus.length,
      uptime: os.uptime(),
      homeDir: os.homedir(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
    };
  });
}

// ─── Backend Management ──────────────────────────────────────────────────────

function resolvePythonPath(backendDir) {
  if (process.env.JARVIS_PYTHON_PATH) return process.env.JARVIS_PYTHON_PATH;
  const isWin = process.platform === 'win32';
  const venvPython = isWin
    ? path.join(backendDir, '.venv', 'Scripts', 'python.exe')
    : path.join(backendDir, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return 'python';
}

function startBackend() {
  // Only auto-start backend if configured via env var
  const autoStart = process.env.JARVIS_AUTO_START_BACKEND !== 'false';
  if (!autoStart) {
    console.log('Backend auto-start disabled via JARVIS_AUTO_START_BACKEND=false');
    return;
  }

  const backendDir = IS_DEV
    ? path.join(__dirname, '..', '..', 'backend')
    : path.join(process.resourcesPath, 'backend');
  const pythonPath = resolvePythonPath(backendDir);
  const userDataDir = app.getPath('userData');
  const dataDir = path.join(userDataDir, 'data');
  const logsDir = path.join(userDataDir, 'logs');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const backendEnv = {};
  if (app.isPackaged) {
    const userEnvFile = path.join(userDataDir, '.env');
    if (!fs.existsSync(userEnvFile)) {
      fs.copyFileSync(path.join(process.resourcesPath, '.env.example'), userEnvFile);
    }
    backendEnv.JARVIS_ENV_FILE = userEnvFile;
    backendEnv.DATABASE_PATH = path.join(dataDir, 'jarvis.db');
    backendEnv.DATABASE_URL = `sqlite+aiosqlite:///${path.join(dataDir, 'jarvis.db').replace(/\\/g, '/')}`;
    backendEnv.LOG_FILE = path.join(logsDir, 'jarvis.log');
  }

  backendManager = new BackendManager({
    pythonPath: pythonPath,
    backendDir: backendDir,
    env: backendEnv,
    host: process.env.JARVIS_BACKEND_HOST || '127.0.0.1',
    port: parseInt(process.env.JARVIS_BACKEND_PORT || '8000', 10),
    healthCheckInterval: 10000,
    maxRetries: 3,
  });

  backendManager.on('failed', ({ error }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jarvis-backend-status', {
        state: 'error',
        error: error || 'Backend startup failed.',
        setup: 'Install Python 3.10+ and backend requirements, or set JARVIS_PYTHON_PATH.',
      });
    }
  });
  backendManager.on('healthy', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('jarvis-backend-status', { state: 'ready' });
    }
  });
  backendManager.on('unhealthy', ({ consecutiveFailures, error, statusCode }) => {
    if (
      consecutiveFailures >= 3
      && mainWindow
      && !mainWindow.isDestroyed()
    ) {
      mainWindow.webContents.send('jarvis-backend-status', {
        state: 'error',
        error: statusCode
          ? `Backend health checks returned HTTP ${statusCode}.`
          : `Backend did not respond to ${consecutiveFailures} health checks${error ? ` (${error})` : ''}. Restarting it now.`,
        setup: 'JARVIS will attempt to restart its managed backend automatically.',
      });
    }
  });

  backendManager.start();
}

// ─── App Lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const audioOnly = details?.mediaTypes?.includes('audio') && !details?.mediaTypes?.includes('video');
    if (permission !== 'media' || webContents !== mainWindow?.webContents || !audioOnly) {
      callback(false);
      return;
    }

    if (microphonePermissionGranted) {
      callback(true);
      return;
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      callback(false);
      return;
    }

    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Allow microphone', 'Deny'],
      defaultId: 0,
      cancelId: 1,
      title: 'JARVIS microphone access',
      message: 'Allow JARVIS to use the microphone for push-to-talk voice input?',
      detail: 'Microphone access is not required for text chat.',
      noLink: true,
    }).then(({ response }) => {
      microphonePermissionGranted = response === 0;
      callback(microphonePermissionGranted);
    }).catch((error) => {
      console.error('[Electron] Could not request microphone permission:', error.message);
      callback(false);
    });
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    return permission === 'media'
      && webContents === mainWindow?.webContents
      && microphonePermissionGranted
      && details?.mediaType === 'audio';
  });

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://127.0.0.1:8000/*'] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      if (requestHeaders.Origin === 'null') {
        requestHeaders.Origin = 'http://127.0.0.1:3000';
      }
      callback({ requestHeaders });
    },
  );

  registerIPCHandlers();
  createMainWindow();
  startBackend();

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Handle second instance attempt (focus existing window)
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendManager) {
    backendManager.stop();
  }
});
