import { useState, useEffect, useCallback } from 'react';
import { apiUrl } from '../services/apiBase';

export interface AppSettings {
  ai_provider: string;
  ai_model: string;
  ollama_model: string;
  ai_available: boolean;
  active_provider: string;
  openai_configured: boolean;
  ollama_available: boolean;
  ollama_installed: boolean;
  ollama_model_available: boolean;
  ollama_models: string[];
  ollama_guidance: string;
  tts_enabled: string;
  voice_speed: string;
  wake_word_enabled: string;
  wake_word_model: string;
  wake_word_threshold: number;
  wake_word_cooldown_seconds: number;
  search_provider: string;
  search_available: boolean;
  theme_intensity: string;
  animations_enabled: string;
  scan_lines: string;
  particles: string;
  confirm_dangerous: string;
}

const defaults: AppSettings = {
  ai_provider: 'ollama',
  ai_model: 'gpt-4o-mini',
  ollama_model: 'qwen3:8b',
  ai_available: false,
  active_provider: 'demo',
  openai_configured: false,
  ollama_available: false,
  ollama_installed: false,
  ollama_model_available: false,
  ollama_models: [],
  ollama_guidance: 'Install Ollama from https://ollama.com/download, then start it.',
  tts_enabled: 'false',
  voice_speed: '1.0',
  wake_word_enabled: 'false',
  wake_word_model: 'hey_jarvis',
  wake_word_threshold: 0.5,
  wake_word_cooldown_seconds: 5,
  search_provider: 'DuckDuckGo HTML',
  search_available: false,
  theme_intensity: '100',
  animations_enabled: 'true',
  scan_lines: 'true',
  particles: 'true',
  confirm_dangerous: 'true',
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSettings = useCallback(() => {
    fetch(apiUrl('settings'))
      .then(async response => {
        if (!response.ok) throw new Error(`Settings request returned HTTP ${response.status}.`);
        return response.json();
      })
      .then(data => { setSettings(prev => ({ ...prev, ...data })); setError(''); })
      .catch(fetchError => {
        setError(fetchError instanceof Error ? fetchError.message : 'Could not load settings.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    try {
      const response = await fetch(apiUrl('settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `Settings update returned HTTP ${response.status}.`);
      }
      setSettings(prev => ({ ...prev, [key]: value }));
      setError('');
      fetchSettings();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Failed to update setting.');
    }
  }, [fetchSettings]);

  return { settings, loading, error, updateSetting, refreshSettings: fetchSettings };
}
