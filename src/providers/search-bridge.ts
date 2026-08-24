import type { TokenUsage } from './types.js';
import { emptyUsage } from './types.js';

export interface BridgeSearchResult {
  sources: { title: string; url: string; snippet?: string }[];
  usage: TokenUsage;
}

/**
 * Runs a minimal "search only" call against another provider (Qwen or GLM)
 * purely to fetch fresh web sources for DeepSeek, which has no documented
 * native web search on its public Chat Completions API. The tokens spent
 * here are folded into DeepSeek's own cost so the comparison stays honest.
 */
export async function runSearchOnlyBridge(
  userPrompt: string,
  bridgeProviderId: 'qwen' | 'glm',
  apiKey: string | undefined,
  signal: AbortSignal
): Promise<BridgeSearchResult> {
  if (!apiKey) {
    return { sources: [], usage: emptyUsage() };
  }

  const searchQuery = `Recherche web les informations les plus récentes et fiables pour répondre à cette demande, puis liste uniquement les sources trouvées (titre + URL), sans rédiger de réponse longue :\n\n${userPrompt}`;

  if (bridgeProviderId === 'qwen') {
    const { qwenProvider } = await import('./qwen.js');
    const result = await qwenProvider.run(
      {
        prompt: searchQuery,
        webSearch: true,
        maxTokens: 800,
        temperature: 0.2,
        signal,
        options: { searchStrategy: 'turbo' }
      },
      apiKey
    );
    return { sources: result.sources, usage: result.usage };
  }

  const { glmProvider } = await import('./glm.js');
  const result = await glmProvider.run(
    {
      prompt: searchQuery,
      webSearch: true,
      maxTokens: 800,
      temperature: 0.2,
      signal
    },
    apiKey
  );
  return { sources: result.sources, usage: result.usage };
}
