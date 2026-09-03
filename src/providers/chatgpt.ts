import type { Provider, RunRequest, RunResult, TokenUsage } from './types.js';
import { emptyUsage, addUsage } from './types.js';
import { mapCommonUsage, streamChatCompletion, ProviderHttpError, type ChatMessage } from './base.js';
import { estimateTokens } from '../pricing/tokenizer.js';
import { runSearchOnlyBridge } from './search-bridge.js';
import { providerModels, defaultModelId, resolveModelId } from './models.js';

const BASE_URL = 'https://api.openai.com/v1';

export interface ChatgptOptions {
  /**
   * OpenAI expose une recherche web native uniquement via la Responses API
   * (`tools: [{ type: 'web_search' }]`), non couverte par le client Chat
   * Completions partagé de cette app. On garde donc le même schéma que DeepSeek :
   * mode `bridge` (recherche via Qwen/GLM, sources injectées dans le prompt système).
   */
  webSearchMode?: 'native' | 'bridge';
  bridgeProviderApiKey?: string;
  bridgeProviderId?: 'qwen' | 'glm';
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
    const mode = options.webSearchMode ?? 'bridge';
    let usage: TokenUsage = emptyUsage();
    let sources: RunResult['sources'] = [];
    let webSearchBridged = false;
    let systemPrompt = req.system ?? '';
    let ttftMs: number | undefined;

    try {
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
          max_completion_tokens: req.maxTokens ?? 4096
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
