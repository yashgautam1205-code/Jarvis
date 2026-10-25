import type { WSEvent, WSEventType } from '../types';
import { websocketOriginUrl } from './apiBase';

type WSCallback = (event: WSEvent) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private listeners: Map<WSEventType | '*', Set<WSCallback>> = new Map();
  private isManualClose = false;

  constructor(url: string = websocketOriginUrl('ws')) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.isManualClose = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectDelay = 1000;
        this.emit({
          type: 'connected',
          data: null,
          timestamp: new Date().toISOString(),
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent;
          this.emit(data);
        } catch {
          console.warn('[WS] Failed to parse message:', event.data);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this.emit({
          type: 'disconnected',
          data: null,
          timestamp: new Date().toISOString(),
        });

        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        this.emit({
          type: 'error',
          data: { error: 'WebSocket error' },
          timestamp: new Date().toISOString(),
        });
      };
    } catch (error) {
      console.error('[WS] Connection failed:', error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.isManualClose = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) return;

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms...`);
      this.connect();
    }, this.reconnectDelay);
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WS] Not connected, cannot send');
    }
  }

  on(type: WSEventType | '*', callback: WSCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      this.listeners.get(type)?.delete(callback);
    };
  }

  off(type: WSEventType | '*', callback: WSCallback): void {
    this.listeners.get(type)?.delete(callback);
  }

  private emit(event: WSEvent): void {
    this.listeners.get(event.type)?.forEach((cb) => cb(event));
    this.listeners.get('*')?.forEach((cb) => cb(event));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
export default wsService;
