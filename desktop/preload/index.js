const { contextBridge, ipcRenderer } = require('electron');

/**
 * JARVIS Desktop — Preload Script
 *
 * Exposes a safe, minimal API to the renderer process via contextBridge.
 * No direct Node.js APIs are leaked to the frontend.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ─── Identity ────────────────────────────────────────────────────────
  isElectron: true,
  platform: process.platform,

  // ─── Window Controls ─────────────────────────────────────────────────
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  launchSpotifyDesktop: () => ipcRenderer.invoke('spotify-desktop-launch'),
  searchSpotifyDesktop: (query) => ipcRenderer.invoke('spotify-desktop-search', query),
  getSpotifyDesktopStatus: () => ipcRenderer.invoke('spotify-desktop-status'),
  controlSpotifyMedia: (action) => ipcRenderer.invoke('spotify-desktop-control', action),
  openSpotifyUrl: (url) => ipcRenderer.invoke('spotify-open-url', url),
  playYouTubeQuery: (query) => ipcRenderer.invoke('youtube-play-query', query),

  // ─── System Info ─────────────────────────────────────────────────────
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  onBackendStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('jarvis-backend-status', listener);
    return () => ipcRenderer.removeListener('jarvis-backend-status', listener);
  },
});
