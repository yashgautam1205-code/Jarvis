// ── AI States ──────────────────────────────────────────────
export type AIState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'executing' | 'error';

// ── Messages ───────────────────────────────────────────────
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
  error?: boolean;
  sources?: Array<{ title: string; url: string; date?: string }>;
}

// ── Conversations ──────────────────────────────────────────
export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
  pinned?: boolean;
}

// ── System Metrics ─────────────────────────────────────────
export interface SystemMetrics {
  cpu: number;
  memory: number;
  memoryUsedGB: number;
  memoryTotalGB: number;
  disk: number;
  diskUsedGB: number;
  diskTotalGB: number;
  battery: number;
  batteryCharging: boolean;
  networkUp: number;
  networkDown: number;
  uptime: string;
  temperature?: number;
  gpuUsage?: number;
  processCount: number;
}

// ── Tools ──────────────────────────────────────────────────
export interface Tool {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  parameters?: Record<string, ToolParameter>;
}

export interface ToolParameter {
  type: string;
  description: string;
  required: boolean;
  default?: unknown;
}

// ── Tasks ──────────────────────────────────────────────────
export interface Task {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  steps: TaskStep[];
  createdAt: string;
  completedAt?: string;
  result?: string;
  error?: string;
}

export interface TaskStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  timestamp: string;
}

// ── Memory ─────────────────────────────────────────────────
export interface Memory {
  id: string;
  content: string;
  type: 'fact' | 'preference' | 'context' | 'instruction';
  createdAt: string;
  source: string;
  tags: string[];
  relevance?: number;
}

// ── Automation ─────────────────────────────────────────────
export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  lastRun?: string;
  runCount: number;
}

export interface AutomationTrigger {
  type: 'schedule' | 'event' | 'condition';
  config: Record<string, unknown>;
}

export interface AutomationAction {
  type: string;
  config: Record<string, unknown>;
}

export interface AutomationHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  status: 'success' | 'failure';
  timestamp: string;
  duration: number;
  output?: string;
  error?: string;
}

// ── Settings ───────────────────────────────────────────────
export interface Settings {
  general: GeneralSettings;
  ai: AISettings;
  voice: VoiceSettings;
  appearance: AppearanceSettings;
  security: SecuritySettings;
}

export interface GeneralSettings {
  autoStart: boolean;
  minimizeToTray: boolean;
  checkUpdates: boolean;
  language: string;
  timezone: string;
}

export interface AISettings {
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  systemPrompt: string;
  enableTools: boolean;
  enableMemory: boolean;
}

export interface VoiceSettings {
  enabled: boolean;
  inputDevice: string;
  outputDevice: string;
  wakeWord: string;
  language: string;
  speed: number;
  ttsEngine: string;
  sttEngine: string;
  pushToTalk: boolean;
  pushToTalkKey: string;
}

export interface AppearanceSettings {
  theme: 'dark' | 'light' | 'system';
  accentColor: string;
  fontSize: 'small' | 'medium' | 'large';
  animations: boolean;
  scanLines: boolean;
  particles: boolean;
  compactMode: boolean;
}

export interface SecuritySettings {
  confirmDangerousActions: boolean;
  sandboxMode: boolean;
  allowedPaths: string[];
  blockedCommands: string[];
}

// ── WebSocket ──────────────────────────────────────────────
export type WSEventType =
  | 'message'
  | 'stream_start'
  | 'stream_chunk'
  | 'stream_end'
  | 'state_change'
  | 'metrics_update'
  | 'task_update'
  | 'error'
  | 'connected'
  | 'disconnected';

export interface WSEvent {
  type: WSEventType;
  data: unknown;
  timestamp: string;
}

// ── API Responses ──────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface ChatResponse {
  message: Message;
  conversationId: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
  messageId: string;
}

// ── Navigation ─────────────────────────────────────────────
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
}
