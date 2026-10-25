const { execFile } = require('child_process');

const MEDIA_KEYS = {
  play: 0xb3,
  pause: 0xb3,
  resume: 0xb3,
  next: 0xb0,
  previous: 0xb1,
};

const WINDOWS_MEDIA_KEY_SCRIPT = `
$source = @'
using System;
using System.Runtime.InteropServices;
public static class JarvisWindowsMediaKey {
  [DllImport("user32.dll")]
  private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);
  public static void Send(byte key) {
    keybd_event(key, 0, 0, UIntPtr.Zero);
    keybd_event(key, 0, 2, UIntPtr.Zero);
  }
}
'@
Add-Type -TypeDefinition $source
[JarvisWindowsMediaKey]::Send([byte]__KEY__)
`;

const SPOTIFY_RESULT_SCRIPT = `
$ErrorActionPreference = 'Stop'
function Normalize-SpotifyText([string]$value) {
  return [regex]::Replace($value.ToLowerInvariant(), '[^\\p{L}\\p{Nd}]', '')
}
function Get-MatchingRow($element, [string]$title, [string]$artist) {
  $node = $element
  for ($depth = 0; $depth -lt 7 -and $null -ne $node; $depth++) {
    $names = @($node.FindAll(
      [System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition
    ) | ForEach-Object { $_.Current.Name })
    $normalizedNames = @($names | ForEach-Object { Normalize-SpotifyText $_ })
    if ($normalizedNames -contains $title -and (($normalizedNames -join ' ') -like ('*' + $artist + '*'))) {
      return $node
    }
    $node = [System.Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($node)
  }
  return $null
}
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
  $spec = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__SPEC__')) | ConvertFrom-Json
  $title = Normalize-SpotifyText $spec.title
  $artist = Normalize-SpotifyText $spec.artist
  $deadline = (Get-Date).AddSeconds(9)
  $matchedButton = $null
  $matchedWindow = $null
  while ((Get-Date) -lt $deadline -and $null -eq $matchedButton) {
    $processIds = @(Get-Process -Name Spotify -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
    $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
      [System.Windows.Automation.TreeScope]::Children,
      [System.Windows.Automation.Condition]::TrueCondition
    )
    foreach ($window in $windows) {
      if ($processIds -notcontains $window.Current.ProcessId) { continue }
      $elements = $window.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        [System.Windows.Automation.Condition]::TrueCondition
      )
      foreach ($element in $elements) {
        if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button) { continue }
        if ($element.Current.Name -notmatch '^Play(?:\\s|$)' -or -not $element.Current.IsEnabled) { continue }
        if ($null -ne (Get-MatchingRow $element $title $artist)) {
          if ($null -ne $matchedButton) {
            @{ matched = $false; reason = 'Spotify showed multiple exact matching results.' } | ConvertTo-Json -Compress
            exit 0
          }
          $matchedButton = $element
          $matchedWindow = $window
        }
      }
    }
    if ($null -eq $matchedButton) { Start-Sleep -Milliseconds 400 }
  }
  if ($null -eq $matchedButton) {
    @{ matched = $false; reason = 'No exact song and artist result with an accessible Play button was found.' } | ConvertTo-Json -Compress
    exit 0
  }
  $invoke = $matchedButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()
  Start-Sleep -Milliseconds 1400
  $confirmed = $false
  $after = $matchedWindow.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  foreach ($element in $after) {
    if ($element.Current.ControlType -ne [System.Windows.Automation.ControlType]::Button) { continue }
    if ($element.Current.Name -notmatch '^Pause(?:\\s|$)') { continue }
    if ($null -ne (Get-MatchingRow $element $title $artist)) { $confirmed = $true; break }
  }
  @{ matched = $true; confirmed = $confirmed; reason = '' } | ConvertTo-Json -Compress
} catch {
  @{ matched = $false; reason = ('Spotify UI automation failed: ' + $_.Exception.Message) } | ConvertTo-Json -Compress
}
`;

function runFile(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseSpotifyUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password) {
      return null;
    }
    const match = url.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|playlist)\/([A-Za-z0-9]+)\/?$/i);
    if (!match) return null;
    return {
      type: match[1].toLowerCase(),
      url: `https://open.spotify.com/${match[1].toLowerCase()}/${match[2]}`,
    };
  } catch {
    return null;
  }
}

function spotifySearchTarget(query) {
  if (typeof query !== 'string') return null;
  const match = query.trim().match(/^(.+?)\s+by\s+(.+)$/i);
  if (!match) return null;
  const title = match[1].trim();
  const artist = match[2].trim();
  return title && artist ? { title, artist } : null;
}

class SpotifyWindows {
  constructor({ platform = process.platform, shell, run = runFile } = {}) {
    this.platform = platform;
    this.shell = shell;
    this.run = run;
  }

