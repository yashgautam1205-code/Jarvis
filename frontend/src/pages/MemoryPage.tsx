import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import GridBackground from '../components/GridBackground';
import MemoryPanel from '../components/MemoryPanel';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { useSettings } from '../hooks/useSettings';

export default function MemoryPage() {
  const { connected } = useSystemMetrics(10000);
  const { settings } = useSettings();
  return (
    <div className="flex flex-col h-screen bg-jarvis-bg overflow-hidden relative">
      <GridBackground />
      <TopBar connected={connected} aiAvailable={settings.ai_available} aiModel={settings.ai_model} />
      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />
        <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
          <h1 className="text-lg font-semibold text-jarvis-text mb-1">Memory</h1>
          <p className="text-xs text-jarvis-muted mb-6">Manage what JARVIS remembers about you</p>
          <MemoryPanel />
        </div>
      </div>
    </div>
  );
}
