import type {
  Message, Conversation, SystemMetrics, Tool, Task,
  Memory, AutomationRule, AutomationHistory, Settings,
  ApiResponse, ChatResponse,
} from '../types';
import API_BASE from './apiBase';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          data: null as T,
          error: (errorData as Record<string, string>).detail || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      return { success: true, data: data as T };
    } catch (error) {
      return {
        success: false,
        data: null as T,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  // ── Chat ──────────────────────────────────────────────────
  async sendMessage(
    content: string,
    conversationId?: string
  ): Promise<ApiResponse<ChatResponse>> {
    return this.request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ content, conversation_id: conversationId }),
    });
  }

  async streamMessage(
    content: string,
    conversationId?: string,
    onChunk: (chunk: string) => void = () => {},
    onDone: () => void = () => {}
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, conversation_id: conversationId }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              onDone();
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                onChunk(parsed.content);
              }
            } catch {
              onChunk(data);
            }
          }
        }
      }

      onDone();
    } catch (error) {
      console.error('Stream error:', error);
      throw error;
    }
  }

  // ── Conversations ────────────────────────────────────────
  async getConversations(): Promise<ApiResponse<Conversation[]>> {
    return this.request<Conversation[]>('/conversations');
  }

  async getConversation(id: string): Promise<ApiResponse<Conversation & { messages: Message[] }>> {
    return this.request<Conversation & { messages: Message[] }>(`/conversations/${id}`);
  }

  async deleteConversation(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/conversations/${id}`, { method: 'DELETE' });
  }

  async clearConversations(): Promise<ApiResponse<void>> {
    return this.request<void>('/conversations', { method: 'DELETE' });
  }

  // ── System ───────────────────────────────────────────────
  async getSystemMetrics(): Promise<ApiResponse<SystemMetrics>> {
    return this.request<SystemMetrics>('/system/metrics');
  }

  async getHealth(): Promise<ApiResponse<{ status: string; version: string }>> {
    return this.request<{ status: string; version: string }>('/health');
  }

  // ── Tools ────────────────────────────────────────────────
  async getTools(): Promise<ApiResponse<Tool[]>> {
    return this.request<Tool[]>('/tools');
  }

  async toggleTool(name: string, enabled: boolean): Promise<ApiResponse<Tool>> {
    return this.request<Tool>(`/tools/${name}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  }

  // ── Tasks ────────────────────────────────────────────────
  async getTasks(): Promise<ApiResponse<Task[]>> {
    return this.request<Task[]>('/tasks');
  }

  async getTask(id: string): Promise<ApiResponse<Task>> {
    return this.request<Task>(`/tasks/${id}`);
  }

  async cancelTask(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/tasks/${id}/cancel`, { method: 'POST' });
  }

  // ── Memory ───────────────────────────────────────────────
  async getMemories(query?: string): Promise<ApiResponse<Memory[]>> {
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    return this.request<Memory[]>(`/memory${params}`);
  }

  async deleteMemory(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/memory/${id}`, { method: 'DELETE' });
  }

  async clearMemories(): Promise<ApiResponse<void>> {
    return this.request<void>('/memory', { method: 'DELETE' });
  }

  // ── Automation ───────────────────────────────────────────
  async getAutomationRules(): Promise<ApiResponse<AutomationRule[]>> {
    return this.request<AutomationRule[]>('/automation/rules');
  }

  async createAutomationRule(
    rule: Omit<AutomationRule, 'id' | 'lastRun' | 'runCount'>
  ): Promise<ApiResponse<AutomationRule>> {
    return this.request<AutomationRule>('/automation/rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  }

  async toggleAutomationRule(id: string, enabled: boolean): Promise<ApiResponse<AutomationRule>> {
    return this.request<AutomationRule>(`/automation/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  }

  async deleteAutomationRule(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/automation/rules/${id}`, { method: 'DELETE' });
  }

  async getAutomationHistory(): Promise<ApiResponse<AutomationHistory[]>> {
    return this.request<AutomationHistory[]>('/automation/history');
  }

  // ── Settings ─────────────────────────────────────────────
  async getSettings(): Promise<ApiResponse<Settings>> {
    return this.request<Settings>('/settings');
  }

  async updateSettings(settings: Partial<Settings>): Promise<ApiResponse<Settings>> {
    return this.request<Settings>('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async validateApiKey(key: string): Promise<ApiResponse<{ valid: boolean }>> {
    return this.request<{ valid: boolean }>('/settings/validate-key', {
      method: 'POST',
      body: JSON.stringify({ api_key: key }),
    });
  }
}

export const api = new ApiClient();
export default api;
