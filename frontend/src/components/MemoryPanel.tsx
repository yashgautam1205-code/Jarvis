import { useState, useEffect } from 'react';
import { Brain, Trash2, Search, Plus, Pencil, X, Save } from 'lucide-react';
import { apiUrl } from '../services/apiBase';

interface MemoryItem {
  id: string;
  content: string;
  category: string;
  importance: number;
  created_at: string;
}

export default function MemoryPanel() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('preference');
  const [importance, setImportance] = useState(0.7);
  const [consent, setConsent] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');

  const fetchMemories = async () => {
    try {
      const res = await fetch(apiUrl('memories'));
      if (!res.ok) throw new Error(`Could not load memories (HTTP ${res.status}).`);
      setMemories(await res.json());
      setError('');
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Could not load memories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMemories(); }, []);

  const deleteMemory = async (id: string) => {
    if (!window.confirm('Delete this saved memory?')) return;
    try {
      const res = await fetch(apiUrl(`memories/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error(`Could not delete memory (HTTP ${res.status}).`);
      setMemories(prev => prev.filter(m => m.id !== id));
      setError('');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete memory.');
    }
  };

  const openCreateForm = () => {
    setEditingId(null);
    setContent('');
    setCategory('preference');
    setImportance(0.7);
    setConsent(false);
    setError('');
    setFormOpen(true);
  };

  const openEditForm = (memory: MemoryItem) => {
    if (memory.content.startsWith('[Hidden because')) {
      setError('This memory was hidden because it may contain a credential. Delete it instead of editing the hidden value.');
      return;
    }
    setEditingId(memory.id);
    setContent(memory.content);
    setCategory(memory.category);
    setImportance(memory.importance);
    setConsent(false);
    setError('');
    setFormOpen(true);
  };

  const saveMemory = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!consent) {
      setError('Confirm consent before saving this memory.');
      return;
    }
    try {
      const res = await fetch(
        apiUrl(editingId ? `memories/${editingId}` : 'memories'),
        {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, category, consent, importance }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Could not save memory (HTTP ${res.status}).`);
      await fetchMemories();
      setFormOpen(false);
      setConsent(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save memory.');
    }
  };

  const filtered = memories.filter(m =>
    m.content.toLowerCase().includes(search.toLowerCase()) ||
    m.category.toLowerCase().includes(search.toLowerCase())
  );

  const categoryColors: Record<string, string> = {
    preference: 'text-jarvis-cyan bg-jarvis-cyan/10',
    fact: 'text-jarvis-ice bg-jarvis-ice/10',
    context: 'text-jarvis-success bg-jarvis-success/10',
    general: 'text-jarvis-muted bg-white/5',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-jarvis-muted">Conversation history is separate from saved memories.</p>
        <button
          onClick={openCreateForm}
          className="px-3 py-1.5 rounded border border-jarvis-cyan/30 text-jarvis-cyan hover:bg-jarvis-cyan/10 flex items-center gap-2 text-xs"
        >
          <Plus size={14} /> Save memory
        </button>
      </div>

      {formOpen && (
        <form onSubmit={saveMemory} className="glass-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm text-jarvis-text">{editingId ? 'Edit memory' : 'Save a memory'}</h2>
            <button type="button" onClick={() => setFormOpen(false)} aria-label="Cancel">
              <X size={15} className="text-jarvis-muted" />
            </button>
          </div>
          <textarea
            value={content}
            onChange={event => setContent(event.target.value)}
            required
            maxLength={2000}
            rows={3}
            placeholder="A preference or useful fact you want JARVIS to remember"
            className="input-jarvis w-full text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <select
              value={category}
              onChange={event => setCategory(event.target.value)}
              className="input-jarvis text-xs"
            >
              <option value="preference">Preference</option>
              <option value="fact">Fact</option>
              <option value="context">Context</option>
              <option value="general">General</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-jarvis-muted">
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
              I consent to save this memory
            </label>
            <button
              type="submit"
              className="px-3 py-1.5 rounded border border-jarvis-cyan/30 text-jarvis-cyan hover:bg-jarvis-cyan/10 flex items-center gap-2 text-xs disabled:opacity-40"
              disabled={!consent}
            >
              <Save size={14} /> Save
            </button>
          </div>
          <p className="text-[11px] text-jarvis-muted">
            Do not save passwords, API keys, access tokens, or other credentials.
          </p>
        </form>
      )}

      {error && <p role="alert" className="text-xs text-jarvis-error">{error}</p>}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-jarvis-muted/50" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search memories..."
          className="input-jarvis w-full pl-9 text-sm"
        />
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        {['all', 'preference', 'fact', 'context'].map(cat => {
          const count = cat === 'all' ? memories.length : memories.filter(m => m.category === cat).length;
          return (
            <div key={cat} className="glass-panel px-3 py-2 flex-1 text-center">
              <div className="text-lg font-mono text-jarvis-cyan">{count}</div>
              <div className="text-[10px] text-jarvis-muted capitalize">{cat}</div>
            </div>
          );
        })}
      </div>

      {/* List */}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="text-center text-jarvis-muted/40 py-8 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <Brain size={24} className="mx-auto mb-2 text-jarvis-muted/20" />
            <p className="text-sm text-jarvis-muted/40">No memories found</p>
          </div>
        ) : (
          filtered.map(m => (
            <div key={m.id} className="glass-panel p-3 flex items-start justify-between gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${categoryColors[m.category] || categoryColors.general}`}>
                    {m.category.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-jarvis-muted/40">
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm text-jarvis-text truncate">{m.content}</p>
              </div>
              <button
                onClick={() => openEditForm(m)}
                className="p-1 hover:bg-white/5 rounded transition-all"
                aria-label="Edit memory"
              >
                <Pencil size={12} className="text-jarvis-muted" />
              </button>
              <button
                onClick={() => deleteMemory(m.id)}
                className="p-1 hover:bg-jarvis-error/10 rounded transition-all"
                aria-label="Delete memory"
              >
                <Trash2 size={12} className="text-jarvis-error/60" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
