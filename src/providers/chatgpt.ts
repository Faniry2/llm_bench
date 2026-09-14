import type { Provider, RunRequest, RunResult, TokenUsage } from './types.js';
import { emptyUsage, addUsage } from './types.js';
import { mapCommonUsage, streamChatCompletion, ProviderHttpError, type ChatMessage } from './base.js';
import { estimateTokens } from '../pricing/tokenizer.js';
import { runSearchOnlyBridge } from './search-bridge.js';
import { providerModels, defaultModelId, resolveModelId } from './models.js';

const BASE_URL = 'https://api.openai.com/v1';

export interface ChatgptOptions {
  /**
   * Recherche web côté OpenAI : `native` utilise l'outil `web_search` de la
   * Responses API (`POST /v1/responses`), `bridge` réutilise l'ancien
   * contournement (recherche via Qwen/GLM, sources injectées dans le prompt
   * système) pour les cas où la Responses API n'est pas disponible.
   */
  webSearchMode?: 'native' | 'bridge';
  bridgeProviderApiKey?: string;
  bridgeProviderId?: 'qwen' | 'glm';
}

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

interface ResponsesStreamResult {
  content: string;
  usage?: ResponsesUsage;
  sources: RunResult['sources'];
  webSearchCalls: number;
  raw: unknown[];
}

