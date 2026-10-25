import { useState, useEffect, useCallback, useRef } from 'react';
import { apiUrl } from '../services/apiBase';

interface Metrics {
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
}

const defaultMetrics: Metrics = {
  cpu: 0, memory: 0, memoryUsedGB: 0, memoryTotalGB: 0,
  disk: 0, battery: null, batteryCharging: false,
  networkSent: 0, networkRecv: 0, uptime: '--',
};

export function useSystemMetrics(interval = 3000) {
  const [metrics, setMetrics] = useState<Metrics>(defaultMetrics);
  const [connected, setConnected] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('system/metrics'));
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();

      const disk = data.disk?.[0] || {};
      setMetrics({
        cpu: data.cpu?.percent ?? 0,
        memory: data.memory?.percent ?? 0,
        memoryUsedGB: data.memory?.used_gb ?? 0,
        memoryTotalGB: data.memory?.total_gb ?? 0,
        disk: disk.percent ?? 0,
        battery: data.battery?.percent ?? null,
        batteryCharging: data.battery?.power_plugged ?? false,
        networkSent: data.network?.bytes_sent_mb ?? 0,
        networkRecv: data.network?.bytes_recv_mb ?? 0,
        uptime: formatUptime(data.boot_time),
      });
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();
    timerRef.current = setInterval(fetchMetrics, interval);
    return () => clearInterval(timerRef.current);
  }, [fetchMetrics, interval]);

  return { metrics, connected };
}

function formatUptime(bootIso?: string): string {
  if (!bootIso) return '--';
  try {
    const boot = new Date(bootIso).getTime();
    const now = Date.now();
    const s = Math.floor((now - boot) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  } catch {
    return '--';
  }
}
