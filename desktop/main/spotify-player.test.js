const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const SpotifyPlayer = require('./spotify-player');

function createSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`test:${Buffer.from(value).toString('base64')}`),
    decryptString: value => Buffer.from(value.toString().slice(5), 'base64').toString(),
  };
}

function createPlayer(t, { requestJson, shell } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-spotify-test-'));
  t.after(() => fs.rmSync(userData, { recursive: true, force: true }));
  return new SpotifyPlayer({
    app: { getPath: () => userData },
    safeStorage: createSafeStorage(),
    shell: shell || { openExternal: async () => {} },
    requestJson,
  });
}

function response(data, statusCode = 200) {
  return { data, statusCode };
}

function makeTrack() {
  return {
    id: '4uLU6hMCjMI75M1A2tKUQC',
    uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC',
    name: 'Him & I',
    artists: [{ name: 'G-Eazy' }],
    is_playable: true,
  };
}

test('Spotify OAuth uses PKCE callback and stores tokens through secure storage', async t => {
  let tokenRequest;
  const player = createPlayer(t, {
    requestJson: async (url, options) => {
      tokenRequest = { url: String(url), options };
      return response({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
      });
    },
    shell: {
      openExternal: async authorizeUrl => {
        const authorize = new URL(authorizeUrl);
        assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
        assert.ok(authorize.searchParams.get('code_challenge'));
        assert.match(authorize.searchParams.get('state'), /^[a-f0-9]{48}$/);

        const callback = new URL(authorize.searchParams.get('redirect_uri'));
        callback.searchParams.set('code', 'authorization-code');
        callback.searchParams.set('state', authorize.searchParams.get('state'));
        await new Promise((resolve, reject) => {
          const request = http.get(callback, response => {
            response.resume();
            response.once('end', resolve);
          });
          request.once('error', reject);
        });
      },
    },
  });

  assert.deepEqual(await player.connect('A'.repeat(32)), { connected: true });
  assert.equal(tokenRequest.url, 'https://accounts.spotify.com/api/token');
  const body = new URLSearchParams(tokenRequest.options.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('code'), 'authorization-code');
  assert.ok(body.get('code_verifier'));
  assert.equal((await player.getStatus()).connected, true);
  assert.equal(fs.readFileSync(player.authFile, 'utf8').includes('refresh-token'), false);
});

test('expired Spotify tokens refresh before search and playback uses the selected Connect device', async t => {
  const requests = [];
  const player = createPlayer(t, {
    requestJson: async (url, options) => {
      const requestUrl = new URL(String(url));
      requests.push({ url: requestUrl, options });

      if (requestUrl.hostname === 'accounts.spotify.com') {
        return response({ access_token: 'new-access-token', expires_in: 3600 });
      }
      if (requestUrl.pathname === '/v1/search') {
        assert.equal(requestUrl.searchParams.get('q'), 'Him & I by G-Eazy');
        return response({ tracks: { items: [makeTrack()] } });
      }
      if (requestUrl.pathname === '/v1/me/player/devices') {
        return response({ devices: [{ id: 'computer-device', type: 'computer', is_active: true }] });
      }
      if (requestUrl.pathname === '/v1/me/player/play') {
        assert.equal(requestUrl.searchParams.get('device_id'), 'computer-device');
        assert.equal(options.method, 'PUT');
        assert.deepEqual(JSON.parse(options.body), { uris: [makeTrack().uri] });
        return response(null, 204);
      }
      if (requestUrl.pathname === '/v1/me/player') {
        return response({ is_playing: true, item: { uri: makeTrack().uri } });
      }
      throw new Error(`Unexpected Spotify request: ${requestUrl}`);
    },
  });
  player._saveAuth({
    clientId: 'A'.repeat(32),
    accessToken: 'expired-access-token',
    refreshToken: 'existing-refresh-token',
    expiresAt: Date.now() - 1000,
  });

  const result = await player.play('Him & I by G-Eazy');

  assert.equal(result.playing, true);
  assert.equal(result.title, 'Him & I');
  assert.equal(result.artist, 'G-Eazy');
  assert.equal(result.fallbackUrl, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  const refreshBody = new URLSearchParams(requests[0].options.body);
  assert.equal(refreshBody.get('grant_type'), 'refresh_token');
  assert.equal(refreshBody.get('refresh_token'), 'existing-refresh-token');
  assert.equal(player._loadAuth().refreshToken, 'existing-refresh-token');
});

test('Spotify API playback errors retain the provider reason and track fallback link', async t => {
  const player = createPlayer(t, {
    requestJson: async url => {
      const requestUrl = new URL(String(url));
      if (requestUrl.pathname === '/v1/search') {
        return response({ tracks: { items: [makeTrack()] } });
      }
      if (requestUrl.pathname === '/v1/me/player/devices') {
        return response({ devices: [{ id: 'computer-device', type: 'computer', is_active: true }] });
      }
      if (requestUrl.pathname === '/v1/me/player/play') {
        const error = new Error('Player command failed: Premium required.');
        error.statusCode = 403;
        error.spotifyError = 'PREMIUM_REQUIRED';
        throw error;
      }
      throw new Error(`Unexpected Spotify request: ${requestUrl}`);
    },
  });
  player._saveAuth({
    clientId: 'A'.repeat(32),
    accessToken: 'valid-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3600_000,
  });

  const result = await player.play('Him & I by G-Eazy');

  assert.equal(result.playing, false);
  assert.match(result.error, /Premium required/);
  assert.equal(result.fallbackUrl, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
});

test('Spotify empty search results return a Spotify search fallback', async t => {
  const player = createPlayer(t, {
    requestJson: async () => response({ tracks: { items: [] } }),
  });
  player._saveAuth({
    clientId: 'A'.repeat(32),
    accessToken: 'valid-access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + 3600_000,
  });

  const result = await player.play('Unknown song');

  assert.equal(result.playing, false);
  assert.match(result.error, /could not find a track/i);
  assert.equal(result.fallbackUrl, 'https://open.spotify.com/search/Unknown%20song');
});
