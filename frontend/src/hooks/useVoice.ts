import { useState, useCallback, useRef, useEffect } from 'react';
import type { AIState } from '../types';
import API_BASE from '../services/apiBase';

interface UseVoiceOptions {
  onTranscript: (text: string) => void;
  setAiState: (s: AIState) => void;
}

const MAX_LISTENING_MS = 60_000;
const MICROPHONE_TIMEOUT_MS = 20_000;
const TRANSCRIPTION_TIMEOUT_MS = 120_000;

export function useVoice({ onTranscript, setAiState }: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  // Callbacks via refs to prevent effect recreation
  const onTranscriptRef = useRef(onTranscript);
  const setAiStateRef = useRef(setAiState);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    setAiStateRef.current = setAiState;
  });

  const isStartingRef = useRef(false);
  const isListeningRef = useRef(false);
  const isFinalizingRef = useRef(false);
  const operationIdRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const hasSpokenRef = useRef(false);
  const lastSpeechTimeRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxListeningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const lastAudioLevelUpdateRef = useRef(0);
  const audioLevelRef = useRef(0);

  // Clear timers
  const clearTimers = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
    if (maxListeningTimerRef.current) {
      clearTimeout(maxListeningTimerRef.current);
      maxListeningTimerRef.current = null;
    }
    if (statusResetTimerRef.current) {
      clearTimeout(statusResetTimerRef.current);
      statusResetTimerRef.current = null;
    }
  };

  const releaseAudioResources = () => {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch (error) {
        console.debug('[useVoice] Audio processor was already disconnected:', error);
      }
      processorRef.current = null;
    }
    try {
      audioSourceRef.current?.disconnect();
    } catch (error) {
      console.debug('[useVoice] Audio source was already disconnected:', error);
    }
    audioSourceRef.current = null;
    try {
      silentGainRef.current?.disconnect();
    } catch (error) {
      console.debug('[useVoice] Gain node was already disconnected:', error);
    }
    silentGainRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(error => {
        console.warn('[useVoice] Could not close audio context:', error);
      });
    }
  };

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicAvailable(false);
    }
  }, []);

  // Stop listening and finalize transcript
  const stopListening = useCallback(async () => {
    if (!isListeningRef.current || isFinalizingRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);
    clearTimers();
    setAudioLevel(0);
    audioLevelRef.current = 0;

    const capturedChunks = pcmChunksRef.current;
    const sampleRate = audioContextRef.current?.sampleRate || 44100;
    releaseAudioResources();
    isFinalizingRef.current = true;
    setIsTranscribing(true);
    setAiStateRef.current('thinking');
    let submitted = false;
    let failed = false;
    try {
      if (capturedChunks.length > 0 && hasSpokenRef.current) {
        setTranscript('Transcribing voice...');
        const wavBlob = encodePcmToWav(capturedChunks, sampleRate);
        const formData = new FormData();
        formData.append('file', wavBlob, 'audio.wav');

        const controller = new AbortController();
        transcriptionAbortRef.current = controller;
        const timeout = setTimeout(
          () => controller.abort(new DOMException('Transcription timed out.', 'TimeoutError')),
          TRANSCRIPTION_TIMEOUT_MS,
        );
        try {
          const response = await fetch(`${API_BASE}/voice/transcribe`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          });
          if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.detail || `Transcription service returned HTTP ${response.status}.`);
          }
          const data = await response.json();
          const text = typeof data.text === 'string' ? data.text.trim() : '';
          if (data.success && text) {
            onTranscriptRef.current(text);
            submitted = true;
            setTranscript('');
          } else {
            setTranscript('No clear speech detected.');
            statusResetTimerRef.current = setTimeout(() => setTranscript(''), 2500);
          }
        } finally {
          clearTimeout(timeout);
          if (transcriptionAbortRef.current === controller) {
            transcriptionAbortRef.current = null;
          }
        }
      } else {
        setTranscript('');
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
        if ((error as Error).name === 'TimeoutError') {
          failed = true;
          console.error('[useVoice] Transcription request timed out:', error);
          setTranscript('Transcription timed out. Please try again.');
          setAiStateRef.current('error');
          statusResetTimerRef.current = setTimeout(() => {
            setTranscript('');
            setAiStateRef.current('idle');
          }, 3000);
        }
      } else {
        failed = true;
        console.error('[useVoice] Backend transcription failed:', error);
        setTranscript('Transcription failed. Check the backend and try again.');
        setAiStateRef.current('error');
        statusResetTimerRef.current = setTimeout(() => {
          setTranscript('');
          setAiStateRef.current('idle');
        }, 3000);
      }
    } finally {
      pcmChunksRef.current = [];
      isFinalizingRef.current = false;
      setIsTranscribing(false);
      if (!submitted && !failed) {
        setAiStateRef.current('idle');
      }
    }
  }, []);

  // Start continuous listening with direct PCM capture and VAD
  const startListening = useCallback(async () => {
    if (isListeningRef.current || isStartingRef.current || isFinalizingRef.current) return;
    isStartingRef.current = true;
    setIsStarting(true);
    const operationId = ++operationIdRef.current;

    setTranscript('');
    hasSpokenRef.current = false;
    lastSpeechTimeRef.current = 0;
    pcmChunksRef.current = [];
    clearTimers();

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('This browser does not support microphone audio capture.');
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is unavailable. Check browser permissions.');
      }
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const microphoneRequest = navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      void microphoneRequest.then(
        stream => {
          if (operationId !== operationIdRef.current) {
            stream.getTracks().forEach(track => track.stop());
          }
        },
        () => undefined,
      );
      const audioReady = audioCtx.state === 'running'
        ? Promise.resolve()
        : audioCtx.resume();
      let permissionTimer: ReturnType<typeof setTimeout>;
      const microphoneTimeout = new Promise<never>((_, reject) => {
        permissionTimer = setTimeout(
          () => reject(new DOMException('Microphone permission timed out.', 'TimeoutError')),
          MICROPHONE_TIMEOUT_MS,
        );
      });
      let stream: MediaStream;
      try {
        [stream] = await Promise.all([
          Promise.race([microphoneRequest, microphoneTimeout]),
          audioReady,
        ]);
      } finally {
        clearTimeout(permissionTimer!);
      }
      if (operationId !== operationIdRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;
      if (audioCtx.state !== 'running') {
        throw new Error(`AudioContext is ${audioCtx.state}; microphone audio cannot be captured.`);
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      audioSourceRef.current = source;
      processorRef.current = processor;
      const maxSamples = Math.floor(audioCtx.sampleRate * MAX_LISTENING_MS / 1000);
      let capturedSamples = 0;

      const silentGain = audioCtx.createGain();
      silentGainRef.current = silentGain;
      silentGain.gain.value = 0;

      processor.onaudioprocess = (e) => {
        if (!isListeningRef.current) return;

        const input = e.inputBuffer.getChannelData(0);
        const samplesToCapture = Math.min(input.length, maxSamples - capturedSamples);
        if (samplesToCapture > 0) {
          pcmChunksRef.current.push(new Float32Array(input.subarray(0, samplesToCapture)));
          capturedSamples += samplesToCapture;
        }

        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);

        const visualLevel = Math.min(100, Math.round(rms * 400));
        const now = Date.now();
        if (
          visualLevel !== audioLevelRef.current
          && now - lastAudioLevelUpdateRef.current >= 200
        ) {
          lastAudioLevelUpdateRef.current = now;
          audioLevelRef.current = visualLevel;
          setAudioLevel(visualLevel);
        }

        if (rms > 0.008) {
          hasSpokenRef.current = true;
          lastSpeechTimeRef.current = Date.now();
        } else if (hasSpokenRef.current && lastSpeechTimeRef.current > 0) {
          if (Date.now() - lastSpeechTimeRef.current > 1800) {
            void stopListening();
          }
        }

        if (capturedSamples >= maxSamples) {
          stopListening();
        }
      };

      if (operationId !== operationIdRef.current) {
        releaseAudioResources();
        return;
      }
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      setIsListening(true);
      isListeningRef.current = true;
      setIsStarting(false);
      setAiStateRef.current('listening');
      setMicAvailable(true);

      idleTimeoutRef.current = setTimeout(() => {
        if (isListeningRef.current && !hasSpokenRef.current) {
          void stopListening();
        }
      }, 20000);
      maxListeningTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) {
          void stopListening();
        }
      }, MAX_LISTENING_MS);

    } catch (error) {
      if (operationId !== operationIdRef.current) return;
      console.error('[useVoice] Microphone startup failed:', error);
      operationIdRef.current += 1;
      isStartingRef.current = false;
      setIsStarting(false);
      releaseAudioResources();
      const name = (error as DOMException)?.name;
      if (name === 'NotFoundError') {
        setMicAvailable(false);
      }
      setAiStateRef.current('error');
      statusResetTimerRef.current = setTimeout(() => setAiStateRef.current('idle'), 3000);
    } finally {
      if (operationId === operationIdRef.current) {
        isStartingRef.current = false;
        setIsStarting(false);
      }
    }
  }, [stopListening]);

  const cancelStartup = useCallback(() => {
    operationIdRef.current += 1;
    isStartingRef.current = false;
    setIsStarting(false);
    clearTimers();
    releaseAudioResources();
    setAiStateRef.current('idle');
  }, []);

  const toggleListening = useCallback(() => {
    if (isStartingRef.current) {
      cancelStartup();
      return;
    }
    if (isListeningRef.current) {
      void stopListening();
    } else if (isFinalizingRef.current) {
      transcriptionAbortRef.current?.abort();
    } else {
      void startListening();
    }
  }, [cancelStartup, startListening, stopListening]);

  useEffect(() => () => {
    operationIdRef.current += 1;
    clearTimers();
    transcriptionAbortRef.current?.abort();
    releaseAudioResources();
  }, []);

  return {
    isListening,
    isStarting,
    isTranscribing,
    micAvailable,
    transcript,
    audioLevel,
    startListening,
    stopListening,
    toggleListening,
  };
}

