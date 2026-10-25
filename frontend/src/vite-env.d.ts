/// <reference types="vite/client" />

declare module 'lucide-react';
declare module 'react-markdown';

interface Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
  electronAPI?: {
    onBackendStatus?: (callback: (status: {
      state: 'ready' | 'error';
      error?: string;
      setup?: string;
    }) => void) => () => void;
    playYouTubeQuery?: (query: string) => Promise<{
      playing: boolean;
      ambiguous?: boolean;
      candidates?: Array<{ title: string; artist: string }>;
      title?: string;
      artist?: string;
      error?: string;
    }>;
    getSpotifyDesktopStatus?: () => Promise<{
      running: boolean;
      available?: boolean;
      supported: boolean;
      error?: string;
    }>;
    launchSpotifyDesktop?: () => Promise<{
      success: boolean;
      launched: boolean;
      confirmed: boolean;
      message?: string;
      error?: string;
    }>;
    searchSpotifyDesktop?: (query: string) => Promise<{
      success: boolean;
      opened: boolean;
      confirmed: boolean;
      query?: string;
      message?: string;
      error?: string;
    }>;
    controlSpotifyMedia?: (action: 'play' | 'pause' | 'resume' | 'next' | 'previous') => Promise<{
      success: boolean;
      commandSent?: boolean;
      confirmed: boolean;
      message?: string;
      error?: string;
    }>;
    openSpotifyUrl?: (url: string) => Promise<{
      success: boolean;
      opened: boolean;
      confirmed: boolean;
      type?: 'track' | 'playlist';
      url?: string;
      message?: string;
      error?: string;
    }>;
  };
}
