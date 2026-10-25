import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import GridBackground from '../components/GridBackground';
import SettingsPanel from '../components/SettingsPanel';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { useSettings } from '../hooks/useSettings';

export default function SettingsPage() {
  const { connected } = useSystemMetrics(10000);
  const { settings, error, updateSetting, refreshSettings } = useSettings();

  return (
    <div className="flex flex-col h-screen bg-jarvis-bg overflow-hidden relative">
      <GridBackground />
      <TopBar connected={connected} aiAvailable={!!settings.ai_available} aiModel={settings.active_provider === 'ollama' ? `Ollama (${settings.ollama_model})` : settings.ai_model || 'Local AI'} />
      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />
        <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
          <h1 className="text-lg font-semibold text-jarvis-text mb-1">Settings</h1>
          <p className="text-xs text-jarvis-muted mb-6">Configure JARVIS to your preferences</p>
          <div className="max-w-2xl">
            {error && <p role="alert" className="text-xs text-jarvis-error mb-4">{error}</p>}
            <SettingsPanel settings={settings as any} onUpdate={updateSetting} onRefresh={refreshSettings} />
          </div>
        </div>
      </div>
    </div>
  );
}
