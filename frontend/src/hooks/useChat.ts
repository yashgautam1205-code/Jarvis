import { useState, useCallback, useRef, useEffect } from 'react';
import type { Message, AIState } from '../types';
import API_BASE from '../services/apiBase';

interface PendingMusicClarification {
  query: string;
  service: 'youtube' | 'spotify';
  startedAt: number;
}

function spotifyUrlFromCommand(content: string): string | null {
  if (!/\bopen\b/i.test(content)) return null;
  const match = content.match(/https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:track|playlist)\/[A-Za-z0-9]+(?:[?#][^\s]*)?/i);
  return match?.[0].replace(/[),.!?]+$/, '') || null;
}

function spotifySearchQueryFromCommand(content: string): string | null {
  if (/\byoutube\b/i.test(content)) return null;
  const match = content.match(/^\s*(?:please\s+)?(?:play|start|put on)\s+(.+?)\s*[.!?]*$/i);
  if (!match) return null;
  const query = match[1]
    .replace(/^(?:on|from)\s+spotify(?:\s+desktop)?\s*$/i, '')
    .replace(/\s+(?:on|from)\s+spotify(?:\s+desktop)?\s*$/i, '')
    .replace(/^(?:(?:the|a)\s+)?(?:song|track|music)(?:\s+(?:called|named|titled))?\s+/i, '')
    .replace(/\s+(?:song|track|music)$/i, '')
    .trim();
  return query && !/^(?:spotify|spotify desktop|music|a song|some music)$/i.test(query)
    ? query
    : null;
}

async function openSpotifySearch(query: string): Promise<string> {
  if (!window.electronAPI?.searchSpotifyDesktop) {
    return `Spotify desktop search is available in the JARVIS Windows app. Search for “${query}” in Spotify manually. Playback is not confirmed.`;
  }
  try {
    const result = await window.electronAPI.searchSpotifyDesktop(query);
    return result.opened
      ? result.message || `Opened Spotify search results for “${query}”. Playback is not confirmed.`
      : `${result.error || 'Could not open Spotify search.'} Playback is not confirmed.`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown desktop bridge error.';
    return `Could not open Spotify search: ${detail}. Playback is not confirmed.`;
  }
}

async function launchSpotifyFromCommand(content: string): Promise<string | null> {
  if (!/^\s*(?:please\s+)?(?:launch|open|start)\s+(?:the\s+)?spotify(?:\s+(?:desktop|app))?\s*[.!?]*$/i.test(content)) {
    return null;
  }
  if (!window.electronAPI?.launchSpotifyDesktop) {
    return 'Launching Spotify desktop is available in the JARVIS Windows app.';
  }
  try {
    const result = await window.electronAPI.launchSpotifyDesktop();
    return result.success
      ? result.message || 'Sent the Spotify desktop launch request. The app launch is not verified.'
      : result.error || 'Could not launch Spotify desktop.';
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown desktop bridge error.';
    return `Could not launch Spotify desktop: ${detail}.`;
  }
}

async function handleSpotifyDesktopCommand(content: string): Promise<string | null> {
  const linkMessage = await openSpotifyLinkFromCommand(content);
  if (linkMessage) return linkMessage;
  const launchMessage = await launchSpotifyFromCommand(content);
  if (launchMessage) return launchMessage;
  const query = spotifySearchQueryFromCommand(content);
  if (query) return openSpotifySearch(query);
  if (/\byoutube\b/i.test(content)) return null;
  const action = mediaActionFromCommand(content);
  const spotifyPlayCommand = action === 'play'
    && /\bspotify\b/i.test(content)
    && /^(?:please\s+)?play\s+(?:spotify|spotify\s+desktop|music\s+on\s+spotify)\s*[.!?]*$/i.test(content.trim());
  if (!spotifyPlayCommand) return null;
  if (!window.electronAPI?.controlSpotifyMedia) {
    return 'Spotify media controls are available in the JARVIS Windows desktop app.';
  }
  try {
    const result = await window.electronAPI.controlSpotifyMedia(action);
    return result.success
      ? result.message || `Sent the Windows ${action} media command. Playback is not confirmed.`
      : result.error || `Could not send the Windows ${action} media command.`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown desktop bridge error.';
    return `Could not send the Windows media command: ${detail}.`;
  }
}

async function openSpotifyLinkFromCommand(content: string): Promise<string | null> {
  const url = spotifyUrlFromCommand(content);
  if (!url) return null;
  const fallbackLink = `[Open Spotify link](${url})`;
  if (!window.electronAPI?.openSpotifyUrl) {
    return `This page cannot open a native Spotify link. ${fallbackLink}`;
  }
  try {
    const result = await window.electronAPI.openSpotifyUrl(url);
    return result.opened
      ? `${result.message || 'Opened the Spotify link.'} Playback is not confirmed.`
      : `${result.error || 'Could not open the Spotify link.'} ${fallbackLink}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown desktop bridge error.';
    return `Could not open the Spotify link: ${detail}. ${fallbackLink}`;
  }
}

function mediaActionFromCommand(content: string): 'play' | 'pause' | 'resume' | 'next' | 'previous' | null {
  if (/\b(?:previous|prev|back)(?:\s+(?:track|song))?\b/i.test(content)) return 'previous';
  if (/\b(?:next|skip)(?:\s+(?:track|song|to\s+next))?\b/i.test(content)) return 'next';
  if (/\bpause\b/i.test(content)) return 'pause';
  if (/\b(?:resume|continue|unpause)\b/i.test(content)) return 'resume';
  if (/\b(?:play|start|put on)\b/i.test(content)) return 'play';
  return null;
}

async function completeWindowsMediaFallback(
  toolResult: unknown,
  content: string,
): Promise<string | null> {
  if (!toolResult || typeof toolResult !== 'object' || !('success' in toolResult) || toolResult.success !== false) {
    return null;
  }
  const action = mediaActionFromCommand(content);
  if (!action || !window.electronAPI?.controlSpotifyMedia) return null;
  try {
    const result = await window.electronAPI.controlSpotifyMedia(action);
    return result.success
      ? `${result.message || 'Sent the Windows media command.'} Playback is not confirmed.`
      : `The Windows media-session command failed. ${result.error || 'Spotify did not accept the fallback command.'}`;
  } catch (error) {
    console.error('[useChat] Windows Spotify media fallback failed:', error);
    return null;
  }
}

function prepareMusicFollowup(
  content: string,
  pending: { current: PendingMusicClarification | null },
): string {
  const text = content.trim();
  const request = pending.current;
  if (!request) return text;
  pending.current = null;
  if (Date.now() - request.startedAt > 120_000
    || /\b(?:play|start|put on)\b/i.test(text)
    || /^(?:no|none|cancel|stop|never mind)$/i.test(text)) {
    return text;
  }
  return `play ${request.query} ${text} on ${request.service}`;
}

async function completeMusicRequest(
  toolResults: unknown,
  onClarification: (query: string, service: 'youtube' | 'spotify') => void,
): Promise<string | null> {
  if (!Array.isArray(toolResults)) return null;
  const entry = toolResults.find(item => (
    item?.name === 'search_music'
    && item?.result?.success
    && ['youtube', 'spotify'].includes(item?.result?.result?.service)
  ));
  const media = entry?.result?.result;
  if (!media?.query) return null;

  if (media.service === 'spotify') {
    if (media.status !== 'open_search') return null;
    return openSpotifySearch(media.query);
  }

  if (media.status !== 'pending_browser_playback') return null;
  let playback;
  try {
    if (window.electronAPI?.playYouTubeQuery) {
      playback = await window.electronAPI.playYouTubeQuery(media.query);
    } else {
      const searchWindow = window.open(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(media.query)}`,
        '_blank',
      );
      if (searchWindow) searchWindow.opener = null;
      playback = {
        playing: false,
        error: 'This browser opened the search page but cannot verify automatic playback. Use the JARVIS desktop app.',
      };
    }
  } catch (error) {
    console.error('[useChat] YouTube playback request failed:', error);
    playback = { playing: false, error: 'The JARVIS YouTube player could not be started.' };
  }

  if (playback.ambiguous && playback.candidates?.length) {
    onClarification(media.query, 'youtube');
    const candidates = playback.candidates
      .map(candidate => [candidate.title, candidate.artist].filter(Boolean).join(' by '))
      .join('; ');
    return `${playback.error} Possible matches: ${candidates}.`;
  }
  const title = playback.title || media.query;
  const artist = playback.artist;
  const description = artist ? `${title} by ${artist}` : title;
  return playback.playing
    ? `Now playing “${description}” on YouTube.`
    : `I tried to play “${media.query}” on YouTube, but playback was not confirmed. ${playback.error || 'Check the player window.'}`;
}

