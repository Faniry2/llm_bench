import type { WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { getProvider } from '../providers/registry.js';
import type { ProviderId, RunResult, StreamDelta } from '../providers/types.js';
import { getApiKey } from './secure-store.js';
import { appendRunLog } from './logger.js';

export interface ModelRunConfig {
  providerId: ProviderId;
  modelId?: string;
  webSearch: boolean;
  temperature?: number;
  maxTokens?: number;
  options?: Record<string, unknown>;
}

export interface StartRunRequest {
  prompt: string;
  system?: string;
  models: ModelRunConfig[];
  timeoutMs?: number;
}

interface ActiveRun {
  controllers: Map<ProviderId, AbortController>;
}

const activeRuns = new Map<string, ActiveRun>();

export function startRun(sender: WebContents, req: StartRunRequest): string {
  const runId = randomUUID();
  const controllers = new Map<ProviderId, AbortController>();
  activeRuns.set(runId, { controllers });

  void appendRunLog(runId, { event: 'run:start', prompt: req.prompt, models: req.models });

  const tasks = req.models.map(async (model) => {
    const controller = new AbortController();
    controllers.set(model.providerId, controller);
    const provider = getProvider(model.providerId);
    const apiKey = getApiKey(model.providerId);

    if (!apiKey) {
      const result: RunResult = {
        providerId: model.providerId,
        modelId: model.modelId ?? provider.defaultModelId,
        status: 'error',
        content: '',
        sources: [],
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0, webSearchCalls: 0 },
        usageIsEstimated: false,
        latencyMs: 0,
        rounds: 0,
        rawResponse: null,
        error: { code: 'missing_api_key', message: 'Aucune clé API configurée pour ce fournisseur.' }
      };
      sender.send('run:result', { runId, result });
      return result;
    }

    // Bridged web search (deepseek, chatgpt): resolve the bridge provider's key
    // in the main process so the renderer never has to hold it.
    const options: Record<string, unknown> = { ...model.options };
    if (options.webSearchMode === 'bridge' && !options.bridgeProviderApiKey) {
      const bridgeId = (options.bridgeProviderId as ProviderId) ?? 'qwen';
      const bridgeKey = getApiKey(bridgeId);
      if (bridgeKey) options.bridgeProviderApiKey = bridgeKey;
    }

    try {
      const result = await provider.run(
        {
          prompt: req.prompt,
          system: req.system,
          webSearch: model.webSearch,
          modelId: model.modelId,
          temperature: model.temperature,
          maxTokens: model.maxTokens,
          signal: controller.signal,
          options,
          onDelta: (delta: StreamDelta) => {
            sender.send('run:delta', { runId, providerId: model.providerId, delta });
          }
        },
        apiKey
      );
      void appendRunLog(runId, { event: 'run:result', providerId: model.providerId, result });
      if (!sender.isDestroyed()) sender.send('run:result', { runId, result });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result: RunResult = {
        providerId: model.providerId,
        modelId: model.modelId ?? provider.defaultModelId,
        status: 'error',
        content: '',
        sources: [],
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0, webSearchCalls: 0 },
        usageIsEstimated: false,
        latencyMs: 0,
        rounds: 0,
        rawResponse: null,
        error: { code: 'unexpected_error', message }
      };
      if (!sender.isDestroyed()) sender.send('run:result', { runId, result });
      return result;
    }
  });

  Promise.allSettled(tasks).then(() => {
    activeRuns.delete(runId);
    if (!sender.isDestroyed()) sender.send('run:done', { runId });
  });

  return runId;
}

export function cancelRun(runId: string, providerId?: ProviderId): void {
  const run = activeRuns.get(runId);
  if (!run) return;
  if (providerId) {
    run.controllers.get(providerId)?.abort();
  } else {
    for (const controller of run.controllers.values()) controller.abort();
  }
}
