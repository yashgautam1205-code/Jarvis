import { useCallback } from 'react';
import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import AICore from '../components/AICore';
import ChatPanel from '../components/ChatPanel';
import SystemPanel from '../components/SystemPanel';
import CommandBar from '../components/CommandBar';
import TaskPanel from '../components/TaskPanel';
import GridBackground from '../components/GridBackground';
import ParticleField from '../components/ParticleField';
import DemoModeBanner from '../components/DemoModeBanner';
import { useChat } from '../hooks/useChat';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { useSettings } from '../hooks/useSettings';

export default function Dashboard() {
  const {
    messages, aiState, demoMode,
    sendMessage, streamMessage, stopGeneration, clearChat, setAiState,
  } = useChat();
  const { metrics, connected } = useSystemMetrics();
  const { settings } = useSettings();

  const handleTranscript = useCallback((text: string) => {
    streamMessage(text);
  }, [streamMessage]);

  const modelLabel = settings.active_provider === 'ollama'
    ? `Ollama (${settings.ollama_model})`
    : (demoMode ? 'Local AI setup needed' : settings.ai_model);

  return (
    <div className="flex flex-col h-screen bg-jarvis-bg overflow-hidden relative">
      <GridBackground />
      <ParticleField count={20} />

      {/* Top Bar */}
      <TopBar
        connected={connected}
        aiAvailable={settings.ai_available}
        aiModel={modelLabel}
      />

      {demoMode && !settings.ai_available && <DemoModeBanner />}

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chat */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 flex overflow-hidden p-3 gap-3">
              {/* Center: AI Core + Chat */}
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                {/* AI Core Visualization */}
                <div className="flex items-center justify-center py-4">
                  <AICore state={aiState} size={200} />
                </div>

                {/* Chat Panel */}
                <div className="flex-1 min-h-0">
                  <ChatPanel messages={messages} onClear={clearChat} />
                </div>
              </div>

              {/* Right Panels */}
              <div className="w-64 flex-shrink-0 flex flex-col gap-3">
                <div className="flex-1">
                  <SystemPanel metrics={metrics} connected={connected} aiState={aiState} />
                </div>
                <div className="h-48">
                  <TaskPanel tasks={[]} />
                </div>
              </div>
            </div>

            {/* Command Bar */}
            <CommandBar
              onSend={streamMessage}
              onStop={stopGeneration}
              onTranscript={handleTranscript}
              setAiState={setAiState}
              aiState={aiState}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
