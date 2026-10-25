import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import ConversationsPage from './pages/ConversationsPage';
import AutomationPage from './pages/AutomationPage';
import MemoryPage from './pages/MemoryPage';
import SystemMonitorPage from './pages/SystemMonitorPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <BrowserRouter>
      <BackendStatusNotice />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/conversations" element={<ConversationsPage />} />
        <Route path="/automation" element={<AutomationPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/system" element={<SystemMonitorPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function BackendStatusNotice() {
  const [failure, setFailure] = useState<{ error: string; setup: string } | null>(null);

  useEffect(() => {
    const electronAPI = window.electronAPI;
    if (!electronAPI?.onBackendStatus) return;
    return electronAPI.onBackendStatus(status => {
      setFailure(status.state === 'error'
        ? {
          error: status.error || 'Backend startup failed.',
          setup: status.setup || 'Check the backend environment and restart JARVIS.',
        }
        : null);
    });
  }, []);

  if (!failure) return null;
  return (
    <div role="alert" className="fixed top-12 left-1/2 z-50 -translate-x-1/2 max-w-2xl rounded-lg border border-jarvis-error/50 bg-jarvis-bg p-4 text-sm text-jarvis-text shadow-xl">
      <p className="font-semibold text-jarvis-error">JARVIS backend did not start</p>
      <p className="mt-1">{failure.error}</p>
      <p className="mt-1 text-xs text-jarvis-muted">{failure.setup}</p>
    </div>
  );
}
