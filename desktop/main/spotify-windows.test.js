const assert = require('node:assert/strict');
const test = require('node:test');

const { SpotifyWindows, parseSpotifyUrl, spotifySearchTarget } = require('./spotify-windows');

test('Spotify desktop status detects a running Windows process', async () => {
  const calls = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async (file, args) => {
      calls.push({ file, args });
      return 'running\r\navailable\r\n';
    },
    shell: { openExternal: async () => {} },
  });

  assert.deepEqual(await spotify.getStatus(), {
    running: true,
    available: true,
    supported: true,
    installed: true,
  });
  assert.equal(calls[0].file, 'powershell.exe');
  assert.match(calls[0].args.join(' '), /Get-Process -Name "Spotify"/);
});

test('Spotify desktop status detects a Microsoft Store install', async () => {
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async () => 'installed\r\n',
    shell: { openExternal: async () => {} },
  });

  assert.deepEqual(await spotify.getStatus(), {
    running: false,
    available: true,
    supported: true,
    installed: true,
  });
});

test('Spotify media key fallback only sends supported actions when Spotify is running', async () => {
  const calls = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async (_file, args) => {
      calls.push(args.join(' '));
      return calls.length === 1 ? 'running' : '';
    },
    shell: { openExternal: async () => {} },
  });

  const result = await spotify.control('next');

  assert.equal(result.success, true);
  assert.equal(result.commandSent, true);
  assert.equal(result.confirmed, false);
  assert.match(calls[1], /Send\(\[byte\]176\)/);
});

test('Spotify media key fallback does not send a key when Spotify is not running', async () => {
  const calls = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async () => {
      calls.push('run');
      return '';
    },
    shell: { openExternal: async () => {} },
  });

  const result = await spotify.control('pause');

  assert.equal(result.success, false);
  assert.equal(result.confirmed, false);
  assert.match(result.error, /Spotify desktop is not installed/);
  assert.equal(calls.length, 1);
});

test('Spotify search uses the desktop deep link and never claims playback', async () => {
  const opened = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async () => JSON.stringify({
      matched: false,
      reason: 'No exact song and artist result with an accessible Play button was found.',
    }),
    shell: { openExternal: async url => opened.push(url) },
  });

  const result = await spotify.search('Believer by Imagine Dragons');

  assert.equal(result.success, true);
  assert.equal(result.opened, true);
  assert.equal(result.confirmed, false);
  assert.deepEqual(opened, ['spotify:search:Believer%20by%20Imagine%20Dragons']);
  assert.match(result.message, /Select the correct result/);
});

test('Spotify search selects only a matching song and artist and verifies its Pause state', async () => {
  const opened = [];
  const commands = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async (_file, args) => {
      commands.push(args.join(' '));
      return JSON.stringify({ matched: true, confirmed: true, reason: '' });
    },
    shell: { openExternal: async url => opened.push(url) },
  });

  const result = await spotify.search('Believer by Imagine Dragons');

  assert.equal(result.selected, true);
  assert.equal(result.confirmed, true);
  assert.match(result.message, /Pause control/);
  assert.deepEqual(opened, ['spotify:search:Believer%20by%20Imagine%20Dragons']);
  assert.match(commands[0], /AutomationElement/);
  assert.match(commands[0], /Invoke\(\)/);
});

test('Spotify search does not automate ambiguous artist-only requests', async () => {
  const opened = [];
  let automationCalls = 0;
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async () => {
      automationCalls += 1;
      return '';
    },
    shell: { openExternal: async url => opened.push(url) },
  });

  const result = await spotify.search('Arijit Singh');

  assert.equal(result.opened, true);
  assert.equal(result.confirmed, false);
  assert.match(result.message, /specific song and artist/);
  assert.equal(automationCalls, 0);
  assert.deepEqual(opened, ['spotify:search:Arijit%20Singh']);
});

test('Spotify song search target requires title and artist', () => {
  assert.deepEqual(spotifySearchTarget('Believer by Imagine Dragons'), {
    title: 'Believer',
    artist: 'Imagine Dragons',
  });
  assert.equal(spotifySearchTarget('Arijit Singh'), null);
  assert.equal(spotifySearchTarget('Believer by '), null);
});

test('Spotify can be launched through the registered desktop protocol', async () => {
  const opened = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    shell: { openExternal: async url => opened.push(url) },
  });

  const result = await spotify.launch();

  assert.equal(result.success, true);
  assert.equal(result.launched, true);
  assert.equal(result.confirmed, false);
  assert.deepEqual(opened, ['spotify:']);
});

test('media commands launch an installed Spotify app before sending the key', async () => {
  let statusChecks = 0;
  const opened = [];
  const commands = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async (_file, args) => {
      const command = args[args.indexOf('-Command') + 1];
      if (command.includes('Get-Process')) {
        statusChecks += 1;
        return statusChecks === 1 ? 'installed' : 'running\r\ninstalled';
      }
      commands.push(command);
      return '';
    },
    shell: { openExternal: async url => opened.push(url) },
  });

  const result = await spotify.control('resume');

  assert.equal(result.success, true);
  assert.equal(result.confirmed, false);
  assert.deepEqual(opened, ['spotify:']);
  assert.equal(commands.length, 1);
  assert.match(commands[0], /Send\(\[byte\]179\)/);
});

test('media fallback rejects unsupported actions and non-Windows systems', async () => {
  const spotify = new SpotifyWindows({
    platform: 'linux',
    run: async () => { throw new Error('Must not run on Linux'); },
    shell: { openExternal: async () => {} },
  });

  assert.equal((await spotify.control('stop')).success, false);
  assert.equal((await spotify.getStatus()).supported, false);
});

test('only Spotify HTTPS track and playlist links are accepted', () => {
  assert.deepEqual(
    parseSpotifyUrl('https://open.spotify.com/intl-en/track/4uLU6hMCjMI75M1A2tKUQC?si=abc'),
    { type: 'track', url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC' },
  );
  assert.deepEqual(
    parseSpotifyUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
    { type: 'playlist', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
  );
  assert.equal(parseSpotifyUrl('https://evil.example/track/abc'), null);
  assert.equal(parseSpotifyUrl('http://open.spotify.com/track/abc'), null);
  assert.equal(parseSpotifyUrl('https://open.spotify.com/album/abc'), null);
});

test('opening Spotify links uses only the validated URL and does not claim playback', async () => {
  const opened = [];
  const spotify = new SpotifyWindows({
    platform: 'win32',
    run: async () => '',
    shell: { openExternal: async url => opened.push(url) },
  });

  const result = await spotify.openUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');

  assert.equal(result.success, true);
  assert.equal(result.opened, true);
  assert.equal(result.confirmed, false);
  assert.equal(result.type, 'playlist');
  assert.deepEqual(opened, [result.url]);
});
