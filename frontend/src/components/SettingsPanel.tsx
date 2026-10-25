import { useEffect, useState } from 'react';
import { apiUrl } from '../services/apiBase';

interface Props {
  settings: Record<string, any>;
  onUpdate: (key: string, value: string) => void;
  onRefresh?: () => void;
}

export default function SettingsPanel({ settings, onUpdate, onRefresh }: Props) {
  const [pullingModel, setPullingModel] = useState(false);
  const [modelMessage, setModelMessage] = useState('');
  const [pullProgress, setPullProgress] = useState(0);
  const [spotifyDesktopStatus, setSpotifyDesktopStatus] = useState('Checking…');
  const [spotifyBusy, setSpotifyBusy] = useState(false);
  const [spotifyMessage, setSpotifyMessage] = useState('');
  const ollamaModels: string[] = Array.isArray(settings.ollama_models) ? settings.ollama_models : [];
  const provider = String(settings.ai_provider || 'ollama');
  const activeProvider = String(settings.active_provider || (settings.ollama_available ? 'ollama' : 'demo'));

  useEffect(() => {
    const getDesktopStatus = window.electronAPI?.getSpotifyDesktopStatus;
    if (!getDesktopStatus) {
      setSpotifyDesktopStatus('Available only in the JARVIS Windows desktop app');
      return;
    }
    getDesktopStatus()
      .then(result => setSpotifyDesktopStatus(
        result.running
          ? 'Running'
          : result.available
            ? 'Installed, not running'
            : result.error || 'Not detected',
      ))
      .catch(() => setSpotifyDesktopStatus('Could not check status'));
  }, []);

  const pullModel = async () => {
    setPullingModel(true);
    setPullProgress(0);
    setModelMessage('Connecting to Ollama…');
    try {
      const response = await fetch(apiUrl('settings/ollama/pull'), { method: 'POST' });
      if (!response.ok || !response.body) {
        throw new Error(`Ollama model download returned HTTP ${response.status}.`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        pending += decoder.decode(value || new Uint8Array(), { stream: !done });
        const lines = pending.split('\n');
        pending = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'progress') {
            if (typeof event.total === 'number' && event.total > 0 && typeof event.completed === 'number') {
              setPullProgress(Math.floor((event.completed / event.total) * 100));
            }
            setModelMessage(String(event.status || 'Downloading model…'));
          }
          if (event.type === 'complete') completed = true;
        }
        if (done) break;
      }
      if (!completed) throw new Error('Ollama ended the download without confirming completion.');
      setModelMessage('Model downloaded. Local AI is ready.');
      setPullProgress(100);
      onRefresh?.();
    } catch (error) {
      setModelMessage(error instanceof Error ? error.message : 'Ollama model download failed.');
    } finally {
      setPullingModel(false);
    }
  };

  const launchSpotify = async () => {
    if (!window.electronAPI?.launchSpotifyDesktop) {
      setSpotifyMessage('Launching Spotify is available in the JARVIS Windows desktop app.');
      return;
    }
    setSpotifyBusy(true);
    setSpotifyMessage('Requesting Spotify desktop launch…');
    try {
      const result = await window.electronAPI.launchSpotifyDesktop();
      setSpotifyMessage(result.message || result.error || 'Spotify launch was requested; app startup is not verified.');
      if (result.success) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const status = await window.electronAPI.getSpotifyDesktopStatus?.();
        if (status) {
          setSpotifyDesktopStatus(status.running
            ? 'Running'
            : status.available
              ? 'Installed, not running'
              : status.error || 'Not detected');
        }
      }
    } catch (error) {
      setSpotifyMessage(error instanceof Error ? error.message : 'Spotify could not be launched.');
    } finally {
      setSpotifyBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AI Settings */}
      <Section title="AI Intelligence Engine">
        <SettingRow label="AI Provider" value="">
          <select
            className="input-jarvis text-xs w-64"
            value={provider === 'openai' ? 'openai' : 'ollama'}
            onChange={e => onUpdate('ai_provider', e.target.value)}
          >
            <option value="ollama">Ollama (local, no API key)</option>
            <option value="openai">OpenAI (optional hosted provider)</option>
          </select>
        </SettingRow>

        {provider !== 'openai' && (
          <SettingRow label="Local Ollama Model" value="">
            <select
              className="input-jarvis text-xs w-64"
              value={String(settings.ollama_model || 'qwen3:8b')}
              onChange={e => onUpdate('ollama_model', e.target.value)}
            >
              {[...new Set([
                String(settings.ollama_model || 'qwen3:8b'),
                'qwen3:8b',
                'gemma3:4b',
                ...ollamaModels,
              ])].map(model => (
                <option key={model} value={model}>
                  {model}{ollamaModels.includes(model) ? ' (installed)' : ''}
                </option>
              ))}
            </select>
          </SettingRow>
        )}

        {provider === 'openai' && (
          <SettingRow label="OpenAI Model" value={String(settings.ai_model || 'gpt-4o-mini')}>
            <select
              className="input-jarvis text-xs w-64"
              value={String(settings.ai_model || 'gpt-4o-mini')}
              onChange={e => onUpdate('ai_model', e.target.value)}
            >
              <option value="gpt-4o-mini">GPT-4o Mini (Fast & Efficient)</option>
              <option value="gpt-4o">GPT-4o (High Intelligence)</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </SettingRow>
        )}
        {provider === 'openai' && !settings.openai_configured && (
          <p role="status" className="text-xs text-jarvis-muted">
            OpenAI is optional and not configured. Add OPENAI_API_KEY to the backend environment only if you want hosted AI; otherwise select Ollama.
          </p>
        )}

        {provider !== 'openai' && (
          <div className="rounded border border-jarvis-cyan/20 bg-black/20 p-3 space-y-2">
            <p className="text-xs text-jarvis-muted">
              Ollama: {settings.ollama_available ? 'running' : settings.ollama_installed ? 'installed but not running' : 'not detected'}.
              {' '}Configured model: {!settings.ollama_available ? 'not checked' : settings.ollama_model_available ? 'available' : 'not downloaded'}.
            </p>
            {!settings.ollama_model_available && (
              <button
                type="button"
                className="px-3 py-1 text-xs border border-jarvis-cyan/40 rounded text-jarvis-cyan disabled:opacity-50"
                onClick={pullModel}
                disabled={pullingModel || !settings.ollama_available}
              >
                {pullingModel ? `Downloading… ${pullProgress}%` : `Download ${settings.ollama_model || 'qwen3:8b'}`}
              </button>
            )}
            {!settings.ollama_available && <p className="text-xs text-jarvis-muted">{settings.ollama_guidance || 'Install Ollama from https://ollama.com/download, then start it.'}</p>}
            {modelMessage && <p role="status" className="text-xs text-jarvis-muted">{modelMessage}</p>}
          </div>
        )}

        <SettingRow label="Active Status" value="">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
              activeProvider === 'ollama' ? 'bg-jarvis-cyan/10 text-jarvis-cyan border border-jarvis-cyan/30' :
              activeProvider === 'openai' ? 'bg-jarvis-success/10 text-jarvis-success border border-jarvis-success/30' :
              'bg-jarvis-warning/10 text-jarvis-warning border border-jarvis-warning/30'
            }`}>
              {activeProvider === 'ollama' ? `Local Ollama (${settings.ollama_model || 'qwen3:8b'})` :
               activeProvider === 'openai' ? `OpenAI Cloud (${settings.ai_model || 'gpt-4o-mini'})` :
               settings.ollama_guidance || 'Local AI is not ready'}
            </span>
          </div>
        </SettingRow>
      </Section>

      <Section title="Live Web Search">
        <SettingRow label="Search Provider" value={String(settings.search_provider || 'DuckDuckGo HTML')} />
        <SettingRow label="Availability" value="Keyless browser search" />
        <p className="text-xs text-jarvis-muted leading-relaxed">
          JARVIS uses the configured search-engine URL without an API key, then safely fetches a small number of accessible public pages. Some engines or websites may block extraction.
        </p>
      </Section>

      <Section title="Automatic Music Playback">
        <SettingRow label="YouTube" value="Browser search with verified playback attempts" />
        <SettingRow label="Spotify desktop" value={spotifyDesktopStatus} />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="px-3 py-1 text-xs border border-jarvis-cyan/40 rounded text-jarvis-cyan disabled:opacity-50"
            onClick={launchSpotify}
            disabled={spotifyBusy}
          >
            {spotifyBusy ? 'Opening…' : 'Open Spotify'}
          </button>
        </div>
        {spotifyMessage && <p role="status" className="text-xs text-jarvis-muted">{spotifyMessage}</p>}
        <p className="text-xs text-jarvis-muted leading-relaxed">
          No Spotify Developer app or login setup is needed. Voice commands can open Spotify search results for a song or artist; select a result in Spotify to start playback. Play/pause, next, and previous use Windows media controls. JARVIS reports when a command was sent but does not claim playback unless it can verify it. YouTube may be blocked by ads, sign-in prompts, unavailable tracks, or website changes.
        </p>
      </Section>

      {/* Voice Settings */}
      <Section title="Voice Interaction">
        <SettingRow label="Text-to-Speech" value="">
          <Toggle
            value={settings.tts_enabled === 'true'}
            onChange={v => onUpdate('tts_enabled', String(v))}
          />
        </SettingRow>
        <SettingRow label="Speech Speed" value="">
          <input
            type="range" min="0.5" max="2" step="0.1"
            value={String(settings.voice_speed || '1.0')}
            onChange={e => onUpdate('voice_speed', e.target.value)}
            className="w-32 accent-jarvis-cyan"
          />
          <span className="text-xs text-jarvis-muted ml-2">{settings.voice_speed || '1.0'}x</span>
        </SettingRow>
        <SettingRow
          label="Wake-word activation"
          value={settings.wake_word_enabled === 'true' ? 'Enabled · local-only' : 'Disabled'}
        />
        <p className="text-xs text-jarvis-muted leading-relaxed">
          Set WAKE_WORD_ENABLED=true in the backend .env file and restart. The optional local detector
          requires openWakeWord, sounddevice, and its first-run model download. Push-to-talk remains available.
        </p>
      </Section>

      {/* Appearance */}
      <Section title="Visual & HUD Effects">
        <SettingRow label="Fluid Animations" value="">
          <Toggle
            value={settings.animations_enabled !== 'false'}
            onChange={v => onUpdate('animations_enabled', String(v))}
          />
        </SettingRow>
        <SettingRow label="Holographic Scan Lines" value="">
          <Toggle
            value={settings.scan_lines !== 'false'}
            onChange={v => onUpdate('scan_lines', String(v))}
          />
        </SettingRow>
        <SettingRow label="Cyber Ambient Particles" value="">
          <Toggle
            value={settings.particles !== 'false'}
            onChange={v => onUpdate('particles', String(v))}
          />
        </SettingRow>
      </Section>

      {/* Security */}
      <Section title="Safety & Permissions">
        <SettingRow label="Confirm Consequential Actions" value="">
          <Toggle
            value={settings.confirm_dangerous !== 'false'}
            onChange={v => onUpdate('confirm_dangerous', String(v))}
          />
        </SettingRow>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel p-4">
      <h3 className="text-xs font-mono text-jarvis-muted tracking-wider mb-4 pb-2 border-b border-jarvis-border">{title.toUpperCase()}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-jarvis-text">{label}</span>
      <div className="flex items-center gap-2">
        {children || <span className="text-sm text-jarvis-muted font-mono">{value}</span>}
      </div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-10 h-5 rounded-full transition-all duration-300 relative ${
        value ? 'bg-jarvis-cyan/30 border border-jarvis-cyan/50' : 'bg-white/10 border border-jarvis-border'
      }`}
    >
      <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 ${
        value ? 'left-5 bg-jarvis-cyan shadow-glow-cyan' : 'left-0.5 bg-jarvis-muted'
      }`} />
    </button>
  );
}