// Convert collected raw Float32Array PCM chunks into standard 16kHz 16-bit Mono WAV Blob
function encodePcmToWav(chunks: Float32Array[], sourceSampleRate: number): Blob {
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const fullPcm = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    fullPcm.set(chunk, offset);
    offset += chunk.length;
  }

  const targetSampleRate = 16000;
  let finalPcm: Float32Array;

  if (sourceSampleRate === targetSampleRate) {
    finalPcm = fullPcm;
  } else {
    // Linear resample down to 16,000 Hz
    const ratio = sourceSampleRate / targetSampleRate;
    const targetLength = Math.max(1, Math.round(totalLength / ratio));
    finalPcm = new Float32Array(targetLength);
    for (let i = 0; i < targetLength; i++) {
      const srcPosition = i * ratio;
      const left = Math.min(Math.floor(srcPosition), totalLength - 1);
      const right = Math.min(left + 1, totalLength - 1);
      const fraction = srcPosition - left;
      finalPcm[i] = fullPcm[left] * (1 - fraction) + fullPcm[right] * fraction;
    }
  }

  const numSamples = finalPcm.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeString(pos: number, s: string) {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(pos + i, s.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);                  // SubChunk1Size (16 for PCM)
  view.setUint16(20, 1, true);                   // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true);                   // NumChannels (1 = Mono)
  view.setUint32(24, targetSampleRate, true);    // SampleRate (16000)
  view.setUint32(28, targetSampleRate * 2, true);// ByteRate (SampleRate * 1 channel * 2 bytes)
  view.setUint16(32, 2, true);                   // BlockAlign (1 channel * 2 bytes)
  view.setUint16(34, 16, true);                  // BitsPerSample (16 bit)
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);      // SubChunk2Size

  let byteOffset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, finalPcm[i]));
    view.setInt16(byteOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    byteOffset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}
