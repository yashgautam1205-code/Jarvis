const API_BASE = typeof window !== 'undefined' && window.location.protocol === 'file:'
  ? 'http://127.0.0.1:8000/api'
  : '/api';

export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, '')}`;
}

export function websocketUrl(path: string): string {
  if (API_BASE.startsWith('http')) {
    return `${API_BASE.replace(/^http/, 'ws')}/${path.replace(/^\/+/, '')}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/${path.replace(/^\/+/, '')}`;
}

export function websocketOriginUrl(path: string): string {
  const origin = window.location.protocol === 'file:'
    ? 'ws://127.0.0.1:8000'
    : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  return `${origin}/${path.replace(/^\/+/, '')}`;
}

export default API_BASE;
