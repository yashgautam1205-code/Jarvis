import { useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import MessageBubble from './MessageBubble';
import type { Message } from '../types';

interface Props {
  messages: Message[];
  onClear: () => void;
}

export default function ChatPanel({ messages, onClear }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full glass-panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-jarvis-border">
        <span className="text-xs font-mono text-jarvis-muted tracking-wider">CONVERSATION</span>
        {messages.length > 0 && (
          <button onClick={onClear} className="p-1 hover:bg-white/5 rounded transition-colors" title="Clear chat">
            <Trash2 size={13} className="text-jarvis-muted hover:text-jarvis-error" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-40">
            <p className="text-sm text-jarvis-muted">No messages yet</p>
            <p className="text-xs text-jarvis-muted/60 mt-1">Send a message or use voice input to begin</p>
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

