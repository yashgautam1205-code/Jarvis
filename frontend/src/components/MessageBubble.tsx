import ReactMarkdown from 'react-markdown';
import { Bot, User } from 'lucide-react';
import type { Message } from '../types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isError = message.error;

  return (
    <div className={`flex gap-3 animate-fade-in-up ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser
          ? 'bg-jarvis-ice/10 border border-jarvis-ice/30'
          : isError
            ? 'bg-jarvis-error/10 border border-jarvis-error/30'
            : 'bg-jarvis-cyan/10 border border-jarvis-cyan/30'
      }`}>
        {isUser ? <User size={14} className="text-jarvis-ice" /> : <Bot size={14} className={isError ? 'text-jarvis-error' : 'text-jarvis-cyan'} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block px-4 py-2.5 rounded-xl text-sm leading-relaxed ${
          isUser
            ? 'bg-jarvis-ice/10 border border-jarvis-ice/20 text-jarvis-text'
            : isError
              ? 'bg-jarvis-error/5 border border-jarvis-error/20 text-jarvis-error/90'
              : 'bg-jarvis-panel border border-jarvis-border text-jarvis-text'
        }`}>
          {message.isStreaming && !message.content ? (
            <div className="flex gap-1.5 py-1">
              <span className="typing-dot w-2 h-2 bg-jarvis-cyan/60 rounded-full" />
              <span className="typing-dot w-2 h-2 bg-jarvis-cyan/60 rounded-full" />
              <span className="typing-dot w-2 h-2 bg-jarvis-cyan/60 rounded-full" />
            </div>
          ) : isUser ? (
            <span>{message.content}</span>
          ) : (
            <div className="markdown-content text-left">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {!!message.sources?.length && (
          <div className="mt-2 text-left">
            <p className="text-[10px] font-mono text-jarvis-muted mb-1">SOURCES</p>
            <ul className="space-y-1">
              {message.sources.map(source => (
                <li key={source.url} className="text-xs">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-jarvis-cyan hover:underline break-words"
                  >
                    {source.title}
                  </a>
                  {source.date && <span className="text-jarvis-muted ml-2">{source.date}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Timestamp */}
        <div className={`text-[10px] text-jarvis-muted/50 mt-1 ${isUser ? 'text-right' : 'text-left'}`}>
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
