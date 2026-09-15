import type { Provider, RunRequest, RunResult, TokenUsage } from './types.js';
import { emptyUsage, addUsage } from './types.js';
import { mapCommonUsage, streamChatCompletion, fetchModelList, ProviderHttpError, type ChatMessage, type ToolCall, type ChatCompletionBody } from './base.js';
import { estimateTokens } from '../pricing/tokenizer.js';
import { providerModels, defaultModelId, resolveModelId } from './models.js';

const BASE_URL_GLOBAL = 'https://api.moonshot.ai/v1';
const BASE_URL_CN = 'https://api.moonshot.cn/v1';
const MAX_ROUNDS = 8;

export interface KimiOptions {
  region?: 'global' | 'cn';
}

const WEB_SEARCH_TOOL = { type: 'builtin_function', function: { name: '$web_search' } };

export const kimiProvider: Provider = {
  id: 'kimi',
  label: 'Kimi K2.6',
  defaultModelId: defaultModelId.kimi,
  models: providerModels.kimi,

  async run(req: RunRequest, apiKey: string): Promise<RunResult> {
    const start = Date.now();
    const modelId = resolveModelId('kimi', req.modelId);
    const options = (req.options ?? {}) as KimiOptions;
    const baseUrl = options.region === 'cn' ? BASE_URL_CN : BASE_URL_GLOBAL;
    let ttftMs: number | undefined;
    let usage: TokenUsage = emptyUsage();
    let rounds = 0;
    const rawResponses: unknown[] = [];
    const sources: RunResult['sources'] = [];

    const messages: ChatMessage[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    messages.push({ role: 'user', content: req.prompt });

    try {
      let finalContent = '';
      let finalReasoning = '';

      for (let round = 0; round < MAX_ROUNDS; round++) {
        rounds = round + 1;
        req.onDelta?.({ type: 'round', round: rounds });

        const body: ChatCompletionBody = {
          model: modelId,
          messages,
          temperature: req.temperature ?? 1,
          max_tokens: req.maxTokens ?? 8192
        };
        if (req.webSearch) {
          body.tools = [WEB_SEARCH_TOOL];
          // $web_search is documented as incompatible with thinking mode on K2.6.
          body.extra_body = { thinking: { type: 'disabled' } };
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

        rawResponses.push(result.raw);

        const roundUsage = mapCommonUsage(result.usage);
        if (!result.usage) {
          roundUsage.inputTokens = estimateTokens(messages.map((m) => m.content ?? '').join('\n'));
          roundUsage.outputTokens = estimateTokens(result.content);
          roundUsage.totalTokens = roundUsage.inputTokens + roundUsage.outputTokens;
        }
        usage = addUsage(usage, roundUsage);

        finalContent = result.content || finalContent;
        finalReasoning += result.reasoningContent;

        if (result.finishReason === 'tool_calls' && result.toolCalls.length > 0) {
          usage.webSearchCalls += result.toolCalls.length;
          messages.push({
            role: 'assistant',
            content: result.content || null,
            tool_calls: result.toolCalls as ToolCall[]
          });
          for (const call of result.toolCalls) {
            sources.push({
              title: '$web_search',
              url: '',
              snippet: call.function.arguments.slice(0, 300)
            });
            // Builtin function: Moonshot executes the search server-side; the
            // client must echo the same arguments back as the tool content.
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: call.function.arguments
            });
          }
          continue;
        }

        break;
      }

      return {
        providerId: 'kimi',
        modelId,
        status: 'success',
        content: finalContent,
        reasoningContent: finalReasoning || undefined,
        sources,
        usage,
        usageIsEstimated: false,
        latencyMs: Date.now() - start,
        ttftMs,
        rounds,
        rawResponse: rawResponses
      };
    } catch (err) {
      if (req.signal.aborted) {
        return {
          providerId: 'kimi',
          modelId,
          status: 'cancelled',
          content: '',
          sources,
          usage,
          usageIsEstimated: false,
          latencyMs: Date.now() - start,
          rounds,
          rawResponse: rawResponses,
          error: { code: 'cancelled', message: 'Annulé par l’utilisateur' }
        };
      }
      const code = err instanceof ProviderHttpError ? err.code : 'network_error';
      const message = err instanceof Error ? err.message : String(err);
      return {
        providerId: 'kimi',
        modelId,
        status: 'error',
        content: '',
        sources,
        usage,
        usageIsEstimated: false,
        latencyMs: Date.now() - start,
        rounds,
        rawResponse: rawResponses,
        error: { code, message }
      };
    }
  },

  async testKey(apiKey: string): Promise<boolean> {
    try {
      const res = await fetch(`${BASE_URL_GLOBAL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: defaultModelId.kimi, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async listModels(apiKey: string, options?: Record<string, unknown>): Promise<string[]> {
    const region = (options as KimiOptions | undefined)?.region;
    return fetchModelList(region === 'cn' ? BASE_URL_CN : BASE_URL_GLOBAL, apiKey);
  }
};
