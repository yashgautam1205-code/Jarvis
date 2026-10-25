const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { EventEmitter } = require('events');

/**
 * BackendManager
 *
 * Manages the lifecycle of the Python FastAPI backend as a child process.
 * Provides health-check polling, graceful shutdown, and automatic error recovery.
 */
class BackendManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.pythonPath     — Path to the Python executable
   * @param {string} options.backendDir     — Absolute path to the backend/ directory
   * @param {string} options.host           — Host for uvicorn to bind to
   * @param {number} options.port           — Port for uvicorn to bind to
   * @param {number} options.healthCheckInterval — ms between health pings
   * @param {number} options.maxRetries     — Maximum restart attempts before giving up
   */
  constructor(options = {}) {
    super();

    this.pythonPath = options.pythonPath || 'python';
    this.backendDir = options.backendDir || path.join(__dirname, '..', '..', 'backend');
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 8000;
    this.healthCheckInterval = options.healthCheckInterval || 10000;
    this.maxRetries = options.maxRetries || 3;
    this.env = options.env || {};

    this._process = null;
    this._healthTimer = null;
    this._retryCount = 0;
    this._stopping = false;
    this._started = false;
    this._starting = false;
    this._externalBackend = false;
    this._pingInFlight = false;
    this._lastFailure = null;
    this._consecutiveHealthFailures = 0;
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Start the backend server.
   */
  start() {
    if (this._process || this._starting) {
      console.log('[BackendManager] Backend is already running.');
      return;
    }

    this._stopping = false;
    this._starting = true;
    this._checkExistingBackend();
  }

  /**
   * Gracefully stop the backend server.
   */
  stop() {
    this._stopping = true;
    this._clearHealthCheck();
    this._externalBackend = false;
    this._starting = false;

    if (!this._process) {
      return;
    }

    console.log('[BackendManager] Stopping backend…');

    // Attempt graceful shutdown with SIGTERM, force-kill after 5 s
    const pid = this._process.pid;
    try {
      this._process.kill('SIGTERM');
    } catch {
      // Process may already be gone
    }

    const forceKillTimer = setTimeout(() => {
      try {
        if (this._process && this._process.pid === pid) {
          console.log('[BackendManager] Force-killing backend (SIGKILL)…');
          this._process.kill('SIGKILL');
        }
      } catch {
        // Ignore
      }
    }, 5000);

    this._process.once('exit', () => {
      clearTimeout(forceKillTimer);
    });
  }

  /**
   * Returns true when the child process is alive.
   */
  get isRunning() {
    return this._process !== null && this._process.exitCode === null;
  }

  // ─── Internal ────────────────────────────────────────────────────────

  _spawnProcess() {
    if (this._stopping) return;
    this._starting = false;
    console.log(`[BackendManager] Starting backend on ${this.host}:${this.port}…`);

    const args = [
      '-m', 'uvicorn',
      'app.main:app',
      '--host', this.host,
      '--port', String(this.port),
    ];

    this._process = spawn(this.pythonPath, args, {
      cwd: this.backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
      windowsHide: true,
    });
    const child = this._process;

    child.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.log(`[Backend stdout] ${msg}`);
      }
    });

    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) {
        console.error(`[Backend stderr] ${msg}`);
      }
    });

    child.on('error', (err) => {
      if (this._process !== child) return;
      console.error('[BackendManager] Failed to start backend:', err.message);
      this._lastFailure = err.message;
      this._process = null;
      this._starting = false;
      this._handleCrash();
    });

    child.on('exit', (code, signal) => {
      if (this._process !== child) return;
      console.log(`[BackendManager] Backend exited (code=${code}, signal=${signal}).`);
      if (code !== 0) {
        this._lastFailure = `Backend process exited with code ${code}${signal ? ` (${signal})` : ''}.`;
      }
      this._process = null;
      this._starting = false;
      this._clearHealthCheck();

      if (!this._stopping) {
        this._handleCrash();
      }
    });

    // Start health-check polling after a brief startup grace period
    setTimeout(() => {
      if (this._process === child && !this._stopping) {
        this._started = true;
        this._startHealthCheck();
      }
    }, 3000);
  }

  _checkExistingBackend() {
    const req = http.get({
      hostname: this.host,
      port: this.port,
      path: '/api/health',
      timeout: 8000,
    }, (res) => {
      res.resume();
      if (this._stopping) return;
      this._starting = false;
      if (res.statusCode >= 200 && res.statusCode < 400) {
        this._externalBackend = true;
        console.log(`[BackendManager] Using existing backend on ${this.host}:${this.port}.`);
        this._startHealthCheck();
      } else {
        this._spawnProcess();
      }
    });

    req.on('error', () => {
      if (this._stopping) return;
      this._spawnProcess();
    });
    req.on('timeout', () => req.destroy(new Error('Backend availability check timed out.')));
  }

  _handleCrash() {
    if (this._stopping) return;

    this._retryCount++;
    if (this._retryCount > this.maxRetries) {
      console.error(
        `[BackendManager] Backend failed after ${this.maxRetries} retries. Giving up.`
      );
      this.emit('failed', { retries: this._retryCount, error: this._lastFailure });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this._retryCount - 1), 15000);
    console.log(
      `[BackendManager] Restarting backend in ${delay}ms (attempt ${this._retryCount}/${this.maxRetries})…`
    );

    setTimeout(() => {
      if (!this._stopping) {
        this._spawnProcess();
      }
    }, delay);
  }

  // ─── Health Checking ─────────────────────────────────────────────────

  _startHealthCheck() {
    this._clearHealthCheck();

    this._healthTimer = setInterval(() => {
      this._ping();
    }, this.healthCheckInterval);
    this._ping();
  }

  _clearHealthCheck() {
    if (this._healthTimer) {
      clearInterval(this._healthTimer);
      this._healthTimer = null;
    }
  }

  _ping() {
    if (this._pingInFlight) return;
    this._pingInFlight = true;
    let completed = false;
    const finish = () => {
      if (completed) return false;
      completed = true;
      this._pingInFlight = false;
      return true;
    };
    const options = {
      hostname: this.host,
      port: this.port,
      path: '/api/health',
      method: 'GET',
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      if (!finish()) {
        res.resume();
        return;
      }
      if (res.statusCode >= 200 && res.statusCode < 400) {
        // Reset retry counter on successful health check
        this._retryCount = 0;
        this._consecutiveHealthFailures = 0;
        this.emit('healthy');
      } else {
        console.warn(`[BackendManager] Health check returned status ${res.statusCode}`);
        this._handleHealthFailure({ statusCode: res.statusCode });
      }
      // Consume response data to free up memory
      res.resume();
    });

    req.on('error', (err) => {
      if (!finish()) return;
      console.warn(`[BackendManager] Health check failed: ${err.message}`);
      this._handleHealthFailure({ error: err.message });
    });

    req.on('timeout', () => {
      if (!finish()) return;
      console.warn('[BackendManager] Health check timed out.');
      req.destroy();
      this._handleHealthFailure({ error: 'timeout' });
    });

    req.end();
  }

  _handleHealthFailure(details) {
    this._consecutiveHealthFailures++;
    this.emit('unhealthy', {
      ...details,
      consecutiveFailures: this._consecutiveHealthFailures,
    });

    if (
      this._consecutiveHealthFailures >= 3
      && !this._externalBackend
      && this._process
      && this._process.exitCode === null
    ) {
      console.error('[BackendManager] Backend failed three consecutive health checks; restarting the managed process.');
      this._lastFailure = 'Backend failed three consecutive health checks.';
      this._process.kill();
    }
  }
}

module.exports = BackendManager;