  async getStatus() {
    if (this.platform !== 'win32') {
      return {
        running: false,
        available: false,
        supported: false,
        error: 'Spotify desktop controls are available only on Windows.',
      };
    }
    try {
      const output = await this.run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$process = Get-Process -Name "Spotify" -ErrorAction SilentlyContinue | Select-Object -First 1; $registered = Test-Path "Registry::HKEY_CLASSES_ROOT\\spotify\\shell\\open\\command"; $installed = Get-AppxPackage -Name "SpotifyAB.SpotifyMusic" -ErrorAction SilentlyContinue; if ($process) { "running" }; if ($registered) { "registered" }; if ($installed) { "installed" }',
      ]);
      const lines = output.trim().split(/\r?\n/);
      const running = lines.includes('running');
      return {
        running,
        available: running || lines.includes('registered') || lines.includes('installed'),
        supported: true,
        installed: lines.includes('installed') || lines.includes('registered') || running,
      };
    } catch (error) {
      return {
        running: false,
        available: false,
        supported: true,
        error: `Could not check Spotify desktop status: ${error.message}`,
      };
    }
  }

  async launch() {
    if (this.platform !== 'win32') {
      return { success: false, launched: false, confirmed: false, error: 'Spotify desktop launch is available only on Windows.' };
    }
    try {
      await this.shell.openExternal('spotify:');
      return {
        success: true,
        launched: true,
        confirmed: false,
        message: 'Sent the Spotify desktop launch request. The app launch was not verified.',
      };
    } catch (error) {
      return {
        success: false,
        launched: false,
        confirmed: false,
        error: `Could not launch Spotify desktop: ${error.message}`,
      };
    }
  }

  async search(query) {
    const cleanedQuery = typeof query === 'string' ? query.trim() : '';
    if (!cleanedQuery || cleanedQuery.length > 300) {
      return { success: false, opened: false, confirmed: false, error: 'Spotify search text is invalid.' };
    }
    try {
      await this.shell.openExternal(`spotify:search:${encodeURIComponent(cleanedQuery)}`);
      const target = this.platform === 'win32' ? spotifySearchTarget(cleanedQuery) : null;
      if (!target) {
        return {
          success: true,
          opened: true,
          confirmed: false,
          query: cleanedQuery,
          message: `Opened Spotify search results for “${cleanedQuery}”. Automatic playback needs a specific song and artist; playback is not confirmed.`,
        };
      }
      try {
        const spec = Buffer.from(JSON.stringify(target), 'utf8').toString('base64');
        const output = await this.run('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          SPOTIFY_RESULT_SCRIPT.replace('__SPEC__', spec),
        ]);
        const result = JSON.parse(output.trim());
        if (result.matched) {
          return {
            success: true,
            opened: true,
            selected: true,
            confirmed: result.confirmed === true,
            query: cleanedQuery,
            message: result.confirmed
              ? `Started playing “${target.title}” by ${target.artist} in Spotify; the Spotify result changed to its Pause control.`
              : `Selected “${target.title}” by ${target.artist} in Spotify, but playback could not be confirmed. Check Spotify to verify.`,
          };
        }
        return {
          success: true,
          opened: true,
          confirmed: false,
          query: cleanedQuery,
          message: `Opened Spotify search results for “${cleanedQuery}”. ${result.reason || 'No safe matching result was available.'} Select the correct result in Spotify to start playback.`,
        };
      } catch (error) {
        return {
          success: true,
          opened: true,
          confirmed: false,
          query: cleanedQuery,
          message: `Opened Spotify search results for “${cleanedQuery}”, but automatic selection failed: ${error.message}. Select the correct result in Spotify to start playback.`,
        };
      }
    } catch (error) {
      return {
        success: false,
        opened: false,
        confirmed: false,
        error: `Could not open Spotify search: ${error.message}`,
      };
    }
  }

  async control(action) {
    const key = MEDIA_KEYS[action];
    if (!key) {
      return {
        success: false,
        confirmed: false,
        error: 'Windows Spotify fallback supports only play/pause, next track, and previous track.',
      };
    }
    let status = await this.getStatus();
    if (!status.supported) {
      return {
        success: false,
        confirmed: false,
        error: status.error || 'Spotify desktop controls are unavailable.',
      };
    }
    if (!status.running) {
      if (!status.available) {
        return {
          success: false,
          confirmed: false,
          error: 'Spotify desktop is not installed or its Windows link is not registered.',
        };
      }
      const launchResult = await this.launch();
      if (!launchResult.success) return { ...launchResult, confirmed: false };
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 500));
        status = await this.getStatus();
        if (status.running) break;
      }
      if (!status.running) {
        return {
          success: false,
          confirmed: false,
          error: 'Spotify launch was requested, but the Spotify desktop process did not appear; no media key was sent.',
        };
      }
    }
    try {
      const script = WINDOWS_MEDIA_KEY_SCRIPT.replace('__KEY__', String(key));
      await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
      return {
        success: true,
        commandSent: true,
        confirmed: false,
        message: `Sent the Windows ${action} media key while Spotify desktop is running. Windows does not confirm which player handled it or whether playback changed.`,
      };
    } catch (error) {
      return {
        success: false,
        confirmed: false,
        error: `Could not send the Windows media key: ${error.message}`,
      };
    }
  }

  async openUrl(value) {
    const spotifyUrl = parseSpotifyUrl(value);
    if (!spotifyUrl) {
      return {
        success: false,
        opened: false,
        confirmed: false,
        error: 'Only HTTPS Spotify track and playlist links can be opened.',
      };
    }
    try {
      await this.shell.openExternal(spotifyUrl.url);
      return {
        success: true,
        opened: true,
        confirmed: false,
        type: spotifyUrl.type,
        url: spotifyUrl.url,
        message: `Opened the Spotify ${spotifyUrl.type} link. This does not confirm playback.`,
      };
    } catch (error) {
      return {
        success: false,
        opened: false,
        confirmed: false,
        error: `Could not open the Spotify link: ${error.message}`,
      };
    }
  }
}

module.exports = { SpotifyWindows, parseSpotifyUrl, spotifySearchTarget };
