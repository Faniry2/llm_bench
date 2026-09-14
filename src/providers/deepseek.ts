import type { Provider, RunRequest, RunResult, TokenUsage } from './types.js';
import { emptyUsage, addUsage } from './types.js';
import { mapCommonUsage, streamChatCompletion, ProviderHttpError, type ChatMessage } from './base.js';
import { estimateTokens } from '../pricing/tokenizer.js';
import { runSearchOnlyBridge } from './search-bridge.js';
import { providerModels, defaultModelId, resolveModelId } from './models.js';

const BASE_URL = 'https://api.deepseek.com/v1';

export interface DeepseekOptions {
  webSearchMode?: 'native' | 'bridge';
  bridgeProviderApiKey?: string;
  bridgeProviderId?: 'qwen' | 'glm';
}

export const deepseekProvider: Provider = {
  id: 'deepseek',
  label: 'DeepSeek V4 Pro',
  defaultModelId: defaultModelId.deepseek,
  models: providerModels.deepseek,

  async run(req: RunRequest, apiKey: string): Promise<RunResult> {
    const start = Date.now();
    const modelId = resolveModelId('deepseek', req.modelId);
    const options = (req.options ?? {}) as DeepseekOptions;
    const mode = options.webSearchMode ?? 'bridge';
    let usage: TokenUsage = emptyUsage();
    let sources: RunResult['sources'] = [];
    let webSearchBridged = false;
    let systemPrompt = req.system ?? '';
    let ttftMs: number | undefined;

    try {
      if (req.webSearch) {
        if (mode === 'bridge') {
          webSearchBridged = true;
          const bridge = await runSearchOnlyBridge(req.prompt, options.bridgeProviderId ?? 'qwen', options.bridgeProviderApiKey, req.signal);
          usage = addUsage(usage, bridge.usage);
          sources = bridge.sources;
          const sourcesBlock = sources
            .map((s, i) => `[${i + 1}] ${s.title} — ${s.url}${s.snippet ? `\n${s.snippet}` : ''}`)
            .join('\n\n');
          systemPrompt = `${systemPrompt}\n\n<sources>\n${sourcesBlock || 'Aucune source trouvée.'}\n</sources>\n\nUtilise ces sources récentes pour répondre. Cite-les si pertinent.`;
        }
        // mode 'native': DeepSeek's public Chat Completions API does not expose a
        // documented server-side web_search tool as of writing (see README). We
        // still send the request normally; if DeepSeek adds a native flag later,
        // set it here once confirmed in https://api-docs.deepseek.com.
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
          temperature: req.temperature ?? 1,
          max_tokens: req.maxTokens ?? 8192
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
        providerId: 'deepseek',
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
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: defaultModelId.deepseek, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 })
      });
      return res.ok;
    } catch {
      return false;
    }
  }
};

function cancelledResult(
  modelId: string,
  start: number,
  usage: TokenUsage,
  sources: RunResult['sources'],
  webSearchBridged: boolean
): RunResult {
  return {
    providerId: 'deepseek',
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
    providerId: 'deepseek',
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
