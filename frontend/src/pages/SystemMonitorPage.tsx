import TopBar from '../components/TopBar';
import Sidebar from '../components/Sidebar';
import GridBackground from '../components/GridBackground';
import GaugeRing from '../components/GaugeRing';
import { useSystemMetrics } from '../hooks/useSystemMetrics';
import { useSettings } from '../hooks/useSettings';
import { Cpu, MemoryStick, HardDrive, Wifi, Battery, Clock, Activity } from 'lucide-react';

export default function SystemMonitorPage() {
  const { metrics, connected } = useSystemMetrics(2000);
  const { settings } = useSettings();

  return (
    <div className="flex flex-col h-screen bg-jarvis-bg overflow-hidden relative">
      <GridBackground />
      <TopBar connected={connected} aiAvailable={settings.ai_available} aiModel={settings.ai_model} />
      <div className="flex flex-1 overflow-hidden relative z-10">
        <Sidebar />
        <div className="flex-1 p-6 overflow-y-auto scrollbar-thin">
          <h1 className="text-lg font-semibold text-jarvis-text mb-1">System Monitor</h1>
          <p className="text-xs text-jarvis-muted mb-6">Real-time system performance metrics</p>

          {/* Main gauges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div className="glass-panel p-6 flex flex-col items-center">
              <GaugeRing value={metrics.cpu} size={120} strokeWidth={6} label="CPU Usage" />
            </div>
            <div className="glass-panel p-6 flex flex-col items-center">
              <GaugeRing value={metrics.memory} size={120} strokeWidth={6} label="RAM Usage" />
            </div>
            <div className="glass-panel p-6 flex flex-col items-center">
              <GaugeRing value={metrics.disk} size={120} strokeWidth={6} label="Disk Usage" />
            </div>
            <div className="glass-panel p-6 flex flex-col items-center">
              <GaugeRing
                value={metrics.battery ?? 0}
                size={120} strokeWidth={6}
                label={metrics.battery !== null ? (metrics.batteryCharging ? 'Charging' : 'Battery') : 'AC Power'}
                color="#00FF88"
              />
            </div>
          </div>

          {/* Detail cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DetailCard icon={Cpu} title="CPU" items={[
              { label: 'Usage', value: `${metrics.cpu.toFixed(1)}%` },
            ]} />
            <DetailCard icon={MemoryStick} title="Memory" items={[
              { label: 'Used', value: `${metrics.memoryUsedGB} GB` },
              { label: 'Total', value: `${metrics.memoryTotalGB} GB` },
              { label: 'Usage', value: `${metrics.memory.toFixed(1)}%` },
            ]} />
            <DetailCard icon={HardDrive} title="Storage" items={[
              { label: 'Usage', value: `${metrics.disk.toFixed(1)}%` },
            ]} />
            <DetailCard icon={Wifi} title="Network" items={[
              { label: 'Sent', value: `${metrics.networkSent} MB` },
              { label: 'Received', value: `${metrics.networkRecv} MB` },
              { label: 'Status', value: connected ? 'Connected' : 'Offline' },
            ]} />
            <DetailCard icon={Battery} title="Battery" items={[
              { label: 'Level', value: metrics.battery !== null ? `${metrics.battery}%` : 'N/A' },
              { label: 'Charging', value: metrics.batteryCharging ? 'Yes' : 'No' },
            ]} />
            <DetailCard icon={Clock} title="System" items={[
              { label: 'Uptime', value: metrics.uptime },
              { label: 'Backend', value: connected ? 'Online' : 'Offline' },
            ]} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailCard({ icon: Icon, title, items }: {
  icon: any; title: string; items: { label: string; value: string }[];
}) {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-jarvis-border">
        <Icon size={14} className="text-jarvis-cyan" />
        <span className="text-xs font-mono text-jarvis-muted tracking-wider">{title.toUpperCase()}</span>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between text-xs">
            <span className="text-jarvis-muted">{item.label}</span>
            <span className="font-mono text-jarvis-text">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