function cleanTextForSpeech(text: string): string {
  if (!text) return '';
  return text
    // Replace code blocks with concise spoken notice
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    // Remove inline backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove markdown bold / italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove links [name](url) -> name
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove raw URLs
    .replace(/https?:\/\/\S+/g, 'link')
    // Remove bullet points / dashes
    .replace(/^\s*[-*+]\s+/gm, '')
    // Remove blockquote markers
    .replace(/^\s*>\s+/gm, '')
    // Replace multiple whitespace/newlines with a single space
    .replace(/\s+/g, ' ')
    .trim();
}

// Split text into conversational sentences to avoid Chromium 15s TTS pause bug
function splitIntoSentences(text: string): string[] {
  const matched = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!matched) return [text];
  return matched.map(s => s.trim()).filter(Boolean);
}

// Find a sweet, clear, natural female assistant voice (Microsoft Zira / Jenny / Aria / Hazel / etc.)
function findSweetFemaleVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null;

  // Prioritize premier Windows / modern browser female voices
  const femalePatterns = [
    /zira/i,              // "Microsoft Zira - English (United States)" (Default Windows female)
    /jenny/i,             // "Microsoft Jenny" (Neural sweet female)
    /aria/i,              // "Microsoft Aria" (Neural female)
    /hazel/i,             // "Microsoft Hazel" (UK female)
    /susan/i,             // "Microsoft Susan"
    /catherine/i,         // "Microsoft Catherine"
    /sonia/i,             // "Microsoft Sonia"
    /libby/i,             // "Microsoft Libby"
    /samantha/i,          // macOS standard female
    /victoria/i,          // macOS female
    /karen/i,             // Australian female
    /google.*female/i,
    /en-us.*female/i,
    /en-gb.*female/i,
    /female/i,
  ];

  for (const pattern of femalePatterns) {
    const found = voices.find(v => pattern.test(v.name) || pattern.test(v.voiceURI));
    if (found) return found;
  }

  // Fallback: any English voice not explicitly named male
  const english = voices.filter(v => v.lang.startsWith('en'));
  const fallbackFemale = english.find(v => !/male|david|george|mark|guy|richard|james|paul/i.test(v.name));
  return fallbackFemale || english[0] || voices[0];
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [aiState, setAiState] = useState<AIState>('idle');
  const [demoMode, setDemoMode] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestInFlightRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const speechQueueRef = useRef<string[]>([]);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const speechGenerationRef = useRef(0);
  const pendingMusicClarificationRef = useRef<PendingMusicClarification | null>(null);

  // Pre-load voices immediately on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        selectedVoiceRef.current = findSweetFemaleVoice(voices);
      }
    };

    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Speak queue processor
  const processSpeechQueue = useCallback((generation: number = speechGenerationRef.current) => {
    if (generation !== speechGenerationRef.current) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (speechQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      setAiState('idle');
      return;
    }

    const sentence = speechQueueRef.current.shift()!;
    isSpeakingRef.current = true;
    setAiState('speaking');

    const utterance = new SpeechSynthesisUtterance(sentence);

    // Pick sweet female voice
    const voices = window.speechSynthesis.getVoices();
    const voice = selectedVoiceRef.current || findSweetFemaleVoice(voices);
    if (voice) {
      utterance.voice = voice;
    }

    // Sweet female voice calibration
    utterance.rate = 1.0;
    utterance.pitch = 1.1;

    utterance.onend = () => {
      processSpeechQueue(generation);
    };

    utterance.onerror = (e) => {
      console.debug('[useChat] Utterance error note:', e);
      processSpeechQueue(generation);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const cancelSpeech = useCallback(() => {
    speechGenerationRef.current += 1;
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    speechQueueRef.current = [];
    isSpeakingRef.current = false;
  }, []);

  const playPiperAudio = useCallback(async (text: string, controller: AbortController) => {
    const { signal } = controller;
    setAiState('speaking');
    const synthesisTimeout = setTimeout(
      () => controller.abort(new DOMException('Piper synthesis timed out.', 'TimeoutError')),
      35_000,
    );
    let response: Response;
    try {
      response = await fetch(`${API_BASE}/voice/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      });
    } finally {
      clearTimeout(synthesisTimeout);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.detail || `Piper returned HTTP ${response.status}.`);
    }

    const blob = await response.blob();
    if (signal.aborted) {
      throw signal.reason || new DOMException('Speech cancelled.', 'AbortError');
    }
    if (!blob.size || !blob.type.startsWith('audio/')) {
      throw new Error('Piper returned an empty or invalid audio response.');
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audioUrlRef.current = url;
    audioRef.current = audio;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Piper audio playback timed out.')),
          120_000,
        );
        const cleanup = () => {
          clearTimeout(timeout);
          signal.removeEventListener('abort', onAbort);
          audio.onended = null;
          audio.onerror = null;
        };
        const onAbort = () => {
          cleanup();
          reject(signal.reason || new DOMException('Speech cancelled.', 'AbortError'));
        };
        audio.onended = () => {
          cleanup();
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          reject(new Error('Piper audio could not be played.'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        void audio.play().catch(error => {
          cleanup();
          reject(error);
        });
      });
    } finally {
      if (audioRef.current === audio) audioRef.current = null;
      if (audioUrlRef.current === url) {
        URL.revokeObjectURL(url);
        audioUrlRef.current = null;
      }
    }
  }, []);

  // Prefer Piper when configured, with browser speech as a local fallback.
  const speakAloud = useCallback((rawText: string) => {
    const clean = cleanTextForSpeech(rawText);
    if (!clean) return;

    cancelSpeech();
    const generation = speechGenerationRef.current;
    const controller = new AbortController();
    speechAbortRef.current = controller;

    void (async () => {
      try {
        await playPiperAudio(clean, controller);
        if (generation === speechGenerationRef.current) setAiState('idle');
      } catch (error) {
        if (generation !== speechGenerationRef.current) return;
        if (controller.signal.aborted) {
          if ((controller.signal.reason as Error | undefined)?.name === 'TimeoutError') {
            console.warn('[useChat] Piper synthesis timed out; using browser speech:', error);
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
              speechQueueRef.current = splitIntoSentences(clean);
              processSpeechQueue(generation);
            } else {
              setAiState('idle');
            }
          }
          return;
        }
        console.warn('[useChat] Piper playback unavailable; using browser speech:', error);
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          speechQueueRef.current = splitIntoSentences(clean);
          processSpeechQueue(generation);
        } else {
          setAiState('idle');
        }
      } finally {
        if (speechAbortRef.current === controller) speechAbortRef.current = null;
      }
    })();
  }, [cancelSpeech, playPiperAudio, processSpeechQueue]);

  useEffect(() => () => {
    abortRef.current?.abort();
    cancelSpeech();
  }, [cancelSpeech]);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const requestMessage = prepareMusicFollowup(content, pendingMusicClarificationRef);

    cancelSpeech();

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setAiState('thinking');

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(
      () => controller.abort(new DOMException('Chat request timed out.', 'TimeoutError')),
      120_000,
    );
    try {
      const spotifyLinkMessage = await handleSpotifyDesktopCommand(content);
      if (spotifyLinkMessage) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: spotifyLinkMessage,
          timestamp: new Date().toISOString(),
        }]);
        speakAloud(spotifyLinkMessage);
        return;
      }

      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: requestMessage,
          conversation_id: conversationId,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Chat service returned HTTP ${response.status}.`);

      const data = await response.json();
      setConversationId(data.conversation_id);
      setDemoMode(data.demo_mode || false);

      let replyContent = data.message?.content || 'Standing by.';
      const mediaControlResult = data.tool_results?.find((item: { name?: string }) => item.name === 'control_media')?.result;
      replyContent = await completeWindowsMediaFallback(mediaControlResult, content) || replyContent;
      replyContent = await completeMusicRequest(
        data.tool_results,
        (query, service) => { pendingMusicClarificationRef.current = { query, service, startedAt: Date.now() }; },
      ) || replyContent;
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: replyContent,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Speak response aloud in sweet female voice
      speakAloud(replyContent);
    } catch (error) {
      if (controller.signal.aborted) {
        if ((error as Error).name === 'TimeoutError') {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: 'The request timed out. Please try again.',
            timestamp: new Date().toISOString(),
            error: true,
          }]);
        }
        return;
      }
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I am experiencing a communication fault. Please ensure the backend server is active.`,
        timestamp: new Date().toISOString(),
        error: true,
      };
      setMessages(prev => [...prev, errorMsg]);
      setAiState('error');
      speakAloud("I am experiencing a communication fault. Please ensure the backend server is active.");
    } finally {
      clearTimeout(timeout);
      requestInFlightRef.current = false;
      if (abortRef.current === controller) {
        abortRef.current = null;
        if (!isSpeakingRef.current && !speechAbortRef.current) setAiState('idle');
      }
    }
  }, [cancelSpeech, conversationId, speakAloud]);

  const streamMessage = useCallback(async (content: string) => {
    if (!content.trim() || requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const requestMessage = prepareMusicFollowup(content, pendingMusicClarificationRef);

    cancelSpeech();

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setAiState('thinking');

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    }]);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(
      () => controller.abort(new DOMException('Chat request timed out.', 'TimeoutError')),
      120_000,
    );
    try {
      const spotifyLinkMessage = await handleSpotifyDesktopCommand(content);
      if (spotifyLinkMessage) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: spotifyLinkMessage, isStreaming: false }
            : m
        ));
        speakAloud(spotifyLinkMessage);
        return;
      }

      const response = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: requestMessage,
          conversation_id: conversationId,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let eventBuffer = '';
      let mediaPayload: { service?: string; status?: string; query?: string } | null = null;
      let mediaControlResult: unknown = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        eventBuffer += decoder.decode(value, { stream: true });
        const lines = eventBuffer.split('\n');
        eventBuffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.type === 'start' && parsed.conversation_id) {
              setConversationId(parsed.conversation_id);
            } else if (parsed.type === 'demo_mode') {
              setDemoMode(Boolean(parsed.demo_mode));
            } else if (parsed.type === 'sources' && Array.isArray(parsed.sources)) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, sources: parsed.sources } : m
              ));
            } else if (parsed.type === 'media') {
              mediaPayload = parsed.media;
            } else if (parsed.type === 'media_control') {
              mediaControlResult = parsed.result;
            } else if (parsed.type === 'delta' && parsed.content) {
              fullContent += parsed.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: m.content + parsed.content }
                  : m
              ));
            } else if (parsed.type === 'error') {
              throw new Error(parsed.error || 'Chat stream failed.');
            }
          } catch (error) {
            if (error instanceof Error && error.message !== 'Unexpected end of JSON input') {
              throw error;
            }
          }
        }
      }

      fullContent = await completeWindowsMediaFallback(mediaControlResult, content) || fullContent;
      if (mediaPayload && ['youtube', 'spotify'].includes(mediaPayload.service || '')) {
        try {
          const playbackMessage = await completeMusicRequest([{
            name: 'search_music',
            result: { success: true, result: mediaPayload },
          }], (query, service) => {
            pendingMusicClarificationRef.current = { query, service, startedAt: Date.now() };
          });
          if (playbackMessage) fullContent = playbackMessage;
        } catch (error) {
          console.error('[useChat] Music playback request failed:', error);
          fullContent = 'The music player could not be started, so playback was not confirmed.';
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: fullContent || m.content, isStreaming: false } : m
      ));

      // Speak response aloud in sweet female voice
      speakAloud(fullContent);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false, content: m.content + '\n\n*[Stopped]*' }
            : m
        ));
      } else {
        const errText = 'Connection fault. Please verify the backend is running.';
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false, content: errText, error: true }
            : m
        ));
        speakAloud(errText);
      }
      setAiState('idle');
    } finally {
      clearTimeout(timeout);
      requestInFlightRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [cancelSpeech, conversationId, speakAloud]);

  const stopGeneration = useCallback(() => {
    const activeRequest = abortRef.current;
    abortRef.current = null;
    activeRequest?.abort();
    cancelSpeech();
    setAiState('idle');
  }, [cancelSpeech]);

  const clearChat = useCallback(() => {
    const activeRequest = abortRef.current;
    abortRef.current = null;
    activeRequest?.abort();
    cancelSpeech();
    pendingMusicClarificationRef.current = null;
    setMessages([]);
    setConversationId(null);
    setAiState('idle');
  }, [cancelSpeech]);

  return {
    messages,
    conversationId,
    aiState,
    demoMode,
    sendMessage,
    streamMessage,
    stopGeneration,
    clearChat,
    setAiState,
    speakAloud,
  };
}
