import type { Provider, RunRequest, RunResult, TokenUsage } from './types.js';
import { emptyUsage } from './types.js';
import { mapCommonUsage, streamChatCompletion, ProviderHttpError, type ChatMessage, type ChatCompletionBody } from './base.js';
import { estimateTokens } from '../pricing/tokenizer.js';

const BASE_URL = 'https://api.z.ai/api/paas/v4';
const MODEL_ID = 'glm-5.1';

export interface GlmOptions {
  searchEngine?: string;
  resultCount?: number;
}

interface GlmSearchResultItem {
  title?: string;
  link?: string;
  content?: string;
}

export const glmProvider: Provider = {
  id: 'glm',
  label: 'GLM-5.1',
  defaultModelId: MODEL_ID,

  async run(req: RunRequest, apiKey: string): Promise<RunResult> {
    const start = Date.now();
    const options = (req.options ?? {}) as GlmOptions;
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
        body.tools = [
          {
            type: 'web_search',
            web_search: {
              enable: true,
              search_engine: options.searchEngine ?? 'search_pro_jina',
              search_result: true,
              count: options.resultCount ?? 10
            }
          }
        ];
      }

      const result = await streamChatCompletion({
        baseUrl: BASE_URL,
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

      const sources = extractSources(result.raw);
      if (req.webSearch) usage.webSearchCalls = 1;

      return {
        providerId: 'glm',
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
      const res = await fetch(`${BASE_URL}/chat/completions`, {
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
    const c = chunk as { web_search?: GlmSearchResultItem[]; search_result?: GlmSearchResultItem[] };
    const results = c.web_search ?? c.search_result;
    if (results && results.length) {
      return results.map((r) => ({
        title: r.title ?? r.link ?? 'Source',
        url: r.link ?? '',
        snippet: r.content
      }));
    }
  }
  return [];
}

function cancelledResult(start: number): RunResult {
  return {
    providerId: 'glm',
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
    providerId: 'glm',
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
