import { useState, useEffect } from 'react';
import { Wifi, WifiOff, Settings, Minus, Square, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TopBarProps {
  connected: boolean;
  aiAvailable: boolean;
  aiModel: string;
}

export default function TopBar({ connected, aiAvailable, aiModel }: TopBarProps) {
  const [time, setTime] = useState(new Date());
  const navigate = useNavigate();
  const isElectron = !!(window as any).electronAPI?.isElectron;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const handleMinimize = () => (window as any).electronAPI?.minimizeWindow();
  const handleMaximize = () => (window as any).electronAPI?.maximizeWindow();
  const handleClose = () => (window as any).electronAPI?.closeWindow();

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-jarvis-border bg-jarvis-bg/80 backdrop-blur-xl select-none"
      style={{ WebkitAppRegion: 'drag' } as any}>
      {/* Left: Brand */}
      <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <div className="w-2 h-2 rounded-full bg-jarvis-cyan shadow-glow-cyan animate-pulse" />
          <span className="text-sm font-semibold tracking-[0.2em] text-jarvis-cyan text-glow-cyan">
            J.A.R.V.I.S
          </span>
        </div>

        <div className="h-4 w-px bg-jarvis-border" />

        <div className="flex items-center gap-1.5">
          {connected ? (
            <><Wifi size={12} className="text-jarvis-success" /><span className="text-[10px] text-jarvis-success">ONLINE</span></>
          ) : (
            <><WifiOff size={12} className="text-jarvis-error" /><span className="text-[10px] text-jarvis-error">OFFLINE</span></>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${aiAvailable ? 'bg-jarvis-success' : 'bg-jarvis-warning'}`} />
          <span className="text-[10px] text-jarvis-muted">{aiModel}</span>
        </div>
      </div>

      {/* Right: Time & Controls */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <span className="text-xs text-jarvis-muted font-mono">
          {time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {' '}
          {time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>

        <button onClick={() => navigate('/settings')} className="p-1.5 hover:bg-white/5 rounded transition-colors">
          <Settings size={14} className="text-jarvis-muted hover:text-jarvis-text" />
        </button>

        {isElectron && (
          <div className="flex items-center gap-1 ml-2">
            <button onClick={handleMinimize} className="p-1.5 hover:bg-white/10 rounded transition-colors">
              <Minus size={12} className="text-jarvis-muted" />
            </button>
            <button onClick={handleMaximize} className="p-1.5 hover:bg-white/10 rounded transition-colors">
              <Square size={10} className="text-jarvis-muted" />
            </button>
            <button onClick={handleClose} className="p-1.5 hover:bg-red-500/20 rounded transition-colors group">
              <X size={12} className="text-jarvis-muted group-hover:text-jarvis-error" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

