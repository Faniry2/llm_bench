import { describe, expect, it, vi, afterEach } from 'vitest';
import { qwenProvider } from '../../src/providers/qwen.js';
import { glmProvider } from '../../src/providers/glm.js';
import { deepseekProvider } from '../../src/providers/deepseek.js';
import { chatgptProvider } from '../../src/providers/chatgpt.js';

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

describe('chatgptProvider bridge mode', () => {
  it('folds the bridge provider usage into the ChatGPT cost and flags webSearchBridged', async () => {
    const bridgeResponse = sseResponse([
      {
        choices: [{ delta: { content: 'Sources trouvées.' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 },
        search_info: { search_results: [{ title: 'Source pontée', url: 'https://bridge.example.org' }] }
      }
    ]);
    const chatgptResponse = sseResponse([
      {
        choices: [{ delta: { content: 'Réponse ChatGPT.' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 40,
          prompt_tokens_details: { cached_tokens: 10 },
          total_tokens: 190
        }
      }
    ]);

    const fetchMock = vi.fn().mockResolvedValueOnce(bridgeResponse).mockResolvedValueOnce(chatgptResponse);
    vi.stubGlobal('fetch', fetchMock);

    const result = await chatgptProvider.run(
      {
        prompt: 'Évalue ce restaurant',
        webSearch: true,
        signal: new AbortController().signal,
        options: { webSearchMode: 'bridge', bridgeProviderId: 'qwen', bridgeProviderApiKey: 'sk-bridge' }
      },
      'sk-openai'
    );

    expect(result.webSearchBridged).toBe(true);
    expect(result.sources[0].url).toBe('https://bridge.example.org');
    // usage folds bridge tokens (30 in / 8 out) + chatgpt tokens (150 in / 40 out)
    expect(result.usage.inputTokens).toBe(180);
    expect(result.usage.outputTokens).toBe(48);
    expect(result.usage.cachedInputTokens).toBe(10);

    // second HTTP call is the OpenAI chat completion with the default model params
    const chatBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(chatBody.model).toBe('gpt-5.6-luna');
    expect(chatBody.max_completion_tokens).toBe(8192);
    expect(chatBody.max_tokens).toBeUndefined();
  });

  it('honours a per-run modelId override in the request body and result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          {
            choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
          }
        ])
      )
    );

    const result = await chatgptProvider.run(
      { prompt: 'ping', webSearch: false, modelId: 'gpt-4o', signal: new AbortController().signal },
      'sk-openai'
    );

    expect(result.modelId).toBe('gpt-4o');
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    expect(body.model).toBe('gpt-4o');
  });
});
