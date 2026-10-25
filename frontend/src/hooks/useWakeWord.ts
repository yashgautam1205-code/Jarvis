import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIState } from '../types';
import API_BASE, { websocketUrl as buildWebsocketUrl } from '../services/apiBase';

interface WakeWordStatus {
  enabled: boolean;
  state: 'disabled' | 'starting' | 'active' | 'unavailable';
  model: string;
  local_audio_only: boolean;
  error: string | null;
}

interface Options {
  aiState: AIState;
  onWake: () => void;
}

export function useWakeWord({ aiState, onWake }: Options) {
  const [status, setStatus] = useState<WakeWordStatus | null>(null);
  const onWakeRef = useRef(onWake);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/voice/wake-word/status`);
      if (!response.ok) throw new Error(`Wake-word status returned HTTP ${response.status}.`);
      setStatus(await response.json());
    } catch (error) {
      setStatus({
        enabled: false,
        state: 'unavailable',
        model: 'hey_jarvis',
        local_audio_only: true,
        error: error instanceof Error ? error.message : 'Wake-word status is unavailable.',
      });
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (status && status.state !== 'starting' && status.state !== 'unavailable') return;
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, status?.state]);

  useEffect(() => {
    if (!status?.enabled || status.state !== 'active') return;
    const socket = new WebSocket(buildWebsocketUrl('api/voice/wake-word/events'));
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'wake_detected') onWakeRef.current();
      } catch {
        console.warn('[useWakeWord] Ignored invalid wake-word event.');
      }
    };
    socket.onerror = () => {
      console.warn('[useWakeWord] Wake-word event connection failed.');
    };
    return () => socket.close();
  }, [status?.enabled, status?.state]);

  useEffect(() => {
    if (!status?.enabled) return;
    void fetch(`${API_BASE}/voice/wake-word/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: aiState !== 'idle' }),
    }).catch(error => {
      console.warn('[useWakeWord] Could not update local detector suspension:', error);
    });
  }, [aiState, status?.enabled]);

  return {
    wakeWordStatus: status,
    wakeWordActive: status?.enabled === true && status.state === 'active',
  };
}
