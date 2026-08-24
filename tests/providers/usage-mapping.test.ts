import { describe, expect, it, vi, afterEach } from 'vitest';
import { qwenProvider } from '../../src/providers/qwen.js';
import { glmProvider } from '../../src/providers/glm.js';
import { deepseekProvider } from '../../src/providers/deepseek.js';

function sseResponse(events: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    }
  });
  return new Response(body, { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('qwenProvider usage + sources mapping', () => {
  it('maps search_info.search_results to RunResult.sources and marks a web search call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            choices: [{ delta: { content: 'Réponse.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
            search_info: { search_results: [{ title: 'Site officiel', url: 'https://example.com', snippet: 'Extrait' }] }
          }
        ])
      )
    );

    const result = await qwenProvider.run(
      { prompt: 'test', webSearch: true, signal: new AbortController().signal },
      'sk-fake'
    );

    expect(result.usage.inputTokens).toBe(50);
    expect(result.usage.webSearchCalls).toBe(1);
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].url).toBe('https://example.com');
  });
});

describe('glmProvider usage + sources mapping', () => {
  it('maps web_search results and charges a web search call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            choices: [{ delta: { content: 'Réponse GLM.' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 80, completion_tokens: 30, total_tokens: 110 },
            web_search: [{ title: 'Guide Michelin', link: 'https://guide.michelin.com/x', content: 'Extrait' }]
          }
        ])
      )
    );

    const result = await glmProvider.run(
      { prompt: 'test', webSearch: true, signal: new AbortController().signal },
      'sk-fake'
    );

    expect(result.usage.webSearchCalls).toBe(1);
    expect(result.sources[0].title).toBe('Guide Michelin');
  });
});

describe('deepseekProvider bridge mode', () => {
  it('folds the bridge provider usage into the DeepSeek cost and flags webSearchBridged', async () => {
    const bridgeResponse = sseResponse([
      {
        choices: [{ delta: { content: 'Sources trouvées.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 },
        search_info: { search_results: [{ title: 'Source pontée', url: 'https://bridge.example.com' }] }
      }
    ]);
    const deepseekResponse = sseResponse([
      {
        choices: [{ delta: { content: 'Réponse DeepSeek.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 200, completion_tokens: 60, prompt_cache_hit_tokens: 20, total_tokens: 260 }
      }
    ]);

    const fetchMock = vi.fn().mockResolvedValueOnce(bridgeResponse).mockResolvedValueOnce(deepseekResponse);
    vi.stubGlobal('fetch', fetchMock);

    const result = await deepseekProvider.run(
      {
        prompt: 'Évalue ce restaurant',
        webSearch: true,
        signal: new AbortController().signal,
        options: { webSearchMode: 'bridge', bridgeProviderId: 'qwen', bridgeProviderApiKey: 'sk-bridge' }
      },
      'sk-deepseek'
    );

    expect(result.webSearchBridged).toBe(true);
    expect(result.sources[0].url).toBe('https://bridge.example.com');
    // usage folds bridge tokens (40 in / 10 out) + deepseek tokens (200 in / 60 out)
    expect(result.usage.inputTokens).toBe(240);
    expect(result.usage.outputTokens).toBe(70);
    expect(result.usage.cachedInputTokens).toBe(20);
  });
});
