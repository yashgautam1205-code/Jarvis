import { useState, useEffect, KeyboardEvent } from 'react';
import { Send, Mic, Square, Keyboard } from 'lucide-react';
import type { AIState } from '../types';
import { useVoice } from '../hooks/useVoice';
import { useWakeWord } from '../hooks/useWakeWord';

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  onTranscript: (text: string) => void;
  setAiState: (state: AIState) => void;
  aiState: AIState;
}

export default function CommandBar({
  onSend,
  onStop,
  onTranscript,
  setAiState,
  aiState,
}: Props) {
  const [input, setInput] = useState('');
  const {
    isListening,
    isStarting,
    isTranscribing,
    micAvailable,
    toggleListening,
    transcript,
    audioLevel,
    startListening,
  } = useVoice({ onTranscript, setAiState });
  const isProcessing = aiState === 'thinking' || aiState === 'speaking' || aiState === 'executing';
  const { wakeWordActive } = useWakeWord({
    aiState,
    onWake: () => {
      if (!isProcessing && !isListening && !isStarting && !isTranscribing) {
        void startListening();
      }
    },
  });

  // When live transcript updates from voice input, show it in the input field
  useEffect(() => {
    if (transcript && isListening) {
      setInput(transcript);
    }
  }, [transcript, isListening]);

  const handleSend = () => {
    if (!input.trim() || isProcessing) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 py-3 border-t border-jarvis-border bg-jarvis-bg/80 backdrop-blur-xl">
      <div className="flex items-center gap-2">
        {/* Mic button */}
        <button
          onClick={toggleListening}
          disabled={!micAvailable}
          style={{
            transform: isListening ? `scale(${1 + Math.min(0.2, audioLevel / 200)})` : 'scale(1)',
          }}
          className={`p-2.5 rounded-lg transition-all duration-150 relative ${
            isListening || isStarting || isTranscribing
              ? 'bg-jarvis-cyan/20 border border-jarvis-cyan/70 text-jarvis-cyan shadow-glow-cyan'
              : micAvailable
                ? 'bg-white/5 border border-jarvis-border text-jarvis-muted hover:text-jarvis-text hover:border-jarvis-border-bright'
                : 'bg-white/5 border border-jarvis-border text-jarvis-muted/30 cursor-not-allowed'
          }`}
          title={
            isStarting ? 'Cancel microphone request'
              : isTranscribing ? 'Cancel transcription'
                : isListening ? 'Click to stop & submit voice'
                  : micAvailable ? 'Click to speak to JARVIS' : 'Microphone unavailable'
          }
        >
          {isStarting || isTranscribing ? (
            <Square size={16} className="text-jarvis-cyan" />
          ) : isListening ? (
            <Mic size={18} className="text-jarvis-cyan animate-pulse" />
          ) : (
            <Mic size={18} />
          )}
        </button>

        {/* Input */}
        <div className="flex-1 relative">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? 'Listening to your voice... Speak now'
                : 'Message JARVIS (replies will be spoken aloud)...'
            }
            rows={1}
            className={`input-jarvis w-full resize-none pr-10 transition-colors ${
              isListening ? 'border-jarvis-cyan/50 shadow-glow-cyan' : ''
            }`}
            style={{ minHeight: 42, maxHeight: 120 }}
          />
          <Keyboard size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-jarvis-muted/30" />
        </div>

        {/* Send / Stop */}
        {isProcessing ? (
          <button
            onClick={onStop}
            className="p-2.5 bg-jarvis-error/10 border border-jarvis-error/30 text-jarvis-error rounded-lg hover:bg-jarvis-error/20 transition-all flex items-center gap-1.5"
            title="Stop speaking / cancel"
          >
            <Square size={16} />
            <span className="text-xs font-mono hidden sm:inline">STOP</span>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className={`p-2.5 rounded-lg transition-all duration-300 ${
              input.trim()
                ? 'bg-jarvis-cyan/10 border border-jarvis-cyan/30 text-jarvis-cyan hover:bg-jarvis-cyan/20 hover:shadow-glow-cyan'
                : 'bg-white/5 border border-jarvis-border text-jarvis-muted/30 cursor-not-allowed'
            }`}
            title="Send message"
          >
            <Send size={18} />
          </button>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${
            isListening ? 'bg-jarvis-cyan animate-ping' :
            aiState === 'speaking' ? 'bg-jarvis-success animate-pulse' :
            isProcessing ? 'bg-jarvis-warning animate-pulse' :
            'bg-jarvis-muted/30'
          }`} />
          <span className="text-[10px] text-jarvis-muted/70 font-mono">
            {isStarting
              ? 'REQUESTING MICROPHONE · CLICK TO CANCEL'
              : isTranscribing
                ? 'TRANSCRIBING VOICE · CLICK TO CANCEL'
                : aiState === 'error'
                  ? 'VOICE ERROR · TRY AGAIN'
                  : isListening
              ? `LISTENING · VOICE SYNC: ${audioLevel}%`
                  : wakeWordActive
                    ? 'WAKE WORD ACTIVE · LOCAL MICROPHONE PROCESSING'
                  : aiState === 'speaking'
                ? 'JARVIS SPEAKING (FEMALE VOICE ACTIVE)'
                : isProcessing
                  ? 'PROCESSING...'
                  : 'READY · VOICE OUTPUT ONLY'}
          </span>
        </div>
        <span className="text-[10px] text-jarvis-muted/40">
          All replies are spoken aloud · Enter to send
        </span>
      </div>
    </div>
  );
}
