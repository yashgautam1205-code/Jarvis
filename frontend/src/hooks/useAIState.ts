import { useState } from 'react';
import type { AIState } from '../types';

export function useAIState() {
  const [aiState, setAiState] = useState<AIState>('idle');
  return { aiState, setAiState };
}

