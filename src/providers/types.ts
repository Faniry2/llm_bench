export type ProviderId = 'deepseek' | 'qwen' | 'kimi' | 'glm' | 'chatgpt';

export interface RunRequest {
  prompt: string;
  system?: string;
  webSearch: boolean;
  /** id du modèle à utiliser ; si absent, le fournisseur prend son modèle par défaut. */
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  signal: AbortSignal;
  /** Called for each streamed text delta, used to feed the renderer live. */
  onDelta?: (delta: StreamDelta) => void;
  /** Provider-specific settings coming from the UI (search strategy, region, etc). */
  options?: Record<string, unknown>;
}

export interface StreamDelta {
  type: 'content' | 'reasoning' | 'round' | 'source';
  text?: string;
  round?: number;
  source?: { title: string; url: string; snippet?: string };
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  webSearchCalls: number;
}

export interface RunResult {
  providerId: ProviderId;
  modelId: string;
  status: 'success' | 'error' | 'cancelled';
  content: string;
  reasoningContent?: string;
  sources: { title: string; url: string; snippet?: string }[];
  usage: TokenUsage;
  usageIsEstimated: boolean;
  latencyMs: number;
  ttftMs?: number;
  rounds: number;
  rawResponse: unknown;
  error?: { code: string; message: string };
  webSearchBridged?: boolean;
}

export interface Provider {
  id: ProviderId;
  label: string;
  defaultModelId: string;
  /** Modèles proposés dans l'UI (le premier est le défaut ; saisie libre autorisée). */
  models: { id: string; label: string }[];
  run(req: RunRequest, apiKey: string): Promise<RunResult>;
  testKey(apiKey: string): Promise<boolean>;
}

export function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    webSearchCalls: 0
  };
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cachedInputTokens: a.cachedInputTokens + b.cachedInputTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    webSearchCalls: a.webSearchCalls + b.webSearchCalls
  };
}
