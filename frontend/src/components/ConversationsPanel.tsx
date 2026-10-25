import { useState, useEffect } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { apiUrl } from '../services/apiBase';

interface ConvItem {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface ConversationMessage {
  id: string;
  role: string;
  content: string;
  timestamp: string | null;
}

export default function ConversationsPanel() {
  const [conversations, setConversations] = useState<ConvItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await fetch(apiUrl('chat/conversations'));
      if (!response.ok) throw new Error(`Could not load conversations (HTTP ${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('The backend returned an invalid conversation list.');
      setConversations(data);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load conversations.');
    } finally {
      setLoading(false);
    }
  };

  const openConversation = async (id: string) => {
    if (selectedId === id) {
      setSelectedId(null);
      setMessages([]);
      return;
    }
    try {
      const response = await fetch(apiUrl(`chat/conversations/${id}/messages`));
      if (!response.ok) throw new Error(`Could not load conversation messages (HTTP ${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('The backend returned invalid conversation messages.');
      setMessages(data);
      setSelectedId(id);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load conversation messages.');
    }
  };

  const deleteConv = async (id: string) => {
    try {
      const response = await fetch(apiUrl(`chat/conversations/${id}`), { method: 'DELETE' });
      if (!response.ok) throw new Error(`Could not delete conversation (HTTP ${response.status}).`);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setMessages([]);
      }
      setError('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete conversation.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-jarvis-text font-medium">{conversations.length} conversations</span>
      </div>
      {error && <p role="alert" className="text-xs text-jarvis-error">{error}</p>}

      <div className="space-y-2 max-h-[70vh] overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="text-center py-8 text-sm text-jarvis-muted/40">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare size={28} className="mx-auto mb-3 text-jarvis-muted/20" />
            <p className="text-sm text-jarvis-muted/40">No conversations yet</p>
            <p className="text-xs text-jarvis-muted/30 mt-1">Start chatting from the Command Center</p>
          </div>
        ) : (
          conversations.map(c => (
            <div key={c.id} className="glass-panel p-3 flex flex-wrap items-center justify-between group hover:border-jarvis-border-bright transition-colors">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <MessageSquare size={16} className="text-jarvis-cyan/40 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm text-jarvis-text truncate">{c.title}</p>
                  <p className="text-[10px] text-jarvis-muted/50">
                    {c.updated_at ? new Date(c.updated_at).toLocaleString() : 'Unknown'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => void openConversation(c.id)}
                className="text-[10px] text-jarvis-cyan hover:underline"
                aria-expanded={selectedId === c.id}
              >
                {selectedId === c.id ? 'Hide' : 'View'}
              </button>
              <button
                onClick={() => void deleteConv(c.id)}
                aria-label={`Delete ${c.title}`}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-jarvis-error/10 rounded transition-all"
              >
                <Trash2 size={12} className="text-jarvis-error/60" />
              </button>
              {selectedId === c.id && (
                <div className="basis-full max-h-72 overflow-y-auto rounded border border-jarvis-border p-3 space-y-2">
                  {messages.filter(message => message.role !== 'tool').map(message => (
                    <div key={message.id} className="text-xs">
                      <span className="text-jarvis-cyan capitalize">{message.role}: </span>
                      <span className="text-jarvis-text whitespace-pre-wrap">{message.content}</span>
                    </div>
                  ))}
                  {messages.length === 0 && <p className="text-xs text-jarvis-muted">No messages in this conversation.</p>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
