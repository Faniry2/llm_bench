export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatCompletionChunk {
  choices: {
    delta: {
      content?: string;
      reasoning_content?: string;
      tool_calls?: Partial<ToolCall>[];
      role?: string;
    };
    finish_reason: string | null;
  }[];
  usage?: RawUsage;
}

export interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  cached_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
  [key: string]: unknown;
}

export interface ChatCompletionBody {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  temperature?: number;
  max_tokens?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

export interface StreamCallbacks {
  onContent?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onToolCallDelta?: (index: number, delta: Partial<ToolCall>) => void;
  onFirstToken?: () => void;
}

export class ProviderHttpError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number
  ) {
    super(message);
  }
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Lists model ids from an OpenAI-compatible GET /models endpoint. */
export async function fetchModelList(baseUrl: string, apiKey: string): Promise<string[]> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ProviderHttpError(`http_${res.status}`, `HTTP ${res.status}: ${text.slice(0, 300)}`, res.status);
  }
  const json = (await res.json()) as { data?: { id?: string }[] };
  const ids = (json.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  return [...new Set(ids)].sort();
}

export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return `${key.slice(0, 6)}****${key.slice(-4)}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FetchChatOptions {
  baseUrl: string;
  apiKey: string;
  body: ChatCompletionBody;
  signal: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  callbacks?: StreamCallbacks;
  extraHeaders?: Record<string, string>;
}

export interface FetchChatResult {
  finishReason: string | null;
  content: string;
  reasoningContent: string;
  toolCalls: ToolCall[];
  usage?: RawUsage;
  raw: unknown[];
}

/**
 * Streams a Chat Completions call (SSE) with retry/backoff on 429 and 5xx.
 * 4xx other than 429 fails immediately (no retry).
 */
export async function streamChatCompletion(opts: FetchChatOptions): Promise<FetchChatResult> {
  // Une recherche web forcée côté serveur (plusieurs sources croisées) plus une
  // génération longue (gros max_tokens) peuvent légitimement dépasser 180s avant
  // le premier token. On laisse plus de marge avant d'abandonner.
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const maxRetries = opts.maxRetries ?? 3;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const timeoutController = new AbortController();
    let timedOut = false;
    const onAbort = () => timeoutController.abort();
    opts.signal.addEventListener('abort', onAbort);
    const timer = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);

    try {
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
          ...opts.extraHeaders
        },
        body: JSON.stringify({ ...opts.body, stream: true, stream_options: { include_usage: true } }),
        signal: timeoutController.signal
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
          clearTimeout(timer);
          opts.signal.removeEventListener('abort', onAbort);
          await sleep(2 ** attempt * 1000 + Math.random() * 250);
          continue;
        }
        throw new ProviderHttpError(`http_${res.status}`, `HTTP ${res.status}: ${text.slice(0, 500)}`, res.status);
      }

      if (!res.body) throw new ProviderHttpError('no_body', 'Réponse sans corps');

      const result = await consumeSse(res.body, opts.callbacks);
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onAbort);
      return result;
    } catch (err) {
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onAbort);
      if (opts.signal.aborted) throw err;
      // Own client-side timeout (not a retryable HTTP status): the server never
      // answered within timeoutMs, so retrying the same slow call just multiplies
      // the wait. Fail fast with a clear message instead of a silent 4x retry.
      if (timedOut) throw new ProviderHttpError('timeout', `Aucune réponse de l'API après ${timeoutMs / 1000}s.`);
      lastError = err;
      if (err instanceof ProviderHttpError) {
        if (err.status && !RETRYABLE_STATUS.has(err.status)) throw err;
      }
      if (attempt >= maxRetries) throw err;
      await sleep(2 ** attempt * 1000 + Math.random() * 250);
    }
  }
  throw lastError ?? new ProviderHttpError('unknown', 'Échec inconnu');
}

async function consumeSse(body: ReadableStream<Uint8Array>, callbacks?: StreamCallbacks): Promise<FetchChatResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let reasoningContent = '';
  let finishReason: string | null = null;
  let usage: RawUsage | undefined;
  const toolCallMap = new Map<number, ToolCall>();
  const raw: unknown[] = [];
  let firstTokenSeen = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      let json: ChatCompletionChunk;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      raw.push(json);

      if (json.usage) usage = json.usage;

      const choice = json.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;

      if (choice.delta?.content) {
        content += choice.delta.content;
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          callbacks?.onFirstToken?.();
        }
        callbacks?.onContent?.(choice.delta.content);
      }
      if (choice.delta?.reasoning_content) {
        reasoningContent += choice.delta.reasoning_content;
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          callbacks?.onFirstToken?.();
        }
        callbacks?.onReasoning?.(choice.delta.reasoning_content);
      }
      if (choice.delta?.tool_calls) {
        for (const tc of choice.delta.tool_calls) {
          const index = (tc as { index?: number }).index ?? 0;
          const existing = toolCallMap.get(index) ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.function.name += tc.function.name;
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
          toolCallMap.set(index, existing);
          callbacks?.onToolCallDelta?.(index, tc);
        }
      }
    }
  }

  return {
    finishReason,
    content,
    reasoningContent,
    toolCalls: [...toolCallMap.values()],
    usage,
    raw
  };
}

export function mapCommonUsage(u?: RawUsage) {
  const cached = u?.prompt_cache_hit_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? u?.cached_tokens ?? 0;
  const reasoning = u?.completion_tokens_details?.reasoning_tokens ?? 0;
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    cachedInputTokens: cached,
    reasoningTokens: reasoning,
    totalTokens: u?.total_tokens ?? (u?.prompt_tokens ?? 0) + (u?.completion_tokens ?? 0),
    webSearchCalls: 0
  };
}
