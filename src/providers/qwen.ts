import type { Provider, RunRequest, RunResult, TokenUsage } from './types.js';
import { emptyUsage } from './types.js';
import { mapCommonUsage, streamChatCompletion, ProviderHttpError, type ChatMessage, type ChatCompletionBody } from './base.js';
import { estimateTokens } from '../pricing/tokenizer.js';

const BASE_URL_INTL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const BASE_URL_CN = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const MODEL_ID = 'qwen3.7-plus';

export interface QwenOptions {
  region?: 'intl' | 'cn';
  searchStrategy?: 'turbo' | 'max' | 'agent' | 'agent_max';
  forcedSearch?: boolean;
  enableThinking?: boolean;
}

interface QwenSearchResult {
  title?: string;
  url?: string;
  snippet?: string;
  site_name?: string;
}

export const qwenProvider: Provider = {
  id: 'qwen',
  label: 'Qwen 3.7 Plus',
  defaultModelId: MODEL_ID,

  async run(req: RunRequest, apiKey: string): Promise<RunResult> {
    const start = Date.now();
    const options = (req.options ?? {}) as QwenOptions;
    const baseUrl = options.region === 'cn' ? BASE_URL_CN : BASE_URL_INTL;
    let ttftMs: number | undefined;

    const messages: ChatMessage[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.prompt });

    try {
      const body: ChatCompletionBody = {
        model: MODEL_ID,
        messages,
        temperature: req.temperature ?? 1,
        max_tokens: req.maxTokens ?? 4096
      };

      if (req.webSearch) {
        body.enable_search = true;
        body.search_options = {
          search_strategy: options.searchStrategy ?? 'agent',
          forced_search: options.forcedSearch ?? true,
          enable_source: true,
          enable_citation: true
        };
      }
      if (options.enableThinking !== undefined) {
        body.enable_thinking = options.enableThinking;
      }

      const result = await streamChatCompletion({
        baseUrl,
        apiKey,
        signal: req.signal,
        body,
        callbacks: {
          onFirstToken: () => {
            if (ttftMs === undefined) ttftMs = Date.now() - start;
          },
          onContent: (delta) => req.onDelta?.({ type: 'content', text: delta }),
          onReasoning: (delta) => req.onDelta?.({ type: 'reasoning', text: delta })
        }
      });

      const usage: TokenUsage = mapCommonUsage(result.usage);
      let usageIsEstimated = false;
      if (!result.usage) {
        usageIsEstimated = true;
        usage.inputTokens = estimateTokens(messages.map((m) => m.content ?? '').join('\n'));
        usage.outputTokens = estimateTokens(result.content);
        usage.totalTokens = usage.inputTokens + usage.outputTokens;
      }
      if (req.webSearch) usage.webSearchCalls = 1;

      const sources = extractSources(result.raw);

      return {
        providerId: 'qwen',
        modelId: MODEL_ID,
        status: 'success',
        content: result.content,
        reasoningContent: result.reasoningContent || undefined,
        sources,
        usage,
        usageIsEstimated,
        latencyMs: Date.now() - start,
        ttftMs,
        rounds: 1,
        rawResponse: result.raw
      };
    } catch (err) {
      if (req.signal.aborted) return cancelledResult(start);
      return errorResult(err, start);
    }
  },

  async testKey(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL_INTL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: MODEL_ID, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};

function extractSources(raw: unknown[]): RunResult['sources'] {
  for (const chunk of raw) {
    const c = chunk as { search_info?: { search_results?: QwenSearchResult[] } };
    const results = c.search_info?.search_results;
    if (results && results.length) {
      return results.map((r) => ({
        title: r.title ?? r.site_name ?? r.url ?? 'Source',
        url: r.url ?? '',
        snippet: r.snippet
      }));
    }
  }
  return [];
}

function cancelledResult(start: number): RunResult {
  return {
    providerId: 'qwen',
    modelId: MODEL_ID,
    status: 'cancelled',
    content: '',
    sources: [],
    usage: emptyUsage(),
    usageIsEstimated: false,
    latencyMs: Date.now() - start,
    rounds: 0,
    rawResponse: null,
    error: { code: 'cancelled', message: 'Annulé par l’utilisateur' }
  };
}

function errorResult(err: unknown, start: number): RunResult {
  const code = err instanceof ProviderHttpError ? err.code : 'network_error';
  const message = err instanceof Error ? err.message : String(err);
  return {
    providerId: 'qwen',
    modelId: MODEL_ID,
    status: 'error',
    content: '',
    sources: [],
    usage: emptyUsage(),
    usageIsEstimated: false,
    latencyMs: Date.now() - start,
    rounds: 0,
    rawResponse: null,
    error: { code, message }
  };
}