export const chatgptProvider: Provider = {
  id: 'chatgpt',
  label: 'ChatGPT (GPT-5.1)',
  defaultModelId: defaultModelId.chatgpt,
  models: providerModels.chatgpt,

  async run(req: RunRequest, apiKey: string): Promise<RunResult> {
    const start = Date.now();
    const modelId = resolveModelId('chatgpt', req.modelId);
    const options = (req.options ?? {}) as ChatgptOptions;
    const mode = options.webSearchMode ?? 'native';
    let usage: TokenUsage = emptyUsage();
    let sources: RunResult['sources'] = [];
    let webSearchBridged = false;
    let ttftMs: number | undefined;

    try {
      if (req.webSearch && mode === 'native') {
        const result = await streamResponsesApi({
          apiKey,
          signal: req.signal,
          body: {
            model: modelId,
            input: req.prompt,
            instructions: req.system || undefined,
            tools: [{ type: 'web_search' }],
            max_output_tokens: req.maxTokens ?? 8192
          },
          onFirstToken: () => {
            if (ttftMs === undefined) ttftMs = Date.now() - start;
          },
          onContent: (delta) => req.onDelta?.({ type: 'content', text: delta })
        });

        usage = mapResponsesUsage(result.usage);
        let usageIsEstimated = false;
        if (!result.usage) {
          usageIsEstimated = true;
          usage.inputTokens = estimateTokens(`${req.system ?? ''}\n${req.prompt}`);
          usage.outputTokens = estimateTokens(result.content);
          usage.totalTokens = usage.inputTokens + usage.outputTokens;
        }
        usage.webSearchCalls = result.webSearchCalls;
        sources = result.sources;

        return {
          providerId: 'chatgpt',
          modelId,
          status: 'success',
          content: result.content,
          sources,
          usage,
          usageIsEstimated,
          latencyMs: Date.now() - start,
          ttftMs,
          rounds: 1,
          rawResponse: result.raw,
          webSearchBridged: false
        };
      }

      let systemPrompt = req.system ?? '';
      if (req.webSearch && mode === 'bridge') {
        webSearchBridged = true;
        const bridge = await runSearchOnlyBridge(
          req.prompt,
          options.bridgeProviderId ?? 'qwen',
          options.bridgeProviderApiKey,
          req.signal
        );
        usage = addUsage(usage, bridge.usage);
        sources = bridge.sources;
        const sourcesBlock = sources
          .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}${s.snippet ? `\n${s.snippet}` : ''}`)
          .join('\n\n');
        systemPrompt = `${systemPrompt}\n\n<sources>\n${sourcesBlock || 'Aucune source trouvée.'}\n</sources>\n\nUtilise ces sources récentes pour répondre. Cite-les si pertinent.`;
      }

      const messages: ChatMessage[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: req.prompt });

      const result = await streamChatCompletion({
        baseUrl: BASE_URL,
        apiKey,
        signal: req.signal,
        body: {
          model: modelId,
          messages,
          // GPT-5.x en Chat Completions n'accepte que la température par défaut (1)
          // et remplace `max_tokens` par `max_completion_tokens` (accepté aussi par
          // gpt-4.1 / gpt-4o, donc pas de branche par modèle).
          max_completion_tokens: req.maxTokens ?? 8192
        },
        callbacks: {
          onFirstToken: () => {
            if (ttftMs === undefined) ttftMs = Date.now() - start;
          },
          onContent: (delta) => req.onDelta?.({ type: 'content', text: delta })
        }
      });

      const chatUsage = mapCommonUsage(result.usage);
      let usageIsEstimated = false;
      if (!result.usage) {
        usageIsEstimated = true;
        chatUsage.inputTokens = estimateTokens(messages.map((m) => m.content ?? '').join('\n'));
        chatUsage.outputTokens = estimateTokens(result.content);
        chatUsage.totalTokens = chatUsage.inputTokens + chatUsage.outputTokens;
      }
      usage = addUsage(usage, chatUsage);

      return {
        providerId: 'chatgpt',
        modelId,
        status: 'success',
        content: result.content,
        reasoningContent: result.reasoningContent || undefined,
        sources,
        usage,
        usageIsEstimated,
        latencyMs: Date.now() - start,
        ttftMs,
        rounds: 1,
        rawResponse: result.raw,
        webSearchBridged
      };
    } catch (err) {
      if (req.signal.aborted) {
        return cancelledResult(modelId, start, usage, sources, webSearchBridged);
      }
      return errorResult(modelId, err, start, usage, sources, webSearchBridged);
    }
  },

  async testKey(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};

function mapResponsesUsage(u?: ResponsesUsage): TokenUsage {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cachedInputTokens: u?.input_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: u?.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: u?.total_tokens ?? (u?.input_tokens ?? 0) + (u?.output_tokens ?? 0),
    webSearchCalls: 0
  };
}

/**
 * Streams a Responses API call (`POST /v1/responses`), le seul endpoint OpenAI
 * exposant l'outil de recherche web natif (`{ type: 'web_search' }`). Format SSE
 * différent de Chat Completions : événements nommés (`event: response.…`) plutôt
 * que des deltas `choices[0].delta`.
 */
async function streamResponsesApi(opts: {
  apiKey: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  onFirstToken?: () => void;
  onContent?: (delta: string) => void;
}): Promise<ResponsesStreamResult> {
  const res = await fetch(`${BASE_URL}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ProviderHttpError(`http_${res.status}`, `HTTP ${res.status}: ${text.slice(0, 500)}`, res.status);
  }
  if (!res.body) throw new ProviderHttpError('no_body', 'Réponse sans corps');

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let usage: ResponsesUsage | undefined;
  const sources: RunResult['sources'] = [];
  let webSearchCalls = 0;
  const raw: unknown[] = [];
  let firstTokenSeen = false;
  let eventName = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('event:')) {
        eventName = trimmed.slice(6).trim();
        continue;
      }
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let json: any;
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      raw.push(json);

      if (eventName === 'error' || json.type === 'error') {
        const message = json.message ?? json.error?.message ?? 'Erreur Responses API';
        throw new ProviderHttpError('stream_error', message);
      }

      if (eventName === 'response.output_text.delta' && typeof json.delta === 'string') {
        content += json.delta;
        if (!firstTokenSeen) {
          firstTokenSeen = true;
          opts.onFirstToken?.();
        }
        opts.onContent?.(json.delta);
        continue;
      }

      if (eventName === 'response.output_item.added' && json.item?.type === 'web_search_call') {
        webSearchCalls += 1;
        continue;
      }

      if (eventName === 'response.completed') {
        const response = json.response ?? {};
        usage = response.usage;
        for (const item of response.output ?? []) {
          if (item.type !== 'message') continue;
          for (const part of item.content ?? []) {
            for (const ann of part.annotations ?? []) {
              if (ann.type === 'url_citation') {
                sources.push({ title: ann.title ?? ann.url, url: ann.url, snippet: undefined });
              }
            }
          }
        }
      }
    }
  }

  return { content, usage, sources, webSearchCalls, raw };
}

function cancelledResult(
  modelId: string,
  start: number,
  usage: TokenUsage,
  sources: RunResult['sources'],
  webSearchBridged: boolean
): RunResult {
  return {
    providerId: 'chatgpt',
    modelId,
    status: 'cancelled',
    content: '',
    sources,
    usage,
    usageIsEstimated: false,
    latencyMs: Date.now() - start,
    rounds: 0,
    rawResponse: null,
    webSearchBridged,
    error: { code: 'cancelled', message: 'Annulé par l’utilisateur' }
  };
}

function errorResult(
  modelId: string,
  err: unknown,
  start: number,
  usage: TokenUsage,
  sources: RunResult['sources'],
  webSearchBridged: boolean
): RunResult {
  const code = err instanceof ProviderHttpError ? err.code : 'network_error';
  const message = err instanceof Error ? err.message : String(err);
  return {
    providerId: 'chatgpt',
    modelId,
    status: 'error',
    content: '',
    sources,
    usage,
    usageIsEstimated: false,
    latencyMs: Date.now() - start,
    rounds: 0,
    rawResponse: null,
    webSearchBridged,
    error: { code, message }
  };
}
