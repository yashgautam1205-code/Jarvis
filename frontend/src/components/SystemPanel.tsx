import { Cpu, MemoryStick, HardDrive, Battery, Wifi, Clock } from 'lucide-react';
import GaugeRing from './GaugeRing';

interface Props {
  metrics: {
    cpu: number;
    memory: number;
    memoryUsedGB: number;
    memoryTotalGB: number;
    disk: number;
    battery: number | null;
    batteryCharging: boolean;
    networkSent: number;
    networkRecv: number;
    uptime: string;
  };
  connected: boolean;
  aiState: string;
}

export default function SystemPanel({ metrics, connected, aiState }: Props) {
  return (
    <div className="glass-panel p-4 space-y-5 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-jarvis-muted tracking-wider">SYSTEM</span>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-jarvis-success' : 'bg-jarvis-error'}`} />
          <span className="text-[10px] text-jarvis-muted">{connected ? 'Connected' : 'Offline'}</span>
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 gap-4">
        <GaugeRing value={metrics.cpu} label="CPU" />
        <GaugeRing value={metrics.memory} label="RAM" />
        <GaugeRing value={metrics.disk} label="DISK" />
        {metrics.battery !== null ? (
          <GaugeRing value={metrics.battery} label={metrics.batteryCharging ? 'CHARGING' : 'BATTERY'} color="#00FF88" />
        ) : (
          <GaugeRing value={0} label="AC POWER" color="#62BFFF" unit="" />
        )}
      </div>

      {/* Details */}
      <div className="space-y-2.5 text-xs">
        <InfoRow icon={Cpu} label="CPU" value={`${metrics.cpu.toFixed(1)}%`} />
        <InfoRow icon={MemoryStick} label="RAM" value={`${metrics.memoryUsedGB}/${metrics.memoryTotalGB} GB`} />
        <InfoRow icon={HardDrive} label="Disk" value={`${metrics.disk.toFixed(1)}%`} />
        <InfoRow icon={Battery} label="Battery" value={metrics.battery !== null ? `${metrics.battery}%` : 'N/A'} />
        <InfoRow icon={Wifi} label="Network" value={`↑${metrics.networkSent}MB ↓${metrics.networkRecv}MB`} />
        <InfoRow icon={Clock} label="Uptime" value={metrics.uptime} />
      </div>

      {/* AI Status */}
      <div className="pt-2 border-t border-jarvis-border">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-jarvis-muted">AI STATUS</span>
          <span className={`text-[10px] font-mono tracking-wider ${
            aiState === 'idle' ? 'text-jarvis-success' :
            aiState === 'error' ? 'text-jarvis-error' :
            'text-jarvis-cyan'
          }`}>
            {aiState.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 px-2 rounded bg-white/[0.02]">
      <div className="flex items-center gap-2 text-jarvis-muted">
        <Icon size={12} />
        <span>{label}</span>
      </div>
      <span className="font-mono text-jarvis-text">{value}</span>
    </div>
  );
}

