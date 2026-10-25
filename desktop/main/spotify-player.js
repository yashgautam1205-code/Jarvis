const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const SPOTIFY_API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const SCOPES = ['user-read-playback-state', 'user-modify-playback-state'];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requestJson(url, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method, headers }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size <= 1024 * 1024) chunks.push(chunk);
      });
      response.on('end', () => {
        if (size > 1024 * 1024) {
          reject(new Error('Spotify returned an unexpectedly large response.'));
          return;
        }
        const text = Buffer.concat(chunks).toString('utf8');
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            reject(new Error('Spotify returned an unreadable response.'));
            return;
          }
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(data?.error?.message || data?.error_description || 'Spotify rejected the request.');
          error.statusCode = response.statusCode;
          error.spotifyError = data?.error?.reason || data?.error?.message || data?.error;
          reject(error);
          return;
        }
        resolve({ statusCode: response.statusCode, data });
      });
    });
    request.on('error', reject);
    request.setTimeout(15000, () => request.destroy(new Error('Spotify did not respond in time.')));
    if (body) request.write(body);
    request.end();
  });
}

function normalizeWords(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function spotifySearchUrl(query) {
  return `https://open.spotify.com/search/${encodeURIComponent(query)}`;
}

function spotifyTrackUrl(track, query) {
  const trackId = typeof track.id === 'string'
    ? track.id
    : track.uri?.match(/^spotify:track:([A-Za-z0-9]+)$/)?.[1];
  return trackId
    ? `https://open.spotify.com/track/${encodeURIComponent(trackId)}`
    : spotifySearchUrl(query);
}

class SpotifyPlayer {
  constructor({ app, safeStorage, shell, requestJson: requestJsonImpl = requestJson }) {
    this.app = app;
    this.safeStorage = safeStorage;
    this.shell = shell;
    this.requestJson = requestJsonImpl;
    this.authFlow = null;
  }

  get authFile() {
    return path.join(this.app.getPath('userData'), 'spotify-auth.dat');
  }

  _loadAuth() {
    if (!fs.existsSync(this.authFile)) return null;
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure token storage is unavailable on this computer.');
    }
    const text = this.safeStorage.decryptString(fs.readFileSync(this.authFile));
    const auth = JSON.parse(text);
    return auth?.clientId && auth?.refreshToken ? auth : null;
  }

  _saveAuth(auth) {
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure token storage is unavailable on this computer.');
    }
    fs.mkdirSync(path.dirname(this.authFile), { recursive: true });
    const tempFile = `${this.authFile}.tmp`;
    fs.writeFileSync(tempFile, this.safeStorage.encryptString(JSON.stringify(auth)));
    fs.renameSync(tempFile, this.authFile);
  }

  _requestToken(values) {
    const body = new URLSearchParams(values).toString();
    return this.requestJson(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  async connect(clientId) {
    const cleanedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!/^[A-Za-z0-9]{20,100}$/.test(cleanedClientId)) {
      return { connected: false, error: 'Enter a valid Spotify Client ID from your Spotify developer app.' };
    }
    if (!this.safeStorage.isEncryptionAvailable()) {
      return { connected: false, error: 'JARVIS cannot securely store Spotify authorization on this computer.' };
    }
    if (this.authFlow) return { connected: false, error: 'A Spotify connection is already in progress.' };

    this.authFlow = true;
    try {
      const verifier = crypto.randomBytes(64).toString('hex');
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      const state = crypto.randomBytes(24).toString('hex');
      const callback = await this._waitForAuthorization({ clientId: cleanedClientId, verifier, challenge, state });
      const tokenResponse = await this._requestToken({
        grant_type: 'authorization_code',
        code: callback.code,
        redirect_uri: callback.redirectUri,
        client_id: cleanedClientId,
        code_verifier: verifier,
      });
      const token = tokenResponse.data;
      if (!token?.access_token || !token?.refresh_token) {
        return { connected: false, error: 'Spotify did not provide the authorization tokens JARVIS needs.' };
      }
      this._saveAuth({
        clientId: cleanedClientId,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
      });
      return { connected: true };
    } catch (error) {
      console.error('[Spotify] Connection failed:', error.message);
      return { connected: false, error: error.message || 'Could not connect to Spotify.' };
    } finally {
      this.authFlow = null;
    }
  }

  async _waitForAuthorization({ clientId, verifier, challenge, state }) {
    let server;
    let redirectUri;
    return new Promise((resolve, reject) => {
      let finished = false;
      let timeout;
      const finish = (error, value) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        if (server?.listening) server.close();
        if (error) reject(error);
        else resolve(value);
      };

      server = http.createServer((request, response) => {
        const callbackUrl = new URL(request.url || '/', 'http://127.0.0.1');
        if (request.method !== 'GET' || callbackUrl.pathname !== '/') {
          response.writeHead(404).end('Not found');
          return;
        }
        if (callbackUrl.searchParams.get('state') !== state) {
          response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('JARVIS could not validate this Spotify authorization.');
          return;
        }
        const authorizationError = callbackUrl.searchParams.get('error');
        if (authorizationError) {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
            .end('<!doctype html><title>Spotify not connected</title><p>Spotify authorization was not granted. You can close this window.</p>');
          finish(new Error('Spotify authorization was not granted.'));
          return;
        }
        const code = callbackUrl.searchParams.get('code');
        if (!code) {
          response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Spotify did not return an authorization code.');
          finish(new Error('Spotify did not return an authorization code.'));
          return;
        }
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end('<!doctype html><title>Spotify connected</title><p>Spotify is connected to JARVIS. You can close this window.</p>');
        finish(null, { code, redirectUri });
      });

      server.once('error', error => finish(new Error(`Could not start Spotify sign-in: ${error.message}`)));
      server.listen(0, '127.0.0.1', async () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          finish(new Error('Could not create a local Spotify sign-in callback.'));
          return;
        }
        redirectUri = `http://127.0.0.1:${address.port}`;
        const authorizeUrl = new URL(AUTH_URL);
        authorizeUrl.search = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: redirectUri,
          code_challenge_method: 'S256',
          code_challenge: challenge,
          state,
          scope: SCOPES.join(' '),
        }).toString();
        timeout = setTimeout(() => finish(new Error('Spotify sign-in timed out. Please try connecting again.')), 180000);
        try {
          await this.shell.openExternal(authorizeUrl.toString());
        } catch (error) {
          finish(new Error('Could not open the Spotify authorization page in your browser.'));
        }
      });
    });
  }

  async _refreshAuth(auth) {
    try {
      const tokenResponse = await this._requestToken({
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
        client_id: auth.clientId,
      });
      const token = tokenResponse.data;
      if (!token?.access_token) {
        throw new Error('Spotify did not provide an access token.');
      }
      const refreshed = {
        ...auth,
        accessToken: token.access_token,
        refreshToken: token.refresh_token || auth.refreshToken,
        expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
      };
      this._saveAuth(refreshed);
      return refreshed;
    } catch (error) {
      if (error.statusCode === 400 || error.statusCode === 401) {
        try { fs.rmSync(this.authFile, { force: true }); } catch { /* A future reconnect can replace the unreadable token. */ }
        throw new Error('Spotify authorization expired. Reconnect Spotify in JARVIS Settings.');
      }
      throw error;
    }
  }

  async _validAuth() {
    const auth = this._loadAuth();
    if (!auth) return null;
    if (!auth.accessToken || Number(auth.expiresAt) < Date.now() + 60000) {
      return this._refreshAuth(auth);
    }
    return auth;
  }

  async _api(pathname, options = {}, allowRefresh = true) {
    const auth = await this._validAuth();
    if (!auth) throw new Error('Connect Spotify in JARVIS Settings before asking it to play a Spotify track.');
    try {
      const url = new URL(`${SPOTIFY_API}${pathname}`);
      const body = options.body === undefined ? null : JSON.stringify(options.body);
      const response = await this.requestJson(url, {
        method: options.method || 'GET',
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
      });
      return response.data;
    } catch (error) {
      if (error.statusCode === 401 && allowRefresh) {
        const refreshed = await this._refreshAuth(auth);
        const url = new URL(`${SPOTIFY_API}${pathname}`);
        const body = options.body === undefined ? null : JSON.stringify(options.body);
        const response = await this.requestJson(url, {
          method: options.method || 'GET',
          headers: {
            Authorization: `Bearer ${refreshed.accessToken}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body,
        });
        return response.data;
      }
      throw error;
    }
  }

  _friendlyError(error, stage) {
    if (error.statusCode === 403 && stage === 'playback') {
      return `Spotify rejected playback${error.message ? `: ${error.message}` : '.'} Playback controls require Spotify Premium and an authorized account.`;
    }
    if (error.statusCode === 403) {
      return `Spotify denied this request${error.message ? `: ${error.message}` : '.'} Check that your developer app is active and your account is authorized.`;
    }
    if (error.statusCode === 404) {
      return `Spotify returned HTTP 404${error.message ? `: ${error.message}` : '. Check that a Spotify playback device is active.'}`;
    }
    if (error.statusCode === 429) {
      return `Spotify is temporarily rate-limiting requests${error.message ? `: ${error.message}` : '.'} Wait a moment and try again.`;
    }
    if (error.statusCode === 401) {
      return 'Spotify authorization expired. Reconnect Spotify in JARVIS Settings.';
    }
    return error.message || `Spotify ${stage} failed.`;
  }

  async getStatus() {
    try {
      const auth = this._loadAuth();
      return { connected: Boolean(auth?.refreshToken) };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  disconnect() {
    try {
      fs.rmSync(this.authFile, { force: true });
      fs.rmSync(`${this.authFile}.tmp`, { force: true });
      return { disconnected: true };
    } catch {
      return { disconnected: false, error: 'Could not remove Spotify authorization from this computer.' };
    }
  }

  async play(query) {
    const cleanedQuery = typeof query === 'string' ? query.trim() : '';
    if (!cleanedQuery || cleanedQuery.length > 300) {
      return { playing: false, error: 'Spotify search text is invalid.' };
    }
    let fallbackUrl = spotifySearchUrl(cleanedQuery);
    let stage = 'search';

    try {
      const search = await this._api(`/search?${new URLSearchParams({ q: cleanedQuery, type: 'track', limit: '10' })}`);
      const tracks = search?.tracks?.items || [];
      if (!tracks.length) {
        return {
          playing: false,
          fallbackUrl,
          error: `Spotify could not find a track matching “${cleanedQuery}”.`,
        };
      }

      const queryTerms = new Set(normalizeWords(cleanedQuery));
      const ranked = tracks.map((track, index) => {
        const title = track.name || '';
        const artist = (track.artists || []).map(item => item.name).join(' ');
        const terms = new Set(normalizeWords(`${title} ${artist}`));
        const matched = [...queryTerms].filter(term => terms.has(term)).length;
        const recall = queryTerms.size ? matched / queryTerms.size : 0;
        const precision = terms.size ? matched / terms.size : 0;
        const rankBonus = tracks.length > 1 ? 1 - index / tracks.length : 1;
        return { track, title, artist, score: 0.8 * recall + 0.15 * precision + 0.05 * rankBonus };
      }).sort((left, right) => right.score - left.score);

      const best = ranked[0];
      const second = ranked[1];
      if (best.score < 0.56) {
        return {
          playing: false,
          fallbackUrl,
          error: 'Spotify results did not contain a clear match. Include the artist name and try again.',
        };
      }
      if (second && best.score - second.score < 0.055) {
        return {
          playing: false,
          ambiguous: true,
          fallbackUrl,
          candidates: ranked.slice(0, 3).map(item => ({ title: item.title, artist: item.artist })),
          error: 'I found several close Spotify matches. Please tell me the artist or version you mean.',
        };
      }
      fallbackUrl = spotifyTrackUrl(best.track, cleanedQuery);
      if (!best.track.uri || best.track.is_playable === false) {
        return {
          playing: false,
          fallbackUrl,
          error: 'Spotify found that track, but it is not playable in your account’s market.',
        };
      }

      // The URI scheme brings the installed client online; the Web API selects and starts the track.
      stage = 'open-player';
      await this.shell.openExternal(`spotify:search:${encodeURIComponent(cleanedQuery)}`);
      let devices = [];
      stage = 'device-selection';
      const deviceDeadline = Date.now() + 15000;
      while (Date.now() < deviceDeadline) {
        const deviceResponse = await this._api('/me/player/devices');
        devices = deviceResponse?.devices || [];
        if (devices.some(device => device.id && !device.is_restricted)) break;
        await delay(600);
      }
      const available = devices.filter(device => device.id && !device.is_restricted);
      if (!available.length) {
        return {
          playing: false,
          fallbackUrl,
          error: 'Spotify opened, but no Spotify playback device became available. Sign in to the desktop app and try again.',
        };
      }

      const target = available.find(device => device.is_active)
        || available.find(device => device.type === 'computer')
        || available[0];
      stage = 'playback';
      await this._api(`/me/player/play?device_id=${encodeURIComponent(target.id)}`, {
        method: 'PUT',
        body: { uris: [best.track.uri] },
      });

      stage = 'playback-verification';
      const verifyDeadline = Date.now() + 7000;
      while (Date.now() < verifyDeadline) {
        await delay(700);
        const playback = await this._api('/me/player');
        if (playback?.is_playing && playback?.item?.uri === best.track.uri) {
          return { playing: true, title: best.title, artist: best.artist, fallbackUrl };
        }
      }
      return {
        playing: false,
        fallbackUrl,
        error: 'Spotify accepted the track request, but JARVIS could not confirm that playback started.',
      };
    } catch (error) {
      console.error('[Spotify] Playback failed:', error.message);
      return {
        playing: false,
        fallbackUrl,
        error: this._friendlyError(error, stage),
      };
    }
  }
}

module.exports = SpotifyPlayer;
